import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.claude-mobile-bridge');
const INSTANCES_FILE = path.join(CONFIG_DIR, 'instances.json');

export interface BridgeInstance {
  instanceId: string;
  projectPath: string;
  projectName: string;
  port: number;
  pid: number;
  startedAt: string;
  lastHealthCheck: string;
  status: 'running' | 'stopped' | 'unhealthy';
  authToken: string;
  tunnelUrl?: string;
}

interface InstanceRegistry {
  instances: BridgeInstance[];
  lastUpdated: string;
  version: string;
}

/**
 * Manager for tracking and managing bridge instances
 * Provides file-based persistence with atomic writes
 */
export class InstanceRegistryManager {
  private registryPath: string;

  constructor(registryPath: string = INSTANCES_FILE) {
    this.registryPath = registryPath;
    this.ensureConfigDir();
  }

  /**
   * Ensure the config directory exists
   */
  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  /**
   * Load registry from disk
   * Handles corruption by returning empty registry
   */
  private load(): InstanceRegistry {
    try {
      if (fs.existsSync(this.registryPath)) {
        const content = fs.readFileSync(this.registryPath, 'utf-8');
        const data = JSON.parse(content);

        // Validate structure
        if (data && Array.isArray(data.instances)) {
          return data;
        }
      }
    } catch (error) {
      console.error('[Instance Registry] Error loading registry:', error);
      console.warn('[Instance Registry] Registry corrupted, resetting to empty state');
    }

    // Return empty registry
    return {
      instances: [],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  /**
   * Save registry to disk with atomic write
   */
  private save(registry: InstanceRegistry): void {
    try {
      registry.lastUpdated = new Date().toISOString();
      const tempFile = `${this.registryPath}.tmp`;

      // Write to temp file first
      fs.writeFileSync(tempFile, JSON.stringify(registry, null, 2), 'utf-8');

      // Atomic rename (POSIX systems)
      fs.renameSync(tempFile, this.registryPath);
    } catch (error) {
      console.error('[Instance Registry] Error saving registry:', error);
      // Clean up temp file if it exists
      try {
        const tempFile = `${this.registryPath}.tmp`;
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Register a new instance or update existing one by project path
   * @param instance Instance data (without instanceId, startedAt, lastHealthCheck, status)
   * @returns The registered instance with all fields populated
   */
  register(instance: Omit<BridgeInstance, 'instanceId' | 'startedAt' | 'lastHealthCheck' | 'status'>): BridgeInstance {
    const registry = this.load();

    // Resolve absolute path for comparison
    const absolutePath = path.resolve(instance.projectPath);

    // Check for existing instance with same project path
    const existingIndex = registry.instances.findIndex(
      (i) => path.resolve(i.projectPath) === absolutePath
    );

    const newInstance: BridgeInstance = {
      ...instance,
      projectPath: absolutePath,
      instanceId: this.generateInstanceId(),
      startedAt: new Date().toISOString(),
      lastHealthCheck: new Date().toISOString(),
      status: 'running',
    };

    if (existingIndex >= 0) {
      // Update existing instance (replace)
      registry.instances[existingIndex] = newInstance;
    } else {
      // Add new instance
      registry.instances.push(newInstance);
    }

    this.save(registry);
    return newInstance;
  }

  /**
   * Unregister an instance by ID
   * @param instanceId Instance ID to remove
   * @returns true if instance was found and removed, false otherwise
   */
  unregister(instanceId: string): boolean {
    const registry = this.load();
    const index = registry.instances.findIndex((i) => i.instanceId === instanceId);

    if (index >= 0) {
      registry.instances.splice(index, 1);
      this.save(registry);
      return true;
    }

    return false;
  }

  /**
   * Update instance health check timestamp
   * @param instanceId Instance ID to update
   */
  updateHealth(instanceId: string): void {
    const registry = this.load();
    const instance = registry.instances.find((i) => i.instanceId === instanceId);

    if (instance) {
      instance.lastHealthCheck = new Date().toISOString();
      instance.status = 'running';
      this.save(registry);
    }
  }

  /**
   * Get all instances
   * @returns Array of all registered instances
   */
  list(): BridgeInstance[] {
    const registry = this.load();
    return registry.instances;
  }

  /**
   * Get instance by ID
   * @param instanceId Instance ID to find
   * @returns Instance if found, undefined otherwise
   */
  get(instanceId: string): BridgeInstance | undefined {
    const registry = this.load();
    return registry.instances.find((i) => i.instanceId === instanceId);
  }

  /**
   * Get instance by project path
   * @param projectPath Project path to find
   * @returns Instance if found, undefined otherwise
   */
  getByProject(projectPath: string): BridgeInstance | undefined {
    const registry = this.load();
    const absolutePath = path.resolve(projectPath);
    return registry.instances.find((i) => path.resolve(i.projectPath) === absolutePath);
  }

  /**
   * Get instance by port number
   * @param port Port number to find
   * @returns Instance if found, undefined otherwise
   */
  getByPort(port: number): BridgeInstance | undefined {
    const registry = this.load();
    return registry.instances.find((i) => i.port === port);
  }

  /**
   * Get all used ports
   * @returns Array of port numbers currently in use
   */
  getUsedPorts(): number[] {
    const registry = this.load();
    return registry.instances.map((i) => i.port);
  }

  /**
   * Check if a process is still running
   * Uses process.kill(pid, 0) which doesn't kill but checks existence
   * @param pid Process ID to check
   * @returns true if process is alive, false otherwise
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // Signal 0 tests for the existence of the process
      // Will throw if process doesn't exist
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // Process doesn't exist or no permission
      return false;
    }
  }

  /**
   * Remove instances where the process is no longer running
   * @returns Number of stale instances removed
   */
  cleanupStaleInstances(): number {
    const registry = this.load();
    const before = registry.instances.length;

    registry.instances = registry.instances.filter((instance) => {
      const isAlive = this.isProcessAlive(instance.pid);
      if (!isAlive) {
        console.log(
          `[Instance Registry] Removing stale instance: ${instance.projectName} ` +
          `(PID ${instance.pid}, port ${instance.port})`
        );
      }
      return isAlive;
    });

    const removed = before - registry.instances.length;
    if (removed > 0) {
      this.save(registry);
    }

    return removed;
  }

  /**
   * Mark instances as unhealthy if they haven't checked in recently
   * @param maxAgeSeconds Maximum age in seconds before marking unhealthy (default: 60)
   * @returns Number of instances marked unhealthy
   */
  markUnhealthyInstances(maxAgeSeconds: number = 60): number {
    const registry = this.load();
    const now = Date.now();
    let marked = 0;

    registry.instances.forEach((instance) => {
      const lastCheck = new Date(instance.lastHealthCheck).getTime();
      const ageSeconds = (now - lastCheck) / 1000;

      if (ageSeconds > maxAgeSeconds && instance.status === 'running') {
        instance.status = 'unhealthy';
        marked++;
      }
    });

    if (marked > 0) {
      this.save(registry);
    }

    return marked;
  }

  /**
   * Generate a unique instance ID
   * Uses timestamp and random values for uniqueness
   */
  private generateInstanceId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
  }

  /**
   * Clear all instances (mainly for testing)
   */
  clear(): void {
    const registry: InstanceRegistry = {
      instances: [],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };
    this.save(registry);
  }
}

// Singleton instance
export const instanceRegistry = new InstanceRegistryManager();
