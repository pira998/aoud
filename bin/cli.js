#!/usr/bin/env node

import { program } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import localtunnel from 'localtunnel';
import ngrok from '@ngrok/ngrok';
import qrcode from 'qrcode-terminal';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.claude-mobile-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure config directory exists
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Load or create config
function loadConfig() {
  ensureConfigDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    // Ignore errors, return default
  }
  return {};
}

// Save config
function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Generate a random auth token
function generateAuthToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Get local IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}

// Wait for server to be ready
async function waitForServer(port, maxAttempts = 30) {
  const http = await import('http');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error('Not ready'));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return true;
    } catch (e) {
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return false;
}

// Create a tunnel (ngrok or localtunnel)
async function createTunnel(port, provider = 'ngrok', ngrokToken) {
  console.log(c('cyan', '🔄 Creating tunnel...'));

  try {
    if (provider === 'ngrok') {
      if (!ngrokToken) {
        console.log(c('yellow', '⚠️  ngrok requires an auth token'));
        console.log(c('dim', '   Get one free at: https://ngrok.com'));
        console.log(c('dim', '   Then use: claude-bridge start --tunnel --ngrok-token YOUR_TOKEN'));
        console.log('');
        return null;
      }

      const listener = await ngrok.forward({
        addr: port,
        authtoken: ngrokToken
      });
      console.log(c('green', '✅ Tunnel created with ngrok'));
      return {
        url: listener.url(),
        provider: 'ngrok',
        close: () => listener.close()
      };
    } else if (provider === 'localtunnel') {
      const tunnel = await localtunnel({ port });
      console.log(c('green', '✅ Tunnel created with localtunnel'));
      console.log(c('yellow', '⚠️  Note: localtunnel can be unreliable. Consider using ngrok.'));

      // Handle tunnel errors silently - localtunnel often has connection issues
      tunnel.on('error', () => {
        // Suppress repeated error messages
      });

      return {
        url: tunnel.url,
        provider: 'localtunnel',
        close: () => tunnel.close()
      };
    } else {
      console.log(c('red', `❌ Unknown tunnel provider: ${provider}`));
      return null;
    }
  } catch (error) {
    console.error(c('red', '❌ Failed to create tunnel:'), error.message);
    console.log(c('yellow', '💡 Falling back to local network only'));
    console.log('');
    return null;
  }
}

// Display QR code with connection URL
function displayQRCode(url, wsUrl, authToken, showQR = true) {
  console.log('');
  console.log(c('bright', c('green', '╔════════════════════════════════════════════════════════════╗')));
  console.log(c('bright', c('green', '║') + c('cyan', '      🚀 Claude Mobile Bridge - Ready to Connect! 🚀       ') + c('green', '║')));
  console.log(c('bright', c('green', '╚════════════════════════════════════════════════════════════╝')));
  console.log('');

  console.log(c('bright', '📱 Mobile Connection:'));
  console.log(c('cyan', `   ${url}`));
  console.log('');

  if (showQR) {
    console.log(c('yellow', '📷 Scan this QR code with your mobile browser:'));
    console.log('');
    qrcode.generate(url, { small: true });
    console.log('');
  }

  console.log(c('dim', '────────────────────────────────────────────────────────────'));
  console.log('');
  console.log(c('bright', '🔌 WebSocket URL:'));
  console.log(c('magenta', `   ${wsUrl}`));
  console.log('');
  console.log(c('bright', '🔐 Auth Token:'));
  console.log(c('yellow', `   ${authToken}`));
  console.log('');
  console.log(c('dim', '────────────────────────────────────────────────────────────'));
  console.log('');
}

program
  .name('claude-bridge')
  .description('Claude Mobile Bridge - Control Claude Code from your mobile phone')
  .version('1.0.0');

