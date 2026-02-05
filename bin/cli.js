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

// Create a tunnel (localtunnel or ngrok)
async function createTunnel(port, provider = 'localtunnel', ngrokToken) {
  console.log('🔄 Creating tunnel...');

  try {
    if (provider === 'ngrok' && ngrokToken) {
      const listener = await ngrok.forward({
        addr: port,
        authtoken: ngrokToken
      });
      console.log('✅ Tunnel created with ngrok');
      return {
        url: listener.url(),
        provider: 'ngrok',
        close: () => listener.close()
      };
    } else {
      const tunnel = await localtunnel({ port });
      console.log('✅ Tunnel created with localtunnel');
      return {
        url: tunnel.url,
        provider: 'localtunnel',
        close: () => tunnel.close()
      };
    }
  } catch (error) {
    console.error('❌ Failed to create tunnel:', error.message);
    console.log('💡 Falling back to local network only\n');
    return null;
  }
}

// Display QR code with connection URL
function displayQRCode(url, showQR = true) {
  const separator = '═'.repeat(62);
  console.log(`\n╔${separator}╗`);
  console.log('║         Claude Mobile Bridge - Ready to Connect          ║');
  console.log(`╠${separator}╣`);
  console.log('║                                                          ║');
  const urlPadded = url.padEnd(40).slice(0, 40);
  console.log(`║  🌐 Public URL:  ${urlPadded}           ║`);
  console.log('║                                                          ║');

  if (showQR) {
    console.log('║  📱 Scan QR Code:                                        ║');
    console.log(`╚${separator}╝\n`);

    qrcode.generate(url, { small: true });

    console.log('\n✅ Server ready! Scan the QR code with your mobile device');
  } else {
    console.log(`╚${separator}╝`);
  }

  console.log('\n💡 Connection URL saved. Mobile app will auto-connect.\n');
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
  .option('--tunnel', 'Enable automatic tunneling (default: true)', true)
  .option('--no-tunnel', 'Disable automatic tunneling')
  .option('--tunnel-provider <provider>', 'Tunnel provider: localtunnel or ngrok', 'localtunnel')
  .option('--ngrok-token <token>', 'ngrok authtoken (optional)')
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
    console.log('🚀 Starting Claude Mobile Bridge...\n');

    // Set environment variables
    const env = {
      ...process.env,
      PORT: port,
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
      console.error('Error: Server not found. Please run "npm run build" first.');
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
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });

    // Wait for server to be ready
    console.log('⏳ Waiting for server to start...');
    const serverReady = await waitForServer(port);

    if (!serverReady) {
      console.error('❌ Server failed to start within 30 seconds');
      child.kill();
      process.exit(1);
    }

    console.log('✅ Server started successfully\n');

    // Create tunnel if enabled
    let tunnel = null;
    if (options.tunnel) {
      tunnel = await createTunnel(port, options.tunnelProvider, options.ngrokToken);
    }

    // Get connection URL
    const localIPs = getLocalIPs();
    const primaryIP = localIPs[0] || 'localhost';
    const connectionUrl = tunnel ? tunnel.url : `http://${primaryIP}:${port}`;

    // Convert to WebSocket URL
    const wsUrl = connectionUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    // Generate QR code with special connect URL
    const qrUrl = `${connectionUrl}?connect=${encodeURIComponent(wsUrl)}`;

    if (!options.noQr) {
      displayQRCode(qrUrl, true);
    } else {
      console.log(`\n✅ Server running at: ${connectionUrl}`);
      console.log(`   WebSocket URL: ${wsUrl}\n`);
    }

    if (tunnel) {
      console.log(`✨ Tunnel provider: ${tunnel.provider}`);
      if (tunnel.provider === 'localtunnel') {
        console.log('💡 For faster connection, use: --tunnel-provider ngrok --ngrok-token YOUR_TOKEN\n');
      }
    } else {
      console.log(`📍 Local network only (use --tunnel to enable internet access)\n`);
    }

    console.log(`📂 Project: ${options.project}`);
    if (authToken) {
      console.log(`🔑 Auth Token: ${authToken.slice(0, 20)}...`);
    }
    console.log('\nPress Ctrl+C to stop server\n');

    // Handle cleanup on exit
    const cleanup = () => {
      console.log('\n\n🛑 Shutting down...');
      if (tunnel) {
        console.log('Closing tunnel...');
        tunnel.close();
      }
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
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
