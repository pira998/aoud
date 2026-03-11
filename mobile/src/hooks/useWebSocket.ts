import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateUUID } from '../utils/uuid';
import type {
  ServerMessage,
  SessionInfo,
  ProjectInfo,
  DiffMessage,
  PermissionMode,
  SlashCommand,
  ModelInfo,
  DirectoryEntry,
  SessionFolderEntry,
  FileSearchEntry,
  FilePreviewResultMessage,
} from '../../../shared/types';
import type { Message } from '../types';
import { convertTimelineToMessages } from '../lib/timelineAdapter';
import { useTicketStore } from '../store/ticketStore';
import { log } from '../lib/logger';

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
  sequence: number;
  type: 'user' | 'server';
  data: ChatMessage | ServerMessage;
}

// Per-session isolated state
export interface SessionState {
  sessionId: string;
  timeline: TimelineEvent[];
  historyMessages: Message[];
  tasks: Array<{
    id: string;
    subject: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm?: string;
    timestamp: string;
  }>;
  streamingText: string;
  thinkingText: string;
  isProcessing: boolean;
  sessionStats: {
    totalCost: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    turnCount: number;
  };
  pendingApprovals: PendingApproval[];
  hasUnreadMessages: boolean;
  displayName?: string;
  projectPath?: string; // Stored project path for folder-based sessions
}

const DEFAULT_STATS = {
  totalCost: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  turnCount: 0,
};

function createSessionState(sessionId: string): SessionState {
  return {
    sessionId,
    timeline: [],
    historyMessages: [],
    tasks: [],
    streamingText: '',
    thinkingText: '',
    isProcessing: false,
    sessionStats: { ...DEFAULT_STATS },
    pendingApprovals: [],
    hasUnreadMessages: false,
  };
}

// Re-export types for convenience
export type { ServerMessage, SessionInfo, ProjectInfo, PermissionMode, DiffMessage };

// Sequence counter (outside component to persist across renders)
let sequenceCounter = 0;