program
  .command('start')
  .description('Start the bridge server')
  .option('-p, --port <port>', 'Server port', '3001')
  .option('--project <path>', 'Initial project path', process.cwd())
  .option('--auth <token>', 'Authentication token (auto-generated if not provided)')
  .option('--no-auth', 'Disable authentication')
  .option('--tls', 'Enable TLS/HTTPS (experimental)')
  .option('--tunnel', 'Enable automatic tunneling (local network only by default)')
  .option('--tunnel-provider <provider>', 'Tunnel provider: ngrok or localtunnel', 'ngrok')
  .option('--ngrok-token <token>', 'ngrok authtoken (required for ngrok)')
  .option('--no-qr', 'Disable QR code display')
  .action(async (options) => {
    const config = loadConfig();

    // Handle auth token
    let authToken = options.auth;
    if (options.auth === true) {
      // --no-auth was not passed, use or generate token
      if (!authToken) {
        authToken = config.authToken;
        if (!authToken) {
          authToken = generateAuthToken();
          config.authToken = authToken;
          saveConfig(config);
        }
      }
    }

    const port = parseInt(options.port);
    console.log('');
    console.log(c('bright', c('magenta', '╔════════════════════════════════════════════════════════════╗')));
    console.log(c('bright', c('magenta', '║') + c('white', '         🚀 Starting Claude Mobile Bridge 🚀             ') + c('magenta', '║')));
    console.log(c('bright', c('magenta', '╚════════════════════════════════════════════════════════════╝')));
    console.log('');

    // Set environment variables
    const env = {
      ...process.env,
      PORT: port,
      BRIDGE_SILENT: 'true', // Suppress server's own startup messages
    };

    if (authToken) {
      env.BRIDGE_AUTH_TOKEN = authToken;
    }

    // Find the server entry point
    const serverPath = path.resolve(__dirname, '../server/dist/server/src/index.js');
    const serverSrcPath = path.resolve(__dirname, '../server/src/index.ts');

    let command, args;

    if (fs.existsSync(serverPath)) {
      // Use compiled version
      command = 'node';
      args = [serverPath];
    } else if (fs.existsSync(serverSrcPath)) {
      // Use tsx for development
      command = 'npx';
      args = ['tsx', serverSrcPath];
    } else {
      console.error(c('red', '❌ Error: Server not found. Please run "npm run build" first.'));
      process.exit(1);
    }

    // Start the server
    const child = spawn(command, args, {
      env,
      stdio: 'pipe',
      cwd: options.project,
    });

    // Forward stdout/stderr
    child.stdout.on('data', (data) => process.stdout.write(data));
    child.stderr.on('data', (data) => process.stderr.write(data));

    child.on('error', (err) => {
      console.error(c('red', '❌ Failed to start server:'), err.message);
      process.exit(1);
    });

    // Wait for server to be ready
    console.log(c('cyan', '⏳ Waiting for server to start...'));
    const serverReady = await waitForServer(port);

    if (!serverReady) {
      console.error(c('red', '❌ Server failed to start within 30 seconds'));
      child.kill();
      process.exit(1);
    }

    console.log(c('green', '✅ Server started successfully'));
    console.log('');

    // Create tunnel if enabled
    let tunnel = null;
    if (options.tunnel) {
      tunnel = await createTunnel(port, options.tunnelProvider, options.ngrokToken);
    }

    // Get connection URL
    const localIPs = getLocalIPs();
    const primaryIP = localIPs[0] || 'localhost';

    // Always show local network info prominently
    if (!tunnel) {
      // Local network only
      const mobileUrl = `http://${primaryIP}:${port}`;
      const wsUrl = `ws://${primaryIP}:${port}`;

      if (!options.noQr) {
        displayQRCode(mobileUrl, wsUrl, authToken || 'None', true);
      }

      console.log(c('bright', '📋 Local Network Connection:'));
      console.log('');
      console.log(c('green', '   Primary IP:'));
      console.log(c('cyan', `   http://${primaryIP}:${port}`));
      console.log('');

      if (localIPs.length > 1) {
        console.log(c('dim', '   Other available IPs:'));
        localIPs.slice(1).forEach(ip => {
          console.log(c('dim', `   • http://${ip}:${port}`));
        });
        console.log('');
      }

      console.log(c('yellow', '   💡 To access from internet, use:'));
      console.log(c('dim', '      claude-bridge start --tunnel --ngrok-token YOUR_TOKEN'));
      console.log(c('dim', '      Get free ngrok token at: https://ngrok.com'));
    } else {
      // Tunnel available
      const mobileUrl = tunnel.url;
      const wsUrl = tunnel.url.replace('https://', 'wss://').replace('http://', 'ws://');

      if (!options.noQr) {
        displayQRCode(mobileUrl, wsUrl, authToken || 'None', true);
      }

      console.log(c('bright', '📋 Connection Info:'));
      console.log('');
      console.log(c('green', `   ✓ Internet Access: ${tunnel.provider}`));
      console.log(c('cyan', `   ✓ Public URL: ${tunnel.url}`));
      console.log('');
      console.log(c('dim', `   Local fallback: http://${primaryIP}:${port}`));
    }

    console.log('');
    console.log(c('bright', '📂 Project:'), c('cyan', options.project));
    console.log('');
    console.log(c('dim', '────────────────────────────────────────────────────────────'));
    console.log('');
    console.log(c('yellow', '⌨️  Press Ctrl+C to stop server'));
    console.log('');

    // Handle cleanup on exit
    const cleanup = () => {
      console.log('');
      console.log('');
      console.log(c('yellow', '🛑 Shutting down...'));
      if (tunnel) {
        console.log(c('cyan', '   Closing tunnel...'));
        tunnel.close();
      }
      console.log(c('cyan', '   Stopping server...'));
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
        console.log(c('green', '✅ Goodbye!'));
        process.exit(0);
      }, 3000);
    };

    child.on('exit', (code) => {
      if (tunnel) tunnel.close();
      process.exit(code || 0);
    });

    // Handle signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });

program
  .command('config')
  .description('Show or update configuration')
  .option('--show', 'Show current configuration')
  .option('--reset-token', 'Generate a new auth token')
  .option('--set-token <token>', 'Set a specific auth token')
  .action((options) => {
    const config = loadConfig();

    if (options.resetToken) {
      config.authToken = generateAuthToken();
      saveConfig(config);
      console.log('New auth token generated:', config.authToken);
      return;
    }

    if (options.setToken) {
      config.authToken = options.setToken;
      saveConfig(config);
      console.log('Auth token updated');
      return;
    }

    // Show config by default
    console.log('Configuration file:', CONFIG_FILE);
    console.log('');
    console.log('Current configuration:');
    console.log(JSON.stringify(config, null, 2));
  });

program
  .command('info')
  .description('Show connection information')
  .action(() => {
    const localIPs = getLocalIPs();
    const config = loadConfig();

    console.log('Connection Information');
    console.log('======================');
    console.log('');
    console.log('Local IP addresses:');
    localIPs.forEach((ip, i) => {
      console.log(`  ${i + 1}. ${ip}`);
    });
    console.log('');
    console.log('WebSocket URLs:');
    localIPs.forEach((ip) => {
      console.log(`  ws://${ip}:3001`);
    });
    console.log('');
    if (config.authToken) {
      console.log('Auth token:', config.authToken);
    } else {
      console.log('Auth token: Not set (will be generated on first start)');
    }
    console.log('');
    console.log('Config directory:', CONFIG_DIR);

    // Check TLS certificates
    const keyPath = path.join(CONFIG_DIR, 'server.key');
    const certPath = path.join(CONFIG_DIR, 'server.crt');
    const hasTLS = fs.existsSync(keyPath) && fs.existsSync(certPath);
    console.log('');
    console.log('TLS Certificates:', hasTLS ? 'Found' : 'Not generated');
    if (hasTLS) {
      console.log(`  Key:  ${keyPath}`);
      console.log(`  Cert: ${certPath}`);
    }
  });

program
  .command('tls')
  .description('Manage TLS certificates')
  .option('--generate', 'Generate new self-signed certificates')
  .option('--delete', 'Delete existing certificates')
  .option('--info', 'Show certificate information')
  .action(async (options) => {
    const keyPath = path.join(CONFIG_DIR, 'server.key');
    const certPath = path.join(CONFIG_DIR, 'server.crt');
    const hasTLS = fs.existsSync(keyPath) && fs.existsSync(certPath);

    if (options.delete) {
      if (hasTLS) {
        fs.unlinkSync(keyPath);
        fs.unlinkSync(certPath);
        console.log('TLS certificates deleted');
      } else {
        console.log('No certificates to delete');
      }
      return;
    }

    if (options.generate) {
      if (hasTLS) {
        console.log('Certificates already exist. Use --delete first to regenerate.');
        return;
      }

      // Generate certificates using openssl
      const localIPs = getLocalIPs();
      const ips = ['127.0.0.1', ...localIPs];
      const hostname = os.hostname();

      const sanEntries = ips.map((ip, i) => `IP.${i + 1} = ${ip}`).join('\n');

      const opensslConfig = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = US
ST = State
L = City
O = Claude Mobile Bridge
CN = ${hostname}

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment

[alt_names]
DNS.1 = localhost
DNS.2 = ${hostname}
${sanEntries}
`;

      ensureConfigDir();
      const configPath = path.join(CONFIG_DIR, 'openssl.cnf');

      try {
        fs.writeFileSync(configPath, opensslConfig);

        const { execSync } = await import('child_process');
        execSync(
          `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -config "${configPath}"`,
          { stdio: 'pipe' }
        );

        fs.unlinkSync(configPath);

        console.log('TLS certificates generated successfully!');
        console.log(`  Key:  ${keyPath}`);
        console.log(`  Cert: ${certPath}`);
        console.log(`  Valid for: 365 days`);
        console.log(`  IPs: ${ips.join(', ')}`);
        console.log('');
        console.log('Note: You may need to accept the self-signed certificate in your browser.');
      } catch (error) {
        console.error('Failed to generate certificates. Make sure openssl is installed.');
        console.error(error.message);
      }
      return;
    }

    // Default: show info
    console.log('TLS Certificate Status');
    console.log('======================');
    console.log('');
    if (hasTLS) {
      console.log('Status: Certificates found');
      console.log(`  Key:  ${keyPath}`);
      console.log(`  Cert: ${certPath}`);
    } else {
      console.log('Status: No certificates');
      console.log('');
      console.log('To generate certificates, run:');
      console.log('  claude-bridge tls --generate');
    }
  });

// Default command is start
program.action(() => {
  program.help();
});

program.parse();
