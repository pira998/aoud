import net from 'net';

const PORT_RANGE_START = 3001;
const PORT_RANGE_END = 3100;

/**
 * Find an available port starting from the specified port
 * @param startPort Starting port to scan from (default: 3001)
 * @returns Promise resolving to an available port number
 * @throws Error if no ports available in range
 */
export async function findAvailablePort(
  startPort: number = PORT_RANGE_START
): Promise<number> {
  for (let port = startPort; port <= PORT_RANGE_END; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `No available ports found in range ${PORT_RANGE_START}-${PORT_RANGE_END}. ` +
    `Please stop some instances with: aoud stop --all`
  );
}

/**
 * Check if a specific port is available by attempting to bind to it
 * @param port Port number to check
 * @returns Promise resolving to true if port is available, false otherwise
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      // Port is in use or not accessible
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
      } else {
        // Other errors also mean port is not available
        resolve(false);
      }
    });

    server.once('listening', () => {
      // Port is available - close the test server
      server.close();
      resolve(true);
    });

    // Attempt to bind to the port on all interfaces
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Suggest the next available port based on currently used ports
 * Fills gaps in the sequence first, then continues from the highest port
 * @param usedPorts Array of currently used port numbers
 * @returns Suggested port number (not guaranteed to be available)
 */
export function suggestNextPort(usedPorts: number[]): number {
  if (usedPorts.length === 0) {
    return PORT_RANGE_START;
  }

  const sortedPorts = [...usedPorts].sort((a, b) => a - b);

  // Find first gap in the sequence starting from PORT_RANGE_START
  for (let i = 0; i < sortedPorts.length; i++) {
    const expectedPort = PORT_RANGE_START + i;
    if (sortedPorts[i] !== expectedPort) {
      // Found a gap - suggest this port
      return expectedPort;
    }
  }

  // No gaps found - suggest next port after the highest used port
  const highestPort = Math.max(...sortedPorts);
  return highestPort + 1;
}

/**
 * Verify that a port is within the valid range
 * @param port Port number to validate
 * @returns true if port is within range, false otherwise
 */
export function isValidPort(port: number): boolean {
  return port >= PORT_RANGE_START && port <= PORT_RANGE_END;
}