export function useWebSocket(serverUrl: string, authToken: string | null = null, enabled: boolean = true) {
  // === Global state (NOT per-session) ===
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('claude-sonnet-4-5-20250929');
  const [savedSessions, setSavedSessions] = useState<any[]>([]);
  const [loadedSession, setLoadedSession] = useState<any | null>(null);
  const [memoryData, setMemoryData] = useState<{
    projectPath: string;
    projectName: string;
    locations: Array<{
      type: 'managed_policy' | 'project' | 'project_rules' | 'user' | 'project_local' | 'auto';
      path: string;
      content: string;
      exists: boolean;
      lastModified?: string;
      lineCount?: number;
    }>;
    timestamp: string;
  } | null>(null);
  const [browseResult, setBrowseResult] = useState<{
    path: string;
    parentPath: string | null;
    entries: DirectoryEntry[];
  } | null>(null);
  const [sessionFolders, setSessionFolders] = useState<{
    basePath: string;
    folders: SessionFolderEntry[];
  } | null>(null);
  const [folderCreationResult, setFolderCreationResult] = useState<{
    success: boolean;
    folderPath?: string;
    folderName?: string;
    error?: string;
  } | null>(null);

  // Spotlight file search state
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchEntry[]>([]);
  const [isFileSearching, setIsFileSearching] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreviewResultMessage | null>(null);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);
  const [isFilePreviewLoading, setIsFilePreviewLoading] = useState(false);
  const [fileSaveResult, setFileSaveResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Legacy message arrays kept for backward compat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rawMessages, setRawMessages] = useState<ServerMessage[]>([]);

  // === Per-session state via ref Map (same pattern as useMultiInstanceWebSocket) ===
  const sessionStatesRef = useRef<Map<string, SessionState>>(new Map());
  const [sessionStateVersion, setSessionStateVersion] = useState(0);
  const forceSessionUpdate = useCallback(() => setSessionStateVersion(v => v + 1), []);

  // Ref to avoid stale closures in WebSocket message handler
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  const sessionsRef = useRef<SessionInfo[]>([]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // === Per-session helpers ===
  const getOrCreateSessionState = useCallback((sessionId: string): SessionState => {
    let state = sessionStatesRef.current.get(sessionId);
    if (!state) {
      state = createSessionState(sessionId);
      sessionStatesRef.current.set(sessionId, state);
    }
    return state;
  }, []);

  const updateSessionState = useCallback((sessionId: string, updates: Partial<SessionState>): void => {
    const state = getOrCreateSessionState(sessionId);
    Object.assign(state, updates);
    forceSessionUpdate();
  }, [getOrCreateSessionState, forceSessionUpdate]);

  // === Derived active session state ===
  const activeSessionState = useMemo(() => {
    if (!activeSessionId) return null;
    return sessionStatesRef.current.get(activeSessionId) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, sessionStateVersion]);

  const timeline = activeSessionState?.timeline || [];
  const historyMessages = activeSessionState?.historyMessages || [];
  const isProcessing = activeSessionState?.isProcessing || false;
  const tasks = activeSessionState?.tasks || [];
  const sessionStats = activeSessionState?.sessionStats || { ...DEFAULT_STATS };
  const streamingText = activeSessionState?.streamingText || '';
  const thinkingText = activeSessionState?.thinkingText || '';
  const pendingApprovals = activeSessionState?.pendingApprovals || [];

  // Convert timeline to UI messages (derived from active session)
  const timelineConversion = useMemo(() => {
    return convertTimelineToMessages(timeline);
  }, [timeline]);
  const convertedMessages = timelineConversion.messages;
  const toolCalls = timelineConversion.toolCalls;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        log.success('WebSocket', 'Connected');

        // Always send connect message — server will accept without token if auth is disabled
        log.info('WebSocket', authToken ? 'Sending connect message with token' : 'Sending connect message without token');
        ws.send(JSON.stringify({ type: 'connect', authToken: authToken || undefined }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        log.warn('WebSocket', 'Disconnected');
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
        }
      };

      ws.onerror = (error) => {
        log.error('WebSocket', 'Connection error:', error);
        setConnectionError('Connection failed. Make sure the bridge server is running.');
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          if (message.type === 'tool_complete' || message.type === 'tool_input') {
            log.debug('WebSocket', 'RAW WebSocket message:', message.type, message);
          }
          handleServerMessage(message);
        } catch (error) {
          log.error('WebSocket', 'Failed to parse message:', error);
        }
      };
    } catch (error) {
      setConnectionError('Failed to connect to server');
    }
  }, [serverUrl, authToken, enabled]);

  // ============================================================
  // Core message handler — routes per-session state
  // ============================================================
  const handleServerMessage = useCallback((message: ServerMessage) => {
    const msgSessionId = (message as any).sessionId as string | undefined;

    // Add messages to the correct session's timeline
    const skipTimelineFor = ['approval_request', 'diff'];

    if (!skipTimelineFor.includes(message.type) && msgSessionId) {
      const state = getOrCreateSessionState(msgSessionId);
      const serverEvent: TimelineEvent = {
        id: `server-${sequenceCounter}`,
        sequence: sequenceCounter++,
        type: 'server',
        data: message,
      };
      state.timeline = [...state.timeline, serverEvent];
      if (msgSessionId !== activeSessionIdRef.current) {
        state.hasUnreadMessages = true;
      }
      forceSessionUpdate();
    }

    switch (message.type) {
      // ---------- Global handlers ----------
      case 'connection_status':
        if (message.status === 'error') {
          const errorMessage = message.message || 'Connection error';
          setConnectionError(errorMessage);
          setAuthError(errorMessage);
          setIsAuthenticated(false);
        } else if (message.status === 'authenticated') {
          setIsAuthenticated(true);
          setAuthError(null);
        }
        break;

      case 'session_list':
        setSessions(message.sessions);
        // Sync projectPath from server sessions to local session state
        // This ensures terminal commands use the correct cwd even for resumed sessions
        for (const serverSession of message.sessions) {
          if (serverSession.projectPath) {
            const localState = sessionStatesRef.current.get(serverSession.id);
            if (localState && !localState.projectPath) {
              localState.projectPath = serverSession.projectPath;
            }
          }
        }
        break;

      case 'mode_changed':
        setPermissionMode(message.mode);
        break;

      case 'project_list':
        setProjects(message.projects);
        if (message.activeProjectId) setActiveProjectId(message.activeProjectId);
        break;

      case 'project_added':
        setProjects((prev) => [...prev, message.project]);
        break;

      case 'project_removed':
        setProjects((prev) => prev.filter((p) => p.id !== message.projectId));
        break;

      case 'project_selected':
        setActiveProjectId(message.projectId);
        break;

      case 'slash_command_list': {
        const cmdListMsg = message as any;
        setSlashCommands(cmdListMsg.commands);
        break;
      }

      case 'slash_command_result':
        break;

      case 'model_list': {
        const modelListMsg = message as any;
        setAvailableModels(modelListMsg.models);
        setCurrentModel(modelListMsg.currentModel);
        break;
      }

      case 'model_changed': {
        const modelChangedMsg = message as any;
        setCurrentModel(modelChangedMsg.model);
        break;
      }

      case 'saved_session_list': {
        const sessionListMsg = message as any;
        setSavedSessions(sessionListMsg.sessions);
        break;
      }

      case 'session_loaded': {
        const loadedMsg = message as any;
        setLoadedSession(loadedMsg.session);
        break;
      }

      case 'project_memory': {
        const memoryMsg = message as any;
        setMemoryData({
          projectPath: memoryMsg.projectPath,
          projectName: memoryMsg.projectName,
          locations: memoryMsg.locations,
          timestamp: memoryMsg.timestamp,
        });
        break;
      }

      case 'browse_directory': {
        const browseMsg = message as any;
        setBrowseResult({
          path: browseMsg.path,
          parentPath: browseMsg.parentPath,
          entries: browseMsg.entries,
        });
        break;
      }

      case 'session_folder_list': {
        const msg = message as any;
        setSessionFolders({
          basePath: msg.basePath,
          folders: msg.folders,
        });
        break;
      }

      case 'session_folder_created': {
        const msg = message as any;
        setFolderCreationResult({
          success: msg.success,
          folderPath: msg.folderPath,
          folderName: msg.folderName,
          error: msg.error,
        });
        // Auto-refresh the folder list on successful creation
        if (msg.success && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'list_session_folders' }));
        }
        break;
      }

      // ---------- Per-session handlers ----------
      case 'session':
        if (msgSessionId) {
          if (message.status === 'started') {
            // If this is for a locally-created session tab, keep it as active
            // Otherwise set active for new sessions from server
            setActiveSessionId((prev) => prev || msgSessionId);
            updateSessionState(msgSessionId, { isProcessing: true });
          } else if (message.status === 'complete' || message.status === 'error') {
            updateSessionState(msgSessionId, {
              isProcessing: false,
              streamingText: '',
            });
          }
        }
        break;

      case 'stream': {
        const textToAdd = typeof message.text === 'string'
          ? message.text
          : (message.text ? JSON.stringify(message.text) : '');

        if (msgSessionId) {
          const state = getOrCreateSessionState(msgSessionId);
          updateSessionState(msgSessionId, {
            streamingText: state.streamingText + textToAdd,
          });
        }
        break;
      }

      case 'thinking':
        if (msgSessionId) {
          const state = getOrCreateSessionState(msgSessionId);
          updateSessionState(msgSessionId, {
            thinkingText: state.thinkingText + message.text,
          });
        }
        break;

      case 'tool_start':
        break;

      case 'tool_input':
        break;

      case 'tool_complete':
        break;

      case 'approval_request':
        if (msgSessionId) {
          const state = getOrCreateSessionState(msgSessionId);
          const approvalEvent: TimelineEvent = {
            id: `approval-${message.requestId}`,
            sequence: sequenceCounter++,
            type: 'server',
            data: message,
          };
          updateSessionState(msgSessionId, {
            pendingApprovals: [
              ...state.pendingApprovals,
              {
                requestId: message.requestId,
                tool: message.tool,
                input: message.input,
                description: message.description,
              },
            ],
            timeline: [...state.timeline, approvalEvent],
          });
        }
        break;

      case 'diff':
        if (msgSessionId) {
          const state = getOrCreateSessionState(msgSessionId);
          updateSessionState(msgSessionId, {
            pendingApprovals: state.pendingApprovals.map((a) =>
              a.requestId === message.requestId ? { ...a, diff: message } : a
            ),
            timeline: state.timeline.map((event) =>
              event.id === `approval-${message.requestId}`
                ? { ...event, data: { ...(event.data as any), diff: message } }
                : event
            ),
          });
        }
        break;

      case 'result':
        if (msgSessionId) {
          const state = getOrCreateSessionState(msgSessionId);
          const usage = message.usage;
          updateSessionState(msgSessionId, {
            isProcessing: false,
            thinkingText: '',
            sessionStats: {
              totalCost: state.sessionStats.totalCost + (message.totalCost || 0),
              totalTokens: state.sessionStats.totalTokens + (message.tokens || 0),
              inputTokens: state.sessionStats.inputTokens + (usage?.inputTokens || 0),
              outputTokens: state.sessionStats.outputTokens + (usage?.outputTokens || 0),
              cacheCreationTokens: state.sessionStats.cacheCreationTokens + (usage?.cacheCreationTokens || 0),
              cacheReadTokens: state.sessionStats.cacheReadTokens + (usage?.cacheReadTokens || 0),
              turnCount: state.sessionStats.turnCount + 1,
            },
          });
        }
        break;

      case 'task_created':
        if (msgSessionId) {
          const state = getOrCreateSessionState(msgSessionId);
          const newTask = (message as any).task;
          updateSessionState(msgSessionId, { tasks: [...state.tasks, newTask] });
        }
        break;

      case 'task_updated':
        if (msgSessionId) {
          const state = getOrCreateSessionState(msgSessionId);
          const updateMsg = message as any;
          updateSessionState(msgSessionId, {
            tasks: state.tasks.map((task) =>
              task.id === updateMsg.taskId
                ? {
                    ...task,
                    status: updateMsg.status || task.status,
                    subject: updateMsg.subject || task.subject,
                    description: updateMsg.description || task.description,
                    activeForm: updateMsg.activeForm || task.activeForm,
                  }
                : task
            ),
          });
        }
        break;

      case 'task_list':
        if (msgSessionId) {
          const taskListMsg = message as any;
          updateSessionState(msgSessionId, { tasks: taskListMsg.tasks });
        }
        break;

      case 'session_resume_history': {
        const resumeHistoryMsg = message as any;
        const resumeSid = resumeHistoryMsg.sessionId;
        log.info('WebSocket', 'SessionResume: Received history:', resumeHistoryMsg.messages?.length, 'messages for session:', resumeSid);

        const histMsgs = resumeHistoryMsg.messages?.map((msg: any, idx: number) => {
          const timestamp = msg.timestamp || Date.now();
          if (msg.role === 'assistant') {
            return {
              id: `history-${resumeSid}-${idx}`,
              role: msg.role,
              content: Array.isArray(msg.content) ? msg.content : [
                { type: 'text' as const, text: String(msg.content || '') }
              ],
              timestamp,
              model: msg.model,
            };
          } else {
            let contentString = '';
            if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === 'text') contentString += block.text;
              }
            } else if (typeof msg.content === 'string') {
              contentString = msg.content;
            }
            return {
              id: `history-${resumeSid}-${idx}`,
              role: msg.role,
              content: contentString,
              timestamp,
            };
          }
        }) || [];

        if (resumeSid) {
          updateSessionState(resumeSid, { historyMessages: histMsgs });
        }
        break;
      }

      // ---------- File search/preview handlers ----------
      case 'file_search_result': {
        const msg = message as any;
        setFileSearchResults(msg.entries || []);
        setIsFileSearching(false);
        break;
      }

      case 'file_preview_result': {
        const msg = message as any;
        setFilePreview(msg);
        setFilePreviewError(null);
        setIsFilePreviewLoading(false);
        break;
      }

      case 'file_preview_error': {
        const msg = message as any;
        setFilePreviewError(msg.error);
        setFilePreview(null);
        setIsFilePreviewLoading(false);
        break;
      }

      case 'file_save_result': {
        const msg = message as any;
        setFileSaveResult({ success: msg.success, error: msg.error });
        // If save was successful, refresh the preview
        if (msg.success && filePreview?.filePath === msg.filePath) {
          // Re-request preview to get updated content
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'file_preview', filePath: msg.filePath }));
          }
        }
        break;
      }

      // ---------- Direct terminal handlers ----------
      case 'terminal_start':
      case 'terminal_output':
      case 'terminal_exit':
        // These are handled via timeline → timelineAdapter
        // terminal_start/output/exit are already added to timeline above
        // No extra state management needed here
        break;

      case 'session_resumed': {
        const resumedMsg = message as any;
        const newSid = resumedMsg.newSessionId;
        log.success('WebSocket', 'SavedSessions: Session resumed:', newSid);

        // Clear stale timeline — history was already loaded via session_resume_history
        const state = getOrCreateSessionState(newSid);
        updateSessionState(newSid, {
          timeline: [],
          streamingText: '',
          thinkingText: '',
          tasks: [],
          isProcessing: false,
          pendingApprovals: [],
          sessionStats: { ...DEFAULT_STATS },
          hasUnreadMessages: false,
          // historyMessages NOT cleared — just set by session_resume_history
        });

        // Store projectPath from resumed session so terminal uses correct cwd
        if (resumedMsg.projectPath) {
          state.projectPath = resumedMsg.projectPath;
          state.displayName = state.displayName || resumedMsg.projectName || resumedMsg.projectPath.split('/').pop();
        }

        setActiveSessionId(newSid);
        setLoadedSession(null);
        break;
      }

      // ---------- Ticket handlers ----------
      case 'ticket_list_response': {
        const msg = message as any;
        useTicketStore.getState().setTickets(
          msg.tickets || [],
          msg.readyTickets || [],
          msg.blockedTickets || []
        );
        break;
      }

      case 'ticket_created': {
        const msg = message as any;
        useTicketStore.getState().addTicket(msg.ticket);
        break;
      }

      case 'ticket_updated': {
        const msg = message as any;
        useTicketStore.getState().updateTicket(msg.ticket);
        break;
      }

      case 'ticket_deleted': {
        const msg = message as any;
        useTicketStore.getState().removeTicket(msg.ticketId);
        break;
      }

      case 'ticket_dep_tree_response': {
        const msg = message as any;
        useTicketStore.getState().setDepTree(msg.rootId, msg.tree);
        break;
      }

      case 'ticket_error': {
        const msg = message as any;
        useTicketStore.getState().setError(msg.error);
        break;
      }
    }

    // Store raw messages for debugging
    setRawMessages((prev) => [...prev, message]);
  }, [getOrCreateSessionState, updateSessionState, forceSessionUpdate]);

  // Connect on mount
  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect, enabled]);

  // Request slash commands and models on connection
  useEffect(() => {
    if (isAuthenticated && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'list_slash_commands', sessionId: activeSessionId }));
      wsRef.current.send(JSON.stringify({ type: 'list_models' }));
    }
  }, [isAuthenticated, activeSessionId]);

  // ============================================================
  // Actions
  // ============================================================

  const sendPrompt = useCallback(
    (text: string, options?: {
      projectPath?: string;
      permissionMode?: PermissionMode;
      maxThinkingTokens?: number;
    }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      // Auto-create a session if none exists (fixes first message not showing)
      let currentActiveId = activeSessionIdRef.current;
      if (!currentActiveId) {
        currentActiveId = generateUUID();
        getOrCreateSessionState(currentActiveId);
        setActiveSessionId(currentActiveId);
        activeSessionIdRef.current = currentActiveId;
      }

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      const userEvent: TimelineEvent = {
        id: userMessage.id,
        sequence: sequenceCounter++,
        type: 'user',
        data: userMessage,
      };

      const state = getOrCreateSessionState(currentActiveId);
      state.timeline = [...state.timeline, userEvent];
      state.isProcessing = true;
      state.streamingText = '';
      state.thinkingText = '';
      state.tasks = [];
      if (!state.displayName) {
        state.displayName = text.substring(0, 35) + (text.length > 35 ? '...' : '');
      }
      forceSessionUpdate();

      setMessages((prev) => [...prev, userMessage]);

      // Use explicit projectPath, or fall back to session's stored projectPath
      const resolvedProjectPath = options?.projectPath || state?.projectPath;

      // Store the resolved projectPath in session state so terminal commands can use it
      if (resolvedProjectPath && !state.projectPath) {
        state.projectPath = resolvedProjectPath;
      }

      wsRef.current.send(
        JSON.stringify({
          type: 'prompt',
          text,
          sessionId: currentActiveId,
          projectPath: resolvedProjectPath,
          permissionMode: options?.permissionMode || permissionMode,
          model: currentModel,
          maxThinkingTokens: options?.maxThinkingTokens,
        })
      );
    },
    [permissionMode, currentModel, getOrCreateSessionState, forceSessionUpdate]
  );

  const setMode = useCallback((mode: PermissionMode) => {
    setPermissionMode(mode);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    wsRef.current.send(JSON.stringify({ type: 'set_mode', sessionId: sid, mode }));
  }, []);

  const exitPlanMode = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    wsRef.current.send(JSON.stringify({ type: 'exit_plan_mode', sessionId: sid }));
  }, []);

  const selectProject = useCallback((projectId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'select_project', projectId }));
  }, []);

  const browseDirectory = useCallback((dirPath?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'browse_directory', path: dirPath }));
  }, []);

  const listSessionFolders = useCallback((search?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'list_session_folders', search }));
  }, []);

  const createSessionFolder = useCallback((folderName: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setFolderCreationResult(null); // clear previous result
    wsRef.current.send(JSON.stringify({ type: 'create_session_folder', folderName }));
  }, []);

  const clearFolderCreationResult = useCallback(() => {
    setFolderCreationResult(null);
  }, []);

  // Spotlight file search actions
  const searchFiles = useCallback((query: string, projectPath?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setIsFileSearching(true);
    wsRef.current.send(JSON.stringify({ type: 'file_search', query, projectPath }));
  }, []);

  const requestFilePreview = useCallback((filePath: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setIsFilePreviewLoading(true);
    setFilePreviewError(null);
    setFileSaveResult(null);
    wsRef.current.send(JSON.stringify({ type: 'file_preview', filePath }));
  }, []);

  const saveFile = useCallback((filePath: string, content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setFileSaveResult(null);
    wsRef.current.send(JSON.stringify({ type: 'file_save', filePath, content }));
  }, []);

  const clearFilePreview = useCallback(() => {
    setFilePreview(null);
    setFilePreviewError(null);
    setFileSaveResult(null);
  }, []);

  const refreshProjects = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'list_projects' }));
  }, []);

  const handleApproval = useCallback(
    (requestId: string, decision: 'allow' | 'deny', reason?: string, _answers?: Record<string, string>) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      // If a reason/message is provided, set followUpPrompt so the server uses it as a prompt
      const followUpPrompt = reason ? true : undefined;
      wsRef.current.send(JSON.stringify({ type: 'approval', requestId, decision, reason, answers: _answers, followUpPrompt }));

      const sid = activeSessionIdRef.current;
      if (sid) {
        const state = sessionStatesRef.current.get(sid);
        if (state) {
          updateSessionState(sid, {
            pendingApprovals: state.pendingApprovals.filter((a) => a.requestId !== requestId),
            timeline: state.timeline.filter((event) => event.id !== `approval-${requestId}`),
          });
        }
      }
    },
    [updateSessionState]
  );

  const answerQuestion = useCallback(
    (requestId: string, answers: Record<string, string | string[]>, action?: string, customInput?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const sid = activeSessionIdRef.current;
      if (!sid) return;

      const state = sessionStatesRef.current.get(sid);
      if (state) {
        updateSessionState(sid, {
          timeline: state.timeline.map((event) => {
            if (event.type === 'server') {
              const serverMsg = event.data as ServerMessage;
              if (serverMsg.type === 'ask_user_question' && (serverMsg as any).requestId === requestId) {
                return { ...event, data: { ...serverMsg, resolved: true } as ServerMessage };
              }
            }
            return event;
          }),
        });
      }

      wsRef.current.send(JSON.stringify({ type: 'answer_question', requestId, sessionId: sid, answers, action, customInput }));
    },
    [updateSessionState]
  );

  const interrupt = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    wsRef.current.send(JSON.stringify({ type: 'interrupt', sessionId: sid }));
    updateSessionState(sid, { isProcessing: false });
  }, [updateSessionState]);

  // Direct terminal command execution (bypasses Claude SDK)
  const sendTerminalCommand = useCallback((command: string, cwd?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    let currentActiveId = activeSessionIdRef.current;
    if (!currentActiveId) {
      currentActiveId = generateUUID();
      getOrCreateSessionState(currentActiveId);
      setActiveSessionId(currentActiveId);
      activeSessionIdRef.current = currentActiveId;
    }

    // Add a user message to timeline showing the command
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `$ ${command}`,
      timestamp: new Date(),
    };
    const userEvent: TimelineEvent = {
      id: userMessage.id,
      sequence: sequenceCounter++,
      type: 'user',
      data: userMessage,
    };
    const state = getOrCreateSessionState(currentActiveId);
    state.timeline = [...state.timeline, userEvent];
    if (!state.displayName) {
      state.displayName = `$ ${command.substring(0, 30)}${command.length > 30 ? '...' : ''}`;
    }
    forceSessionUpdate();

    // Resolve cwd: explicit cwd → session state projectPath → server session projectPath
    let resolvedCwd = cwd;
    if (!resolvedCwd && state.projectPath) {
      resolvedCwd = state.projectPath;
    }
    if (!resolvedCwd) {
      // Check server-side sessions for projectPath
      const serverSession = sessionsRef.current.find(s => s.id === currentActiveId);
      if (serverSession?.projectPath) {
        resolvedCwd = serverSession.projectPath;
      }
    }

    wsRef.current.send(JSON.stringify({
      type: 'terminal_command',
      command,
      sessionId: currentActiveId,
      cwd: resolvedCwd,
    }));
  }, [getOrCreateSessionState, forceSessionUpdate]);

  const interruptTerminalCommand = useCallback((commandId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    const sid = activeSessionIdRef.current || '';
    const msg = {
      type: 'terminal_interrupt',
      commandId,
      sessionId: sid,
    };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  const clearTerminal = useCallback(() => {
    const sid = activeSessionIdRef.current;
    if (sid) {
      updateSessionState(sid, {
        timeline: [],
        historyMessages: [],
        tasks: [],
        streamingText: '',
        thinkingText: '',
        isProcessing: false,
        pendingApprovals: [],
        sessionStats: { ...DEFAULT_STATS },
        hasUnreadMessages: false,
      });
    }
    setMessages([]);
    setRawMessages([]);
  }, [updateSessionState]);

  // === Session-targeted actions (for multi-pane mode) ===
  // These target a specific session WITHOUT changing activeSessionId

  const sendPromptToSession = useCallback(
    (sessionId: string, text: string, options?: {
      projectPath?: string;
      permissionMode?: PermissionMode;
      maxThinkingTokens?: number;
    }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      const userEvent: TimelineEvent = {
        id: userMessage.id,
        sequence: sequenceCounter++,
        type: 'user',
        data: userMessage,
      };

      const state = getOrCreateSessionState(sessionId);
      state.timeline = [...state.timeline, userEvent];
      state.isProcessing = true;
      state.streamingText = '';
      state.thinkingText = '';
      state.tasks = [];
      if (!state.displayName) {
        state.displayName = text.substring(0, 35) + (text.length > 35 ? '...' : '');
      }
      forceSessionUpdate();

      const resolvedProjectPath = options?.projectPath || state.projectPath;
      if (resolvedProjectPath && !state.projectPath) {
        state.projectPath = resolvedProjectPath;
      }

      wsRef.current.send(
        JSON.stringify({
          type: 'prompt',
          text,
          sessionId,
          projectPath: resolvedProjectPath,
          permissionMode: options?.permissionMode || permissionMode,
          model: currentModel,
          maxThinkingTokens: options?.maxThinkingTokens,
        })
      );
    },
    [permissionMode, currentModel, getOrCreateSessionState, forceSessionUpdate]
  );

  const interruptSession = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'interrupt', sessionId }));
    updateSessionState(sessionId, { isProcessing: false });
  }, [updateSessionState]);

  const handleApprovalForSession = useCallback(
    (sessionId: string, requestId: string, decision: 'allow' | 'deny', reason?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      // If a reason/message is provided, set followUpPrompt so the server uses it as a prompt
      const followUpPrompt = reason ? true : undefined;
      wsRef.current.send(JSON.stringify({ type: 'approval', requestId, decision, reason, followUpPrompt }));

      const state = sessionStatesRef.current.get(sessionId);
      if (state) {
        updateSessionState(sessionId, {
          pendingApprovals: state.pendingApprovals.filter((a) => a.requestId !== requestId),
          timeline: state.timeline.filter((event) => event.id !== `approval-${requestId}`),
        });
      }
    },
    [updateSessionState]
  );

  const answerQuestionForSession = useCallback(
    (sessionId: string, requestId: string, answers: Record<string, string | string[]>, action?: string, customInput?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const state = sessionStatesRef.current.get(sessionId);
      if (state) {
        updateSessionState(sessionId, {
          timeline: state.timeline.map((event) => {
            if (event.type === 'server') {
              const serverMsg = event.data as ServerMessage;
              if (serverMsg.type === 'ask_user_question' && (serverMsg as any).requestId === requestId) {
                return { ...event, data: { ...serverMsg, resolved: true } as ServerMessage };
              }
            }
            return event;
          }),
        });
      }

      wsRef.current.send(JSON.stringify({ type: 'answer_question', requestId, sessionId, answers, action, customInput }));
    },
    [updateSessionState]
  );

  const clearTerminalForSession = useCallback((sessionId: string) => {
    updateSessionState(sessionId, {
      timeline: [],
      historyMessages: [],
      tasks: [],
      streamingText: '',
      thinkingText: '',
      isProcessing: false,
      pendingApprovals: [],
      sessionStats: { ...DEFAULT_STATS },
      hasUnreadMessages: false,
    });
  }, [updateSessionState]);

  const sendTerminalCommandToSession = useCallback((sessionId: string, command: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `$ ${command}`,
      timestamp: new Date(),
    };
    const userEvent: TimelineEvent = {
      id: userMessage.id,
      sequence: sequenceCounter++,
      type: 'user',
      data: userMessage,
    };
    const state = getOrCreateSessionState(sessionId);
    state.timeline = [...state.timeline, userEvent];
    if (!state.displayName) {
      state.displayName = `$ ${command.substring(0, 30)}${command.length > 30 ? '...' : ''}`;
    }
    forceSessionUpdate();

    let resolvedCwd = state.projectPath;
    if (!resolvedCwd) {
      const serverSession = sessionsRef.current.find(s => s.id === sessionId);
      if (serverSession?.projectPath) {
        resolvedCwd = serverSession.projectPath;
      }
    }

    wsRef.current.send(JSON.stringify({
      type: 'terminal_command',
      command,
      sessionId,
      cwd: resolvedCwd,
    }));
  }, [getOrCreateSessionState, forceSessionUpdate]);

  const interruptTerminalCommandForSession = useCallback((sessionId: string, commandId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'terminal_interrupt',
      commandId,
      sessionId,
    }));
  }, []);

  const executeSlashCommand = useCallback((command: string, args?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const sessionId = activeSessionIdRef.current || undefined;
    wsRef.current.send(JSON.stringify({ type: 'execute_slash_command', sessionId, command, args }));
  }, []);

  const changeModel = useCallback((model: string) => {
    // Store the alias (unique identifier) as currentModel, not the shared base ID.
    // Aliases distinguish variants (e.g., 'opus' vs 'opus-1m') while IDs are shared.
    let displayKey = model;
    if (availableModels.length > 0) {
      const modelInfo = availableModels.find(m => m.alias === model || m.id === model);
      if (modelInfo) {
        displayKey = modelInfo.alias || modelInfo.id;
      }
    }
    setCurrentModel(displayKey);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    wsRef.current.send(JSON.stringify({ type: 'set_model', sessionId: sid, model: displayKey }));
  }, [availableModels]);

  const listSavedSessions = useCallback((projectId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'list_saved_sessions', projectId }));
  }, []);

  const loadSession = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'load_session', sessionId }));
  }, []);

  const resumeSession = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'resume_session', sessionId }));
  }, []);

  const requestMemory = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'get_project_memory' }));
  }, []);

  // ============================================================
  // Multi-session management
  // ============================================================

  const createSession = useCallback(() => {
    const newId = generateUUID();
    getOrCreateSessionState(newId);
    setActiveSessionId(newId);
    forceSessionUpdate();
    return newId;
  }, [getOrCreateSessionState, forceSessionUpdate]);

  const createSessionInFolder = useCallback((folderPath: string) => {
    const newId = generateUUID();
    const state = getOrCreateSessionState(newId);
    state.projectPath = folderPath;
    state.displayName = folderPath.split('/').pop() || folderPath;
    setActiveSessionId(newId);
    forceSessionUpdate();
    return newId;
  }, [getOrCreateSessionState, forceSessionUpdate]);

  const switchSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    const state = sessionStatesRef.current.get(sessionId);
    if (state) {
      state.hasUnreadMessages = false;
      // Sync projectPath from server session if not set locally
      if (!state.projectPath) {
        const serverSession = sessionsRef.current.find(s => s.id === sessionId);
        if (serverSession?.projectPath) {
          state.projectPath = serverSession.projectPath;
        }
      }
      forceSessionUpdate();
    }
  }, [forceSessionUpdate]);

  const closeSession = useCallback((sessionId: string) => {
    // Send close request to server
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'close_session', sessionId }));
    }

    // Remove from local state
    sessionStatesRef.current.delete(sessionId);

    // If closing the active session, switch to another one
    if (activeSessionId === sessionId) {
      const remainingIds = Array.from(sessionStatesRef.current.keys());
      if (remainingIds.length > 0) {
        setActiveSessionId(remainingIds[0]);
      } else {
        // No sessions left, create a new one
        const newId = generateUUID();
        getOrCreateSessionState(newId);
        setActiveSessionId(newId);
      }
    }

    forceSessionUpdate();
  }, [activeSessionId, getOrCreateSessionState, forceSessionUpdate]);

  const renameSession = useCallback((sessionId: string, newName: string) => {
    const state = sessionStatesRef.current.get(sessionId);
    if (state) {
      state.displayName = newName;
      forceSessionUpdate();
    }
  }, [forceSessionUpdate]);

  const allSessionIds = useMemo(() => {
    const ids = new Set<string>();
    sessions.forEach(s => ids.add(s.id));
    sessionStatesRef.current.forEach((_, id) => ids.add(id));
    return Array.from(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sessionStateVersion]);

  return {
    // Connection state
    isConnected,
    isAuthenticated,
    authError,
    connectionError,
    // Chat state (derived from active session)
    messages,
    rawMessages,
    timeline,
    streamingText,
    thinkingText,
    // UI state (derived from active session)
    convertedMessages,
    toolCalls,
    slashCommands,
    availableModels,
    currentModel,
    historyMessages,
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
    // Session statistics
    sessionStats,
    // Saved sessions
    savedSessions,
    loadedSession,
    setLoadedSession,
    // Actions
    sendPrompt,
    handleApproval,
    answerQuestion,
    interrupt,
    setActiveSessionId,
    setMode,
    exitPlanMode,
    selectProject,
    browseDirectory,
    browseResult,
    listSessionFolders,
    createSessionFolder,
    sessionFolders,
    folderCreationResult,
    clearFolderCreationResult,
    refreshProjects,
    clearTerminal,
    executeSlashCommand,
    changeModel,
    listSavedSessions,
    loadSession,
    resumeSession,
    // Memory management
    memoryData,
    requestMemory,
    // Multi-session management
    createSession,
    createSessionInFolder,
    switchSession,
    closeSession,
    allSessionIds,
    sessionStates: sessionStatesRef.current,
    // Direct terminal execution
    sendTerminalCommand,
    interruptTerminalCommand,
    // Session-targeted actions (for multi-pane mode)
    sendPromptToSession,
    interruptSession,
    handleApprovalForSession,
    answerQuestionForSession,
    clearTerminalForSession,
    sendTerminalCommandToSession,
    interruptTerminalCommandForSession,
    // Session rename
    renameSession,
    // File search and preview
    searchFiles,
    fileSearchResults,
    isFileSearching,
    requestFilePreview,
    filePreview,
    filePreviewError,
    isFilePreviewLoading,
    saveFile,
    fileSaveResult,
    clearFilePreview,
    // Ticket management (generic send for ticket_* messages)
    sendTicketMessage: useCallback((msg: any) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify(msg));
    }, []),
  };
}
