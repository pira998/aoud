import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ServerMessage,
  SessionInfo,
  ProjectInfo,
  DiffMessage,
  PermissionMode,
} from '../../../shared/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface PendingApproval {
  requestId: string;
  tool: string;
  input: unknown;
  description?: string;
  diff?: DiffMessage;
}

export interface TimelineEvent {
  id: string;
  sequence: number;  // Sequence number for ordering
  type: 'user' | 'server';
  data: ChatMessage | ServerMessage;
}

// Re-export types for convenience
export type { ServerMessage, SessionInfo, ProjectInfo, PermissionMode, DiffMessage };

// Sequence counter (outside component to persist across renders)
let sequenceCounter = 0;

export function useWebSocket(serverUrl: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rawMessages, setRawMessages] = useState<ServerMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingText, setThinkingText] = useState('');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Array<{
    id: string;
    subject: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm?: string;
    timestamp: string;
  }>>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        console.log('WebSocket connected');
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');

        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('Connection failed. Make sure the bridge server is running.');
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          handleServerMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };
    } catch (error) {
      setConnectionError('Failed to connect to server');
    }
  }, [serverUrl]);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    // Add messages to timeline, except for ones that have specific handlers below
    // This prevents duplicates while ensuring all needed messages are in timeline
    const skipTimelineFor = ['tool_input', 'approval_request', 'tool_complete', 'diff'];
    if (!skipTimelineFor.includes(message.type)) {
      const serverEvent: TimelineEvent = {
        id: `server-${sequenceCounter}`,
        sequence: sequenceCounter++,
        type: 'server',
        data: message,
      };
      setTimeline((prev) => [...prev, serverEvent]);
    }

    switch (message.type) {
      case 'connection_status':
        if (message.status === 'error') {
          setConnectionError(message.message || 'Connection error');
        }
        break;

      case 'session_list':
        setSessions(message.sessions);
        break;

      case 'session':
        if (message.status === 'started') {
          // Session started - keep existing timeline (user's message should stay visible)
          setActiveSessionId(message.sessionId);
          setIsProcessing(true);
        } else if (message.status === 'complete' || message.status === 'error') {
          setIsProcessing(false);
          // Finalize any streaming text
          if (streamingText) {
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'assistant',
                content: streamingText,
                timestamp: new Date(),
              },
            ]);
            setStreamingText('');
          }
        }
        if (message.error) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              content: `Error: ${message.error}`,
              timestamp: new Date(),
            },
          ]);
        }
        break;

      case 'stream':
        setStreamingText((prev) => prev + message.text);
        break;

      case 'tool_start':
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'system',
            content: `Using ${message.tool}...`,
            timestamp: new Date(),
          },
        ]);
        break;

      case 'tool_input':
        // Add tool execution to timeline with full details
        const toolEvent: TimelineEvent = {
          id: `tool-${message.toolUseId}`,
          sequence: sequenceCounter++,
          type: 'server',
          data: {
            type: 'tool_execution',
            tool: message.tool,
            toolUseId: message.toolUseId,
            input: message.input,
            status: 'running',
          } as any,
        };
        setTimeline((prev) => [...prev, toolEvent]);
        break;

      case 'tool_complete':
        // Update the tool's status in timeline
        setTimeline((prev) =>
          prev.map((event) =>
            event.id === `tool-${message.toolUseId}`
              ? {
                  ...event,
                  data: {
                    ...(event.data as any),
                    status: 'done',
                    success: message.success,
                    result: message.result,
                  },
                }
              : event
          )
        );
        break;

      case 'approval_request':
        console.log('[DEBUG] Received approval request:', {
          requestId: message.requestId,
          tool: message.tool,
          description: message.description
        });
        // Add to pending approvals (for badge count)
        setPendingApprovals((prev) => [
          ...prev,
          {
            requestId: message.requestId,
            tool: message.tool,
            input: message.input,
            description: message.description,
          },
        ]);
        // Add to timeline for inline display
        const approvalEvent: TimelineEvent = {
          id: `approval-${message.requestId}`,
          sequence: sequenceCounter++,
          type: 'server',
          data: message,
        };
        setTimeline((prev) => [...prev, approvalEvent]);
        break;

      case 'diff':
        console.log('[DEBUG] Received diff:', {
          requestId: message.requestId,
          file: message.file,
          additions: message.additions,
          deletions: message.deletions,
          oldContentLength: message.oldContent?.length,
          newContentLength: message.newContent?.length
        });
        // Update pending approvals with diff
        setPendingApprovals((prev) => {
          const updated = prev.map((approval) =>
            approval.requestId === message.requestId
              ? { ...approval, diff: message }
              : approval
          );
          console.log('[DEBUG] Updated approvals:', updated.length, 'total');
          return updated;
        });
        // Update timeline with diff data
        setTimeline((prev) =>
          prev.map((event) =>
            event.id === `approval-${message.requestId}`
              ? {
                  ...event,
                  data: {
                    ...(event.data as any),
                    diff: message,
                  },
                }
              : event
          )
        );
        break;

      case 'result':
        setIsProcessing(false);
        // Clear thinking text on completion
        setThinkingText('');
        if (message.totalCost !== undefined && message.duration !== undefined) {
          const cost = message.totalCost;
          const duration = message.duration;
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              content: `Completed (Cost: $${cost.toFixed(4)}, Duration: ${(duration / 1000).toFixed(1)}s)`,
              timestamp: new Date(),
            },
          ]);
        }
        break;

      case 'thinking':
        setThinkingText((prev) => prev + message.text);
        break;

      case 'mode_changed':
        setPermissionMode(message.mode);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'system',
            content: `Mode changed to: ${message.mode}`,
            timestamp: new Date(),
          },
        ]);
        break;

      case 'project_list':
        setProjects(message.projects);
        if (message.activeProjectId) {
          setActiveProjectId(message.activeProjectId);
        }
        break;

      case 'project_added':
        setProjects((prev) => [...prev, message.project]);
        break;

      case 'project_removed':
        setProjects((prev) => prev.filter((p) => p.id !== message.projectId));
        if (activeProjectId === message.projectId) {
          setActiveProjectId(null);
        }
        break;

      case 'project_selected':
        setActiveProjectId(message.projectId);
        break;

      case 'task_created':
        const newTask = (message as any).task;
        console.log('[Task] Created:', newTask.subject);
        setTasks((prev) => [...prev, newTask]);
        break;

      case 'task_updated':
        const updateMsg = message as any;
        console.log('[Task] Updated:', updateMsg.taskId, updateMsg.status);
        setTasks((prev) =>
          prev.map((task) =>
            task.id === updateMsg.taskId
              ? {
                  ...task,
                  status: updateMsg.status || task.status,
                  subject: updateMsg.subject || task.subject,
                  description: updateMsg.description || task.description,
                  activeForm: updateMsg.activeForm || task.activeForm,
                }
              : task
          )
        );
        break;

      case 'task_list':
        const taskListMsg = message as any;
        console.log('[Task] List:', taskListMsg.tasks.length, 'tasks');
        setTasks(taskListMsg.tasks);
        break;
    }

    // Store all raw messages for the terminal view (after handling session clears)
    setRawMessages((prev) => [...prev, message]);
  }, [streamingText, activeProjectId]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  // Send prompt with optional mode and thinking options
  const sendPrompt = useCallback(
    (text: string, options?: {
      projectPath?: string;
      permissionMode?: PermissionMode;
      maxThinkingTokens?: number;
    }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      // Create user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      // Add to timeline
      const userEvent: TimelineEvent = {
        id: userMessage.id,
        sequence: sequenceCounter++,
        type: 'user',
        data: userMessage,
      };
      setTimeline((prev) => [...prev, userEvent]);

      // Add user message to chat
      setMessages((prev) => [...prev, userMessage]);

      // Reset streaming and thinking text
      setStreamingText('');
      setThinkingText('');
      setIsProcessing(true);

      // Clear tasks from previous prompt
      setTasks([]);

      // Send to server
      wsRef.current.send(
        JSON.stringify({
          type: 'prompt',
          text,
          sessionId: activeSessionId,
          projectPath: options?.projectPath,
          permissionMode: options?.permissionMode || permissionMode,
          maxThinkingTokens: options?.maxThinkingTokens,
        })
      );
    },
    [activeSessionId, permissionMode]
  );

  // Set permission mode
  const setMode = useCallback(
    (mode: PermissionMode) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (!activeSessionId) return;

      wsRef.current.send(
        JSON.stringify({
          type: 'set_mode',
          sessionId: activeSessionId,
          mode,
        })
      );
    },
    [activeSessionId]
  );

  // Exit plan mode
  const exitPlanMode = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!activeSessionId) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'exit_plan_mode',
        sessionId: activeSessionId,
      })
    );
  }, [activeSessionId]);

  // Project management functions
  const addProject = useCallback((path: string, name?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'add_project',
        path,
        name,
      })
    );
  }, []);

  const removeProject = useCallback((projectId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'remove_project',
        projectId,
      })
    );
  }, []);

  const selectProject = useCallback((projectId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'select_project',
        projectId,
      })
    );
  }, []);

  // Handle approval decision
  const handleApproval = useCallback(
    (requestId: string, decision: 'allow' | 'deny', reason?: string, answers?: Record<string, string>) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      wsRef.current.send(
        JSON.stringify({
          type: 'approval',
          requestId,
          decision,
          reason,
          answers,
        })
      );

      // Remove from pending
      setPendingApprovals((prev) =>
        prev.filter((a) => a.requestId !== requestId)
      );

      // Remove from timeline so it disappears from inline display
      setTimeline((prev) =>
        prev.filter((event) => event.id !== `approval-${requestId}`)
      );

      // Add to messages
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'system',
          content: `${decision === 'allow' ? 'Approved' : 'Rejected'} action${reason ? `: ${reason}` : ''}`,
          timestamp: new Date(),
        },
      ]);
    },
    []
  );

  // Interrupt current session
  const interrupt = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!activeSessionId) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'interrupt',
        sessionId: activeSessionId,
      })
    );

    setIsProcessing(false);
  }, [activeSessionId]);

  // Clear terminal
  const clearTerminal = useCallback(() => {
    setMessages([]);
    setRawMessages([]);
    setTimeline([]);
    sequenceCounter = 0;
  }, []);

  return {
    // Connection state
    isConnected,
    connectionError,
    // Chat state
    messages,
    rawMessages,
    timeline, // Add timeline for ordered events
    streamingText,
    thinkingText,
    // Session state
    sessions,
    activeSessionId,
    pendingApprovals,
    isProcessing,
    // Mode state
    permissionMode,
    // Project state
    projects,
    activeProjectId,
    // Task state
    tasks,
    // Actions
    sendPrompt,
    handleApproval,
    interrupt,
    setActiveSessionId,
    setMode,
    exitPlanMode,
    addProject,
    removeProject,
    selectProject,
    clearTerminal,
  };
}
