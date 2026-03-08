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
import { Tunnel } from 'cloudflared';
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

const CONFIG_DIR = path.join(os.homedir(), '.aoud');
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

// Create a tunnel (ngrok, localtunnel, or cloudflared)
async function createTunnel(port, provider = 'cloudflared', ngrokToken) {
  const spinner = ora('Creating tunnel...').start();

  try {
    if (provider === 'ngrok') {
      if (!ngrokToken) {
        spinner.warn('ngrok requires an auth token');
        console.log(chalk.dim('   Get one free at: https://ngrok.com'));
        console.log(chalk.dim('   Then use: aoud start --tunnel --tunnel-provider ngrok --ngrok-token YOUR_TOKEN'));
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
    } else if (provider === 'cloudflared') {
      spinner.text = 'Starting Cloudflare Tunnel...';

      // Create cloudflared tunnel - pass URL as first parameter
      const tunnel = Tunnel.quick(`http://localhost:${port}`);

      // Wait for both URL and connection confirmation
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for tunnel (60s)'));
        }, 60000);

        let tunnelUrl = null;
        let isConnected = false;

        const checkComplete = () => {
          if (tunnelUrl && isConnected) {
            clearTimeout(timeout);
            resolve({ url: tunnelUrl });
          }
        };

        tunnel.once('url', (receivedUrl) => {
          tunnelUrl = receivedUrl;
          spinner.text = `Tunnel URL received: ${receivedUrl.substring(0, 50)}...`;
          checkComplete();
        });

        tunnel.once('connected', (conn) => {
          isConnected = true;
          spinner.text = `Connected to Cloudflare (${conn.location})`;
          checkComplete();
        });

        tunnel.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        tunnel.once('exit', (code) => {
          if (code !== 0 && code !== null) {
            clearTimeout(timeout);
            reject(new Error(`Tunnel exited with code ${code}`));
          }
        });
      });

      spinner.succeed('Cloudflare Tunnel ready');

      return {
        url: result.url,
        provider: 'cloudflared',
        close: () => tunnel.stop()
      };
    } else if (provider === 'localtunnel') {
      const tunnel = await localtunnel({ port });
      spinner.succeed('Tunnel created with localtunnel');
      console.log(chalk.yellow('   ⚠️  Note: localtunnel can be unreliable. Consider using cloudflared.'));

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

  // QR code (always display if showQR is true)
  if (showQR) {
    console.log(chalk.bold('📷 Scan QR code with your mobile browser:'));
    console.log('');
    qrcode.generate(url, { small: true });
  }

  console.log('');
}

program
  .name('aoud')
  .description('Aoud - Control Claude Code from your mobile phone')
  .version('1.0.0');

