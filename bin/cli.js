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
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import terminalSize from 'terminal-size';
import gradient from 'gradient-string';
import Table from 'cli-table3';
import figlet from 'figlet';

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
  const spinner = ora('Creating tunnel...').start();

  try {
    if (provider === 'ngrok') {
      if (!ngrokToken) {
        spinner.warn('ngrok requires an auth token');
        console.log(chalk.dim('   Get one free at: https://ngrok.com'));
        console.log(chalk.dim('   Then use: claude-bridge start --tunnel --ngrok-token YOUR_TOKEN'));
        console.log('');
        return null;
      }

      const listener = await ngrok.forward({
        addr: port,
        authtoken: ngrokToken
      });
      spinner.succeed('Tunnel created with ngrok');
      return {
        url: listener.url(),
        provider: 'ngrok',
        close: () => listener.close()
      };
    } else if (provider === 'localtunnel') {
      const tunnel = await localtunnel({ port });
      spinner.succeed('Tunnel created with localtunnel');
      console.log(chalk.yellow('   ⚠️  Note: localtunnel can be unreliable. Consider using ngrok.'));

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
      spinner.fail(`Unknown tunnel provider: ${provider}`);
      return null;
    }
  } catch (error) {
    spinner.fail(`Failed to create tunnel: ${error.message}`);
    console.log(chalk.yellow('💡 Falling back to local network only'));
    console.log('');
    return null;
  }
}

// Display QR code with connection URL
function displayQRCode(url, wsUrl, authToken, showQR = true) {
  console.log('');

  // Check terminal size
  const { rows } = terminalSize();
  const hasSpaceForQR = rows >= 35; // Need at least 35 lines for FIGlet + QR + info

  // Header with FIGlet
  const readyText = figlet.textSync('Ready!', {
    font: 'Big',
    horizontalLayout: 'fitted',
    verticalLayout: 'default'
  });
  const header = gradient.rainbow.multiline(readyText) + '\n' + chalk.cyan.bold('    Connect your mobile device');

  console.log(boxen(header, {
    padding: 1,
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: 'double',
    borderColor: 'cyan',
    textAlignment: 'center'
  }));

  // Connection info table
  const table = new Table({
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    colWidths: [20, 50]
  });

  table.push(
    [chalk.bold('📱 Mobile URL'), chalk.cyan(url)],
    [chalk.bold('🔌 WebSocket'), chalk.magenta(wsUrl)],
    [chalk.bold('🔐 Auth Token'), authToken === 'None' ? chalk.yellow(authToken) : chalk.green(authToken.slice(0, 32) + '...')]
  );

  console.log(table.toString());
  console.log('');

  // QR code (only if terminal is tall enough and showQR is true)
  if (showQR && hasSpaceForQR) {
    console.log(chalk.bold('📷 Scan QR code with your mobile browser:'));
    console.log('');
    qrcode.generate(url, { small: true });
  } else if (showQR && !hasSpaceForQR) {
    console.log(chalk.dim('💡 QR code hidden (terminal too small). Resize or scroll up to see it.'));
  }

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
    let authToken;
    if (options.auth !== false) {
      // Auth is enabled (default) or a specific token was provided
      if (typeof options.auth === 'string') {
        // User provided a specific token via --auth TOKEN
        authToken = options.auth;
      } else {
        // Use saved token or generate a new one
        authToken = config.authToken;
        if (!authToken) {
          authToken = generateAuthToken();
          config.authToken = authToken;
          saveConfig(config);
        }
      }
    }
    // If options.auth === false (--no-auth was passed), authToken stays undefined

    const port = parseInt(options.port);

    // Startup banner with FIGlet
    console.log('');
    const figletText = figlet.textSync('Claude Bridge', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 80,
      whitespaceBreak: true
    });
    console.log(gradient.pastel.multiline(figletText));
    console.log(chalk.cyan.bold('        Mobile Control for Claude Code\n'));
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
      console.error(chalk.red('❌ Error: Server not found. Please run "npm run build" first.'));
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
      console.error(chalk.red('❌ Failed to start server:'), err.message);
      process.exit(1);
    });

    // Wait for server to be ready with spinner
    const spinner = ora('Starting server...').start();
    const serverReady = await waitForServer(port);

    if (!serverReady) {
      spinner.fail('Server failed to start within 30 seconds');
      child.kill();
      process.exit(1);
    }

    spinner.succeed('Server started successfully');
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

      // Generate QR code URL with connect parameter and auth token
      const qrUrl = `${mobileUrl}?connect=${encodeURIComponent(wsUrl)}&token=${encodeURIComponent(authToken || '')}`;

      if (!options.noQr) {
        displayQRCode(qrUrl, wsUrl, authToken || 'None', true);
      }

      // Network info box
      let networkInfo = chalk.bold.cyan('Local Network Connection\n\n');
      networkInfo += chalk.green('Primary IP:\n');
      networkInfo += chalk.cyan.bold(`http://${primaryIP}:${port}\n`);

      if (localIPs.length > 1) {
        networkInfo += chalk.dim('\nOther IPs:\n');
        localIPs.slice(1).forEach(ip => {
          networkInfo += chalk.dim(`• http://${ip}:${port}\n`);
        });
      }

      networkInfo += chalk.yellow('\n💡 Enable Internet Access:\n');
      networkInfo += chalk.dim('claude-bridge start --tunnel --ngrok-token TOKEN\n');
      networkInfo += chalk.dim('Get token: https://ngrok.com');

      console.log(boxen(networkInfo, {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'green'
      }));
    } else {
      // Tunnel available
      const mobileUrl = tunnel.url;
      const wsUrl = tunnel.url.replace('https://', 'wss://').replace('http://', 'ws://');

      // Generate QR code URL with connect parameter and auth token
      const qrUrl = `${mobileUrl}?connect=${encodeURIComponent(wsUrl)}&token=${encodeURIComponent(authToken || '')}`;

      if (!options.noQr) {
        displayQRCode(qrUrl, wsUrl, authToken || 'None', true);
      }

      let tunnelInfo = chalk.bold.green(`✓ Internet Access (${tunnel.provider})\n\n`);
      tunnelInfo += chalk.cyan.bold(`${tunnel.url}\n\n`);
      tunnelInfo += chalk.dim(`Local fallback: http://${primaryIP}:${port}`);

      console.log(boxen(tunnelInfo, {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan'
      }));
    }

    // Project and controls
    console.log(chalk.bold('📂 Project: ') + chalk.cyan(options.project));
    console.log('');
    console.log(chalk.yellow('⌨️  Press ') + chalk.bold('Ctrl+C') + chalk.yellow(' to stop server'));
    console.log('');

    // Handle cleanup on exit
    const cleanup = () => {
      console.log('');
      console.log('');
      const shutdownSpinner = ora('Shutting down...').start();

      if (tunnel) {
        shutdownSpinner.text = 'Closing tunnel...';
        tunnel.close();
      }

      shutdownSpinner.text = 'Stopping server...';
      child.kill('SIGTERM');

      setTimeout(() => {
        child.kill('SIGKILL');
        shutdownSpinner.succeed('Goodbye! 👋');
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
