import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { log } from './logger.js';

const CONFIG_DIR = path.join(os.homedir(), '.aoud');
const KEY_FILE = path.join(CONFIG_DIR, 'server.key');
const CERT_FILE = path.join(CONFIG_DIR, 'server.crt');

export interface TLSCredentials {
  key: string;
  cert: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Check if TLS certificates exist
 */
export function hasCertificates(): boolean {
  return fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE);
}

/**
 * Generate self-signed TLS certificates using openssl
 * Falls back to a simpler method if openssl is not available
 */
export function generateCertificates(): TLSCredentials {
  ensureConfigDir();

  // Get local IP addresses for SAN (Subject Alternative Name)
  const interfaces = os.networkInterfaces();
  const ips: string[] = ['127.0.0.1'];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  // Create SAN configuration
  const sanEntries = ips.map((ip, i) => `IP.${i + 1} = ${ip}`).join('\n');
  const hostname = os.hostname();

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

  const configPath = path.join(CONFIG_DIR, 'openssl.cnf');

  try {
    // Write OpenSSL config
    fs.writeFileSync(configPath, opensslConfig);

    // Generate certificate using openssl
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" -days 365 -nodes -config "${configPath}"`,
      { stdio: 'pipe' }
    );

    // Clean up config file
    fs.unlinkSync(configPath);

    log.success('TLS', 'Generated self-signed TLS certificate');
    log.info('TLS', `Key: ${KEY_FILE}`);
    log.info('TLS', `Cert: ${CERT_FILE}`);
    log.info('TLS', 'Valid for: 365 days');
    log.info('TLS', `IPs: ${ips.join(', ')}`);

    return {
      key: fs.readFileSync(KEY_FILE, 'utf-8'),
      cert: fs.readFileSync(CERT_FILE, 'utf-8'),
    };
  } catch (error) {
    log.error('TLS', 'Failed to generate TLS certificate:', error);
    log.warn('TLS', 'TLS will be disabled. To enable TLS, install openssl and try again.');
    throw error;
  }
}

/**
 * Load existing TLS certificates
 */
export function loadCertificates(): TLSCredentials {
  if (!hasCertificates()) {
    throw new Error('TLS certificates not found. Run generateCertificates() first.');
  }

  return {
    key: fs.readFileSync(KEY_FILE, 'utf-8'),
    cert: fs.readFileSync(CERT_FILE, 'utf-8'),
  };
}

/**
 * Get or generate TLS certificates
 */
export function ensureCertificates(): TLSCredentials {
  if (hasCertificates()) {
    log.info('TLS', 'Loading existing TLS certificates...');
    return loadCertificates();
  }

  log.info('TLS', 'Generating new TLS certificates...');
  return generateCertificates();
}

/**
 * Delete existing certificates (for regeneration)
 */
export function deleteCertificates(): void {
  if (fs.existsSync(KEY_FILE)) {
    fs.unlinkSync(KEY_FILE);
  }
  if (fs.existsSync(CERT_FILE)) {
    fs.unlinkSync(CERT_FILE);
  }
  log.success('TLS', 'TLS certificates deleted');
}

/**
 * Get certificate info
 */
export function getCertificateInfo(): { exists: boolean; keyPath: string; certPath: string } {
  return {
    exists: hasCertificates(),
    keyPath: KEY_FILE,
    certPath: CERT_FILE,
  };
}
