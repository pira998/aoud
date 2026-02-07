import { useState, useEffect, useCallback, useRef } from 'react';
import type { BridgeInstance } from '../../../shared/types';

// Compatible with useWebSocket's TimelineEvent
interface TimelineEvent {
  id: string;
  sequence: number;
  type: 'user' | 'server';
  data: any;
}

interface InstanceConnection {
  instanceId: string;
  ws: WebSocket | null;
  timeline: TimelineEvent[];
  isConnected: boolean;
  isAuthenticated: boolean;
}

/**
 * Multi-instance WebSocket hook
 * Manages connections to multiple bridge instances simultaneously
 */
export function useMultiInstanceWebSocket(enabled: boolean = true) {
  const [instances, setInstances] = useState<BridgeInstance[]>([]);
  // Use ref for connections to avoid stale closures
  const connectionsRef = useRef<Map<string, InstanceConnection>>(new Map());
  // Force re-renders when connections change
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const reconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const fetchInstancesTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track in-progress connections to prevent duplicates
  const connecting = useRef<Set<string>>(new Set());

  // Helper to force re-render
  const forceUpdate = useCallback(() => setConnectionVersion(v => v + 1), []);

  /**
   * Fetch all running instances from the primary server
   */
  const fetchInstances = useCallback(async () => {
    try {
      // Try to get instances from localStorage first (primary server info)
      const savedUrl = localStorage.getItem('bridge-server-url');
      if (!savedUrl) {
        // No saved connection, try localhost:3001 as default
        const defaultUrl = 'http://localhost:3001';
        const response = await fetch(`${defaultUrl}/instances`);
        const data = await response.json();
        setInstances(data.instances || []);
        return;
      }

      // Extract HTTP URL from WebSocket URL
      const httpUrl = savedUrl.replace('ws://', 'http://').replace('wss://', 'https://');

      // Try the saved server first
      try {
        const response = await fetch(`${httpUrl}/instances`);
        const data = await response.json();
        setInstances(data.instances || []);
        return;
      } catch (e) {
        // If saved server fails, try localhost:3001
        const response = await fetch('http://localhost:3001/instances');
        const data = await response.json();
        setInstances(data.instances || []);
      }
    } catch (error) {
      console.error('[Multi-Instance] Failed to fetch instances:', error);
      // Don't clear instances on error - keep showing last known state
    }
  }, []);

  /**
   * Connect to a specific instance
   */
  const connectToInstance = useCallback((instance: BridgeInstance) => {
    // Prevent duplicate connections
    if (connecting.current.has(instance.instanceId)) {
      console.log(`[Multi-Instance] Already connecting to ${instance.projectName}, skipping duplicate`);
      return;
    }
    connecting.current.add(instance.instanceId);

    const wsUrl = `ws://localhost:${instance.port}`;

    console.log(`[Multi-Instance] Connecting to ${instance.projectName} on port ${instance.port}`);

    const ws = new WebSocket(wsUrl);

    // Tag WebSocket with instance ID to avoid closure issues
    (ws as any)._instanceId = instance.instanceId;

    ws.onopen = () => {
      connecting.current.delete(instance.instanceId);
      console.log(`[Multi-Instance] Connected to ${instance.projectName}`);

      // Send authentication
      ws.send(JSON.stringify({
        type: 'connect',
        authToken: instance.authToken,
      }));

      // Update connection state using ref
      const existing = connectionsRef.current.get(instance.instanceId) || {
        instanceId: instance.instanceId,
        ws: null,
        timeline: [],
        isConnected: false,
        isAuthenticated: false,
      };

      connectionsRef.current.set(instance.instanceId, {
        ...existing,
        ws,
        isConnected: true,
      });

      forceUpdate(); // Trigger re-render
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // Use tagged instance ID instead of closure variable
        const instanceId = (ws as any)._instanceId;
        handleInstanceMessage(instanceId, message);
      } catch (error) {
        console.error(`[Multi-Instance] Error parsing message:`, error);
      }
    };

    ws.onerror = (error) => {
      connecting.current.delete(instance.instanceId);
      console.error(`[Multi-Instance] WebSocket error for ${instance.projectName}:`, error);
    };

    ws.onclose = () => {
      connecting.current.delete(instance.instanceId);
      const instanceId = (ws as any)._instanceId;
      console.log(`[Multi-Instance] Disconnected from ${instance.projectName}`);

      // Update connection state
      const existing = connectionsRef.current.get(instanceId);
      if (existing) {
        connectionsRef.current.set(instanceId, {
          ...existing,
          ws: null,
          isConnected: false,
          isAuthenticated: false,
        });
        forceUpdate();
      }

      // Schedule reconnect
      scheduleReconnect(instance);
    };
  }, [forceUpdate]);

  /**
   * Schedule reconnection attempt
   */
  const scheduleReconnect = useCallback((instance: BridgeInstance) => {
    // Clear existing timer
    const existingTimer = reconnectTimers.current.get(instance.instanceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new reconnect in 3 seconds
    const timer = setTimeout(() => {
      connectToInstance(instance);
      reconnectTimers.current.delete(instance.instanceId);
    }, 3000);

    reconnectTimers.current.set(instance.instanceId, timer);
  }, [connectToInstance]);

  /**
   * Handle message from specific instance
   */
  const handleInstanceMessage = useCallback((instanceId: string, message: any) => {
    // Handle connection status
    if (message.type === 'connection_status') {
      const existing = connectionsRef.current.get(instanceId);
      if (existing) {
        connectionsRef.current.set(instanceId, {
          ...existing,
          isAuthenticated: message.status === 'authenticated',
        });
        forceUpdate();
      }
      return;
    }

    // Add message to timeline (compatible with useWebSocket format)
    const existing = connectionsRef.current.get(instanceId);
    if (existing) {
      const sequence = existing.timeline.length;
      const event: TimelineEvent = {
        id: `${instanceId}-${sequence}-${Date.now()}`,
        sequence,
        type: 'server',
        data: message,
      };

      connectionsRef.current.set(instanceId, {
        ...existing,
        timeline: [...existing.timeline, event],
      });
      forceUpdate();
    }
  }, [forceUpdate]);

  /**
   * Send message to specific instance
   */
  const sendToInstance = useCallback((instanceId: string, message: any) => {
    const connection = connectionsRef.current.get(instanceId);
    if (connection?.ws && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
      return true;
    }
    console.warn(`[Multi-Instance] Cannot send message - instance ${instanceId} not connected`);
    return false;
  }, []); // No dependencies - always uses current ref

  /**
   * Get timeline for specific instance
   */
  const getTimeline = useCallback((instanceId: string): TimelineEvent[] => {
    return connectionsRef.current.get(instanceId)?.timeline || [];
  }, []); // No dependencies

  /**
   * Get connection status for instance
   */
  const getConnectionStatus = useCallback((instanceId: string) => {
    const connection = connectionsRef.current.get(instanceId);
    return {
      isConnected: connection?.isConnected || false,
      isAuthenticated: connection?.isAuthenticated || false,
    };
  }, []); // No dependencies

  /**
   * Get connection object for instance (for adding user messages)
   */
  const getConnection = useCallback((instanceId: string) => {
    return connectionsRef.current.get(instanceId);
  }, []);

  /**
   * Add event to timeline (for user messages)
   */
  const addToTimeline = useCallback((instanceId: string, event: TimelineEvent) => {
    const connection = connectionsRef.current.get(instanceId);
    if (connection) {
      connectionsRef.current.set(instanceId, {
        ...connection,
        timeline: [...connection.timeline, event],
      });
      forceUpdate();
    }
  }, [forceUpdate]);

  /**
   * Disconnect from specific instance
   */
  const disconnectInstance = useCallback((instanceId: string) => {
    const connection = connectionsRef.current.get(instanceId);
    if (connection?.ws) {
      connection.ws.close();
    }

    // Clear reconnect timer
    const timer = reconnectTimers.current.get(instanceId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.current.delete(instanceId);
    }

    // Remove from connections
    connectionsRef.current.delete(instanceId);
    forceUpdate();
  }, [forceUpdate]);

  /**
   * Effect: Fetch instances periodically (only if enabled)
   */
  useEffect(() => {
    if (!enabled) return;

    fetchInstances();

    // Refresh instances every 10 seconds
    fetchInstancesTimer.current = setInterval(fetchInstances, 10000);

    return () => {
      if (fetchInstancesTimer.current) {
        clearInterval(fetchInstancesTimer.current);
      }
    };
  }, [fetchInstances, enabled]);

  /**
   * Effect: Connect to new instances and disconnect from removed ones (only if enabled)
   */
  useEffect(() => {
    if (!enabled) return;

    const currentInstanceIds = new Set(instances.map(i => i.instanceId));
    const connectedInstanceIds = new Set(connectionsRef.current.keys());

    // Connect to new instances (avoid duplicates)
    instances.forEach(instance => {
      const alreadyConnected = connectedInstanceIds.has(instance.instanceId);
      const currentlyConnecting = connecting.current.has(instance.instanceId);

      if (!alreadyConnected && !currentlyConnecting) {
        connectToInstance(instance);
      }
    });

    // Disconnect from removed instances
    connectedInstanceIds.forEach(instanceId => {
      if (!currentInstanceIds.has(instanceId)) {
        disconnectInstance(instanceId);
      }
    });
  }, [instances, connectionVersion, connectToInstance, disconnectInstance, enabled]); // Depend on version, not connections

  /**
   * Effect: Set active instance if none selected
   */
  useEffect(() => {
    if (!activeInstanceId && instances.length > 0) {
      setActiveInstanceId(instances[0].instanceId);
    }

    // If active instance was removed, switch to first available
    if (activeInstanceId && !instances.find(i => i.instanceId === activeInstanceId)) {
      setActiveInstanceId(instances.length > 0 ? instances[0].instanceId : null);
    }
  }, [activeInstanceId, instances]);

  /**
   * Effect: Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Close all connections
      connectionsRef.current.forEach(connection => {
        if (connection.ws) {
          connection.ws.close();
        }
      });

      // Clear all timers
      reconnectTimers.current.forEach(timer => clearTimeout(timer));
      reconnectTimers.current.clear();

      if (fetchInstancesTimer.current) {
        clearInterval(fetchInstancesTimer.current);
      }
    };
  }, []);

  return {
    instances,
    activeInstanceId,
    setActiveInstanceId,
    sendToInstance,
    getTimeline,
    getConnectionStatus,
    getConnection,
    addToTimeline,
    refreshInstances: fetchInstances,
  };
}