program
  .command('start')
  .description('Start the bridge server')
  .option('-p, --port <port>', 'Server port (auto-allocated if not specified)')
  .option('--project <path>', 'Initial project path', process.cwd())
  .option('--auth <token>', 'Authentication token (auto-generated if not provided)')
  .option('--no-auth', 'Disable authentication')
  .option('--tls', 'Enable TLS/HTTPS (experimental)')
  .option('--tunnel', 'Enable automatic tunneling (local network only by default)')
  .option('--tunnel-provider <provider>', 'Tunnel provider: cloudflared (default, free), ngrok, or localtunnel', 'cloudflared')
  .option('--ngrok-token <token>', 'ngrok authtoken (required for ngrok)')
  .option('--no-qr', 'Disable QR code display')
  .action(async (options) => {
    // Import multi-instance modules
    const { instanceRegistry } = await import('../server/dist/server/src/instance-registry.js');
    const { findAvailablePort, suggestNextPort } = await import('../server/dist/server/src/port-allocator.js');

    // Cleanup stale instances on startup
    const staleCount = instanceRegistry.cleanupStaleInstances();
    if (staleCount > 0) {
      console.log(chalk.yellow(`⚠️  Cleaned up ${staleCount} stale instance(s)`));
      console.log('');
    }

    const config = loadConfig();

    // Resolve project path
    const projectPath = path.resolve(options.project);
    const projectName = path.basename(projectPath);

    // Check if instance already running for this project
    const existingInstance = instanceRegistry.getByProject(projectPath);
    if (existingInstance) {
      console.log(chalk.yellow(`⚠️  Bridge already running for project: ${chalk.bold(projectName)}`));
      console.log(chalk.cyan(`   Port: ${existingInstance.port}`));
      console.log(chalk.cyan(`   PID: ${existingInstance.pid}`));
      console.log(chalk.cyan(`   Instance ID: ${existingInstance.instanceId.substring(0, 8)}...`));
      console.log('');
      console.log(chalk.dim('   Use "aoud list" to see all instances'));
      console.log(chalk.dim(`   Use "aoud stop --project ${projectPath}" to stop it`));
      console.log('');
      process.exit(0);
    }

    // Allocate port
    let port;
    if (options.port) {
      port = parseInt(options.port);
      // Verify the specified port is available
      const { isPortAvailable } = await import('../server/dist/server/src/port-allocator.js');
      const available = await isPortAvailable(port);
      if (!available) {
        console.error(chalk.red(`❌ Port ${port} is not available`));
        const usedPorts = instanceRegistry.getUsedPorts();
        const suggested = suggestNextPort(usedPorts);
        const nextAvailable = await findAvailablePort(suggested);
        console.log(chalk.yellow(`💡 Suggested available port: ${nextAvailable}`));
        console.log('');
        process.exit(1);
      }
    } else {
      // Auto-allocate port
      const usedPorts = instanceRegistry.getUsedPorts();
      const suggested = suggestNextPort(usedPorts);
      port = await findAvailablePort(suggested);
    }

    // Handle auth token
    let authToken;
    if (options.auth !== false) {
      // Auth is enabled (default) or a specific token was provided
      if (typeof options.auth === 'string') {
        // User provided a specific token via --auth TOKEN
        authToken = options.auth;
      } else {
        // Generate a unique token for this instance
        authToken = generateAuthToken();
      }
    }
    // If options.auth === false (--no-auth was passed), authToken stays undefined

    // Generate instance ID
    const instanceId = crypto.randomBytes(16).toString('hex');

    // Startup banner with FIGlet
    console.log('');
    const figletText = figlet.textSync('Aoud', {
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
      PORT: port.toString(),
      AOUD_SILENT: 'true', // Suppress server's own startup messages
      AOUD_INSTANCE_ID: instanceId,
    };

    if (authToken) {
      env.AOUD_AUTH_TOKEN = authToken;
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
      cwd: projectPath,
    });

    // Forward stdout/stderr
    child.stdout.on('data', (data) => process.stdout.write(data));
    child.stderr.on('data', (data) => process.stderr.write(data));

    child.on('error', (err) => {
      console.error(chalk.red('❌ Failed to start server:'), err.message);
      process.exit(1);
    });

    // Wait for server to be ready with spinner
    const spinner = ora(`Starting server on port ${port}...`).start();
    const serverReady = await waitForServer(port);

    if (!serverReady) {
      spinner.fail('Server failed to start within 30 seconds');
      child.kill();
      process.exit(1);
    }

    spinner.succeed('Server started successfully');

    // Register instance in registry
    const registeredInstance = instanceRegistry.register({
      projectPath,
      projectName,
      port,
      pid: child.pid,
      authToken: authToken || '',
      tunnelUrl: undefined,
    });

    console.log('');
    console.log(chalk.green(`✓ Instance registered: ${registeredInstance.instanceId.substring(0, 8)}...`));
    console.log('');

    // Create tunnel if enabled
    let tunnel = null;
    if (options.tunnel) {
      tunnel = await createTunnel(port, options.tunnelProvider, options.ngrokToken);

      // Update instance with tunnel URL
      if (tunnel) {
        registeredInstance.tunnelUrl = tunnel.url;
        // Re-register with tunnel URL
        instanceRegistry.register({
          ...registeredInstance,
          tunnelUrl: tunnel.url,
        });
      }
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

      networkInfo += chalk.yellow('\n💡 Enable Free Internet Access:\n');
      networkInfo += chalk.dim('aoud start --tunnel\n');
      networkInfo += chalk.dim('(Uses Cloudflare Tunnel - free & unlimited)');

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
    console.log(chalk.bold('📂 Project: ') + chalk.cyan(projectName));
    console.log(chalk.bold('🔢 Port: ') + chalk.cyan(port));
    if (instanceRegistry.list().length > 1) {
      console.log(chalk.dim('💡 Multiple instances running - use "aoud list" to see all'));
    }
    console.log('');
    console.log(chalk.yellow('⌨️  Press ') + chalk.bold('Ctrl+C') + chalk.yellow(' to stop this instance'));
    console.log('');

    // Handle cleanup on exit
    const cleanup = () => {
      console.log('');
      console.log('');
      const shutdownSpinner = ora('Shutting down...').start();

      // Unregister instance
      instanceRegistry.unregister(registeredInstance.instanceId);

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
      // Unregister instance on unexpected exit
      instanceRegistry.unregister(registeredInstance.instanceId);
      if (tunnel) tunnel.close();
      process.exit(code || 0);
    });

    // Handle signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });

// List command - show all running instances
program
  .command('list')
  .description('List all running bridge instances')
  .action(async () => {
    const { instanceRegistry } = await import('../server/dist/server/src/instance-registry.js');

    // Cleanup stale instances first
    const staleCount = instanceRegistry.cleanupStaleInstances();
    if (staleCount > 0) {
      console.log(chalk.yellow(`Cleaned up ${staleCount} stale instance(s)`));
      console.log('');
    }

    const instances = instanceRegistry.list();

    if (instances.length === 0) {
      console.log(chalk.yellow('No running instances'));
      console.log('');
      console.log(chalk.dim('Start a new instance with: aoud start'));
      console.log('');
      return;
    }

    // Create table
    const table = new Table({
      head: ['Project', 'Port', 'PID', 'Status', 'Started', 'Tunnel'],
      style: {
        head: ['cyan'],
      },
    });

    // Add rows
    instances.forEach((instance) => {
      const uptime = Date.now() - new Date(instance.startedAt).getTime();
      const uptimeStr = formatDuration(uptime);

      const statusIndicator = instance.status === 'running'
        ? chalk.green('●')
        : instance.status === 'unhealthy'
        ? chalk.yellow('●')
        : chalk.red('●');

      table.push([
        instance.projectName,
        instance.port.toString(),
        instance.pid.toString(),
        statusIndicator,
        uptimeStr,
        instance.tunnelUrl ? chalk.cyan('Yes') : chalk.dim('No'),
      ]);
    });

    console.log('');
    console.log(chalk.bold('Running Aoud Instances'));
    console.log('');
    console.log(table.toString());
    console.log('');
    console.log(chalk.dim(`Total: ${instances.length} instance(s)`));
    console.log('');
  });

// Stop command - stop specific or all instances
program
  .command('stop')
  .description('Stop bridge instance(s)')
  .option('--project <path>', 'Stop instance for specific project')
  .option('--port <port>', 'Stop instance on specific port')
  .option('--all', 'Stop all instances')
  .action(async (options) => {
    const { instanceRegistry } = await import('../server/dist/server/src/instance-registry.js');

    let instancesToStop = [];

    if (options.all) {
      instancesToStop = instanceRegistry.list();
    } else if (options.project) {
      const projectPath = path.resolve(options.project);
      const instance = instanceRegistry.getByProject(projectPath);
      if (instance) {
        instancesToStop.push(instance);
      } else {
        console.error(chalk.red(`❌ No instance found for project: ${projectPath}`));
        process.exit(1);
      }
    } else if (options.port) {
      const port = parseInt(options.port);
      const instance = instanceRegistry.getByPort(port);
      if (instance) {
        instancesToStop.push(instance);
      } else {
        console.error(chalk.red(`❌ No instance found on port: ${port}`));
        process.exit(1);
      }
    } else {
      console.error(chalk.red('❌ Please specify --project, --port, or --all'));
      console.log('');
      console.log(chalk.dim('Examples:'));
      console.log(chalk.dim('  aoud stop --project /path/to/project'));
      console.log(chalk.dim('  aoud stop --port 3002'));
      console.log(chalk.dim('  aoud stop --all'));
      console.log('');
      process.exit(1);
    }

    if (instancesToStop.length === 0) {
      console.log(chalk.yellow('No matching instances found'));
      console.log('');
      return;
    }

    console.log('');
    for (const instance of instancesToStop) {
      try {
        // Send SIGTERM to process
        process.kill(instance.pid, 'SIGTERM');

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if process is still alive
        let isAlive = false;
        try {
          process.kill(instance.pid, 0);
          isAlive = true;
        } catch (e) {
          // Process is dead
        }

        // Force kill if still alive after 2 seconds
        if (isAlive) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          try {
            process.kill(instance.pid, 0);
            // Still alive, force kill
            process.kill(instance.pid, 'SIGKILL');
          } catch (e) {
            // Already dead
          }
        }

        // Unregister from registry
        instanceRegistry.unregister(instance.instanceId);

        console.log(chalk.green(`✓ Stopped: ${instance.projectName} (port ${instance.port})`));
      } catch (error) {
        if (error.code === 'ESRCH') {
          // Process doesn't exist - just unregister
          instanceRegistry.unregister(instance.instanceId);
          console.log(chalk.yellow(`⚠ Instance was already stopped: ${instance.projectName}`));
        } else {
          console.error(chalk.red(`✗ Failed to stop ${instance.projectName}: ${error.message}`));
        }
      }
    }
    console.log('');
  });

// Helper function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

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
O = Aoud
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
      console.log('  aoud tls --generate');
    }
  });

// Default command is start
program.action(() => {
  program.help();
});

program.parse();
