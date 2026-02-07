import { instanceRegistry } from './instance-registry.js';

/**
 * Monitors bridge instance health and handles graceful shutdown
 */
export class ProcessMonitor {
  private instanceId: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Start health check monitoring and register shutdown handlers
   */
  start(): void {
    if (this.healthCheckInterval) {
      // Already started
      return;
    }

    // Update health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        instanceRegistry.updateHealth(this.instanceId);
      }
    }, 30000);

    // Register shutdown handlers
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('exit', () => this.cleanup());

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[Process Monitor] Uncaught exception:', error);
      this.handleShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Process Monitor] Unhandled promise rejection:', reason);
      // Don't exit on unhandled rejection, just log it
    });
  }

  /**
   * Stop health check monitoring
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Handle shutdown signals
   * @param signal Signal that triggered shutdown
   */
  private handleShutdown(signal: string): void {
    if (this.isShuttingDown) {
      // Already shutting down
      return;
    }

    this.isShuttingDown = true;

    console.log(`\n[Process Monitor] Received ${signal}, shutting down gracefully...`);

    // Stop health monitoring
    this.stop();

    // Cleanup and unregister instance
    this.cleanup();

    // Give some time for cleanup, then exit
    setTimeout(() => {
      console.log('[Process Monitor] Shutdown complete');
      process.exit(0);
    }, 1000);
  }

  /**
   * Cleanup resources and unregister instance
   * Called on process exit
   */
  private cleanup(): void {
    try {
      // Unregister instance from registry
      const wasUnregistered = instanceRegistry.unregister(this.instanceId);

      if (wasUnregistered) {
        console.log(`[Process Monitor] Instance ${this.instanceId} unregistered successfully`);
      }
    } catch (error) {
      console.error('[Process Monitor] Error during cleanup:', error);
    }
  }

  /**
   * Get instance ID being monitored
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Check if monitor is currently shutting down
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}
