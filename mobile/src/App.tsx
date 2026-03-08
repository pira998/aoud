import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { generateUUID } from './utils/uuid';
import { useWebSocket } from './hooks/useWebSocket';
import { useMultiInstanceWebSocket } from './hooks/useMultiInstanceWebSocket';
import { useDesktopDetect } from './hooks/useDesktopDetect';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AuthErrorModal } from './components/AuthErrorModal';
import { Settings, Home, Terminal, Plus, RefreshCw, History, ClipboardList, LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from './lib/utils';
import { convertTimelineToMessages } from './lib/timelineAdapter';
import { AnimatedBackground } from './components/ui/AnimatedBackground';
import { usePaneStore } from './store/paneStore';
import { motion } from 'framer-motion';
import type { PermissionMode } from '../../../shared/types';
import { log } from './lib/logger';

// Lazy load heavy components that are conditionally rendered
const SessionList = lazy(() => import('./components/SessionList').then(m => ({ default: m.SessionList })));
const SessionTabs = lazy(() => import('./components/SessionTabs').then(m => ({ default: m.SessionTabs })));
const ChatHistoryView = lazy(() => import('./components/ChatHistoryView').then(m => ({ default: m.ChatHistoryView })));
const SessionViewer = lazy(() => import('./components/SessionViewer').then(m => ({ default: m.SessionViewer })));
const TerminalView = lazy(() => import('./components/Terminal').then(m => ({ default: m.Terminal })));
const NewSessionDialog = lazy(() => import('./components/NewSessionDialog').then(m => ({ default: m.NewSessionDialog })));
const MultiPaneView = lazy(() => import('./components/MultiPaneView').then(m => ({ default: m.MultiPaneView })));
const TicketsView = lazy(() => import('./components/tickets/TicketsView').then(m => ({ default: m.TicketsView })));
const SpotlightSearchComponent = lazy(() => import('./components/SpotlightSearch').then(m => ({ default: m.SpotlightSearch })));
const FilePreviewComponent = lazy(() => import('./components/FilePreview').then(m => ({ default: m.FilePreview })));

// Extract connection info from URL or localStorage
const getConnectionInfo = (): { url: string; token: string | null } => {
  // Check for ?connect= parameter (from QR code scan)
  const params = new URLSearchParams(window.location.search);
  const connectParam = params.get('connect');
  const tokenParam = params.get('token');

  if (connectParam) {
    // Save the connection URL from QR code
    localStorage.setItem('aoud-server-url', connectParam);
    if (tokenParam) {
      localStorage.setItem('aoud-auth-token', tokenParam);
      log.info('App', 'QR Code: Auth token saved:', tokenParam.substring(0, 8) + '...');
    }
    // Clear the query parameter from URL for clean appearance
    window.history.replaceState({}, '', window.location.pathname);
    log.info('App', 'QR Code: Auto-connected to:', connectParam);
    return { url: connectParam, token: tokenParam };
  }

  // Check localStorage for previously saved values
  const savedUrl = localStorage.getItem('aoud-server-url');
  const savedToken = localStorage.getItem('aoud-auth-token');

  if (savedUrl) {
    log.info('App', 'LocalStorage: Using saved connection');
    return { url: savedUrl, token: savedToken };
  }

  // Auto-detect: use the same host that served this page
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname || 'localhost';
  let port = window.location.port;

  // In Vite dev mode (port 5173), connect to the bridge server on port 3001
  if (import.meta.env.DEV && port === '5173') {
    port = '3001';
    log.info('App', 'Dev Mode: Redirecting WebSocket to bridge server on port 3001');
  }

  // If served via tunnel (ngrok, localtunnel, etc), don't add port
  // Tunnels handle port internally and adding :3001 breaks the connection
  const isTunnel = host.includes('.ngrok') || host.includes('.loca.lt') ||
                   host.includes('.ngrok-free.app') || host.includes('.localtunnel.me');

  let url: string;
  if (isTunnel || !port) {
    // Tunnel URL or standard HTTPS port - don't append port
    url = `${protocol}//${host}`;
  } else {
    // Local development - include port
    url = `${protocol}//${host}:${port}`;
  }

  log.info('App', 'Auto-detect: Using:', url);
  return { url, token: null };
};

function App() {
  // Extract connection info on mount
  const connectionInfo = getConnectionInfo();
  const [serverUrl, setServerUrl] = useState(connectionInfo.url);
  const [authToken] = useState(connectionInfo.token || '');
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState<'terminal' | 'sessions' | 'tickets' | 'history'>('terminal');
  const [showNewSession, setShowNewSession] = useState(false);
  const [customUrl, setCustomUrl] = useState(serverUrl);
  const [customToken, setCustomToken] = useState(authToken);
  const [useMultiInstance, setUseMultiInstance] = useState(false);

  // Determine if this is a direct QR code connection vs multi-instance discovery
  // For now, always enable single instance mode for simplicity
  // Multi-instance can be added back later if needed
  const enableSingleInstance = true;

  // Enable multi-instance only when explicitly requested
  const multiInstance = useMultiInstanceWebSocket(false);
  const {
    instances,
    activeInstanceId,
    setActiveInstanceId: setActiveInstance,
    sendToInstance,
    getTimeline: getInstanceTimeline,
    getConnectionStatus,
    getConnection,
    addToTimeline,
    refreshInstances,
  } = multiInstance;

  // Single-instance mode (now always enabled)
  const singleInstance = useWebSocket(serverUrl, authToken || null, enableSingleInstance);
  const {
    isConnected,
    isAuthenticated,
    authError,
    connectionError,
    timeline: singleTimeline,
    historyMessages: singleHistoryMessages,
    sessions,
    activeSessionId,
    isProcessing,
    tasks,
    projects,
    activeProjectId,
    sendPrompt: sendSinglePrompt,
    handleApproval: handleSingleApproval,
    answerQuestion: answerSingleQuestion,
    clearTerminal,
    slashCommands,
    availableModels,
    currentModel,
    permissionMode,
    setMode,
    changeModel,
    streamingText,
    interrupt,
    sessionStats,
    executeSlashCommand,
    savedSessions,
    loadedSession,
    setLoadedSession,
    listSavedSessions,
    loadSession,
    resumeSession,
    // Project management
    // selectProject,
    listSessionFolders,
    createSessionFolder,
    sessionFolders,
    folderCreationResult,
    clearFolderCreationResult,
    // refreshProjects,
    // Multi-session management
    createSession,
    createSessionInFolder,
    switchSession,
    closeSession,
    allSessionIds,
    sessionStates,
    // Pre-converted from active session
    convertedMessages: hookConvertedMessages,
    toolCalls: hookToolCalls,
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
    // Ticket management
    sendTicketMessage,
  } = singleInstance;

  // Desktop detection and pane store for multi-pane view
  const isDesktop = useDesktopDetect();
  const paneViewMode = usePaneStore((s) => s.viewMode);
  const setPaneViewMode = usePaneStore((s) => s.setViewMode);

  // Auto-fallback to tab mode when viewport shrinks below desktop
  useEffect(() => {
    if (!isDesktop && paneViewMode === 'pane') {
      setPaneViewMode('tab');
    }
  }, [isDesktop, paneViewMode, setPaneViewMode]);

  // Determine which mode to use based on available instances
  const hasMultipleInstances = instances.length > 1;
  const shouldUseMultiInstance = instances.length > 0 || useMultiInstance;

  // Multi-pane mode: active only on desktop, in pane mode, and not using multi-instance
  const isMultiPaneActive = isDesktop && paneViewMode === 'pane' && !shouldUseMultiInstance;

  // Get active instance data
  const activeInstance = instances.find(i => i.instanceId === activeInstanceId);
  const instanceStatus = activeInstanceId ? getConnectionStatus(activeInstanceId) : { isConnected: false, isAuthenticated: false };
  const instanceTimeline = activeInstanceId ? getInstanceTimeline(activeInstanceId) : [];

  // Unified interface - works with both modes
  const currentIsConnected = shouldUseMultiInstance ? instanceStatus.isConnected : isConnected;
  const currentIsAuthenticated = shouldUseMultiInstance ? instanceStatus.isAuthenticated : isAuthenticated;
  const currentTimeline = shouldUseMultiInstance ? instanceTimeline : singleTimeline;

  // Convert current timeline to UI messages (handle both modes)
  // For single-instance mode, the hook already converts per-session timelines
  const timelineResult = useMemo(() => {
    if (shouldUseMultiInstance) {
      // Multi-instance mode: convert instance timeline
      const result = convertTimelineToMessages(currentTimeline);
      return { messages: result.messages, toolCalls: result.toolCalls };
    }

    // Single-instance mode: use hook's pre-converted per-session data
    // Prepend history messages for resumed sessions
    const allMessages = [...(singleHistoryMessages || []), ...hookConvertedMessages];
    return { messages: allMessages, toolCalls: hookToolCalls };
  }, [shouldUseMultiInstance, currentTimeline, singleHistoryMessages, hookConvertedMessages, hookToolCalls]);

  const displayMessages = timelineResult.messages;
  const displayToolCalls = timelineResult.toolCalls;

  // Ensure slash commands has a default
  const displaySlashCommands = slashCommands.length > 0 ? slashCommands : [
    { name: 'clear', description: 'Clear terminal', argumentHint: '' },
    { name: 'help', description: 'Show help', argumentHint: '' },
  ];

  // Derive terminal running state from messages
  const activeTerminalMsg = displayMessages.find(
    (m) => m.role === 'terminal' && (m as any).isRunning
  ) as any;
  const isTerminalRunning = !!activeTerminalMsg;
  const activeTerminalCommandId = activeTerminalMsg?.commandId || null;

  const sendPrompt = (text: string, options?: {
    projectPath?: string;
    permissionMode?: PermissionMode;
    maxThinkingTokens?: number;
  }) => {
    if (shouldUseMultiInstance && activeInstanceId) {
      // Create user message
      const userMessage = {
        id: generateUUID(),
        role: 'user' as const,
        content: text,
        timestamp: new Date().toISOString(),
      };

      // Add to timeline BEFORE sending
      const connection = getConnection(activeInstanceId);
      if (connection) {
        const sequence = connection.timeline.length;
        const userEvent = {
          id: userMessage.id,
          sequence,
          type: 'user' as const,
          data: userMessage,
        };

        addToTimeline(activeInstanceId, userEvent);
      }

      // Then send to server
      sendToInstance(activeInstanceId, { type: 'prompt', text });
    } else {
      sendSinglePrompt(text, options);
    }
  };

  // handleApproval - kept for potential future use with approval-based tool flows
  // Currently, questions use handleAnswerQuestion instead

  const handleAnswerQuestion = (requestId: string, answers: Record<string, string | string[]>, action?: string, customInput?: string) => {
    if (shouldUseMultiInstance && activeInstanceId) {
      // For multi-instance, need to get sessionId from instance state
      const instanceConnection = getConnection(activeInstanceId);
      if (instanceConnection) {
        sendToInstance(activeInstanceId, {
          type: 'answer_question',
          requestId,
          sessionId: activeInstanceId, // Use instance ID as session ID for multi-instance
          answers,
          action,
          customInput,
        });
      }
    } else {
      answerSingleQuestion(requestId, answers, action, customInput);
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('aoud-server-url', customUrl);
    if (customToken) {
      localStorage.setItem('aoud-auth-token', customToken);
    } else {
      localStorage.removeItem('aoud-auth-token');
    }
    setServerUrl(customUrl);
    setShowSettings(false);
    // Force reconnect by reloading
    window.location.reload();
  };

  // Load saved sessions when switching to history view
  useEffect(() => {
    if (currentView === 'history' && isAuthenticated) {
      const projectId = projects.find(p => p.id === activeProjectId)?.id;
      listSavedSessions(projectId);
    }
  }, [currentView, isAuthenticated, activeProjectId, projects, listSavedSessions]);


  const handleOpenNewSession = () => {
    setShowNewSession(true);
    listSessionFolders();
  };

  const handleFolderSelected = (folderPath: string) => {
    setShowNewSession(false);
    clearFolderCreationResult();
    createSessionInFolder(folderPath);
    setCurrentView('terminal');
  };

  // === Spotlight Search State ===
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isFilePreviewOpen, setIsFilePreviewOpen] = useState(false);
  const [filePreviewMode, setFilePreviewMode] = useState<'view' | 'edit'>('view');
  const [insertTextForInput, setInsertTextForInput] = useState<string | null>(null);

  const handleSpotlightOpen = useCallback(() => {
    setIsSpotlightOpen(true);
  }, []);

  const handleSpotlightClose = useCallback(() => {
    setIsSpotlightOpen(false);
  }, []);

  const handleSpotlightSearch = useCallback((query: string) => {
    const projectPath = (activeSessionId && sessionStates.get(activeSessionId)?.projectPath)
      || projects.find(p => p.id === activeProjectId)?.path;
    searchFiles(query, projectPath);
  }, [searchFiles, activeSessionId, sessionStates, projects, activeProjectId]);

  const handleFileView = useCallback((filePath: string) => {
    setFilePreviewMode('view');
    setIsFilePreviewOpen(true);
    requestFilePreview(filePath);
  }, [requestFilePreview]);

  const handleFileEdit = useCallback((filePath: string) => {
    setFilePreviewMode('edit');
    setIsFilePreviewOpen(true);
    requestFilePreview(filePath);
  }, [requestFilePreview]);

  const handleFileSelect = useCallback((_filePath: string, fileName: string) => {
    // Insert @filename into the prompt input
    setInsertTextForInput(`@${fileName} `);
  }, []);

  const handleInsertTextConsumed = useCallback(() => {
    setInsertTextForInput(null);
  }, []);

  const handleFilePreviewClose = useCallback(() => {
    setIsFilePreviewOpen(false);
    clearFilePreview();
  }, [clearFilePreview]);

  const handleTogglePreviewMode = useCallback(() => {
    setFilePreviewMode(prev => prev === 'view' ? 'edit' : 'view');
  }, []);

  return (
    <div className="flex flex-col h-full text-foreground safe-area-top">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Header with Glassmorphism and Navigation */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-50 border-b border-border/50 bg-card/80 backdrop-blur-md px-4 py-3"
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: Logo */}
          <div className="flex items-center gap-2 min-w-fit">
            <img src="/logo.png" alt="Aoud Logo" className="h-8 w-8" />
            <h1 className="text-lg font-semibold hidden sm:block">Aoud Code</h1>
          </div>

          {/* Center: Navigation Tabs */}
          <div className="flex items-center justify-center gap-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentView('terminal')}
              className={cn(
                "relative flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all font-medium",
                currentView === 'terminal'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Terminal className="h-4 w-4" />
              <span className="hidden sm:inline">Terminal</span>
              {currentView === 'terminal' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentView('sessions')}
              className={cn(
                "relative flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all font-medium",
                currentView === 'sessions'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Sessions</span>
              {currentView === 'sessions' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentView('tickets')}
              className={cn(
                "relative flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all font-medium",
                currentView === 'tickets'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Tickets</span>
              {currentView === 'tickets' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentView('history')}
              className={cn(
                "relative flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all font-medium",
                currentView === 'history'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
              {currentView === 'history' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            {currentView === 'terminal' && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={clearTerminal}
                className="ml-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-colors font-medium"
                title="Clear terminal"
              >
                Clear
              </motion.button>
            )}
          </div>

          {/* Right: Status, Multi-Pane Toggle, and Settings */}
          <div className="flex items-center gap-3 min-w-fit">
            <ConnectionStatus isConnected={currentIsConnected} error={connectionError} />
            {/* Multi-Pane / Tab view toggle — desktop only */}
            {isDesktop && currentView === 'terminal' && !shouldUseMultiInstance && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPaneViewMode(paneViewMode === 'tab' ? 'pane' : 'tab')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  paneViewMode === 'pane'
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}
                title={paneViewMode === 'tab' ? 'Switch to multi-pane view' : 'Switch to tab view'}
              >
                {paneViewMode === 'tab' ? (
                  <>
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Multi-Pane</span>
                  </>
                ) : (
                  <>
                    <Rows3 className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Tab View</span>
                  </>
                )}
              </motion.button>
            )}
            {shouldUseMultiInstance && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={refreshInstances}
                className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                title="Refresh instances"
              >
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <Settings className="h-5 w-5 text-muted-foreground" />
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Instance Tabs - Show only when multiple instances exist */}
      {hasMultipleInstances && (
        <div className="border-b border-border/50 bg-card/80 backdrop-blur-md">
          <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto">
            {instances.map((instance) => {
              const status = getConnectionStatus(instance.instanceId);
              const isActive = instance.instanceId === activeInstanceId;

              return (
                <motion.button
                  key={instance.instanceId}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveInstance(instance.instanceId)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary/80'
                  )}
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      status.isConnected && status.isAuthenticated
                        ? 'bg-green-500'
                        : status.isConnected
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    )}
                  />
                  <span>{instance.projectName}</span>
                  <span className="text-xs opacity-70">:{instance.port}</span>
                </motion.button>
              );
            })}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setShowSettings(true);
                setUseMultiInstance(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-dashed border-border hover:border-primary hover:text-primary transition-colors"
              title="Add new instance"
            >
              <Plus className="h-4 w-4" />
              <span className="text-xs">New</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* Session Tabs - Show in single-instance terminal view (tab mode only) */}
      {currentView === 'terminal' && !shouldUseMultiInstance && !isMultiPaneActive && (
        <Suspense fallback={<div className="h-12 border-b border-border bg-card" />}>
          <SessionTabs
            sessions={sessions}
            activeSessionId={activeSessionId}
            sessionStates={sessionStates}
            allSessionIds={allSessionIds}
            onSelectSession={switchSession}
            onCreateSession={createSession}
            onCloseSession={closeSession}
            onOpenNewSession={handleOpenNewSession}
          />
        </Suspense>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        }>
        {currentView === 'terminal' && (
          <>
            {isMultiPaneActive ? (
              /* Multi-Pane View — desktop only, shows 2-6 sessions side by side */
              <MultiPaneView
                sessionStates={sessionStates}
                allSessionIds={allSessionIds}
                sessions={sessions}
                slashCommands={displaySlashCommands}
                availableModels={availableModels}
                currentModel={currentModel || 'claude-sonnet-4-5-20250929'}
                permissionMode={permissionMode || 'default'}
                connectionStatus={{
                  isConnected: currentIsConnected,
                  isAuthenticated: currentIsAuthenticated,
                }}
                onSubmit={sendPromptToSession}
                onApprove={handleApprovalForSession}
                onAnswerQuestion={answerQuestionForSession}
                onInterrupt={interruptSession}
                onTerminalCommand={sendTerminalCommandToSession}
                onTerminalInterruptCommand={interruptTerminalCommandForSession}
                onClearTerminal={clearTerminalForSession}
                onExecuteSlashCommand={executeSlashCommand}
                onChangeModel={changeModel}
                onSetMode={setMode}
                onCreateSession={handleOpenNewSession}
              />
            ) : hasMultipleInstances && !activeInstanceId ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-sm text-muted-foreground py-2">
                  Select an instance tab above to start
                </div>
              </div>
            ) : (
              /* Standard Tab View — single session visible */
              <TerminalView
                messages={displayMessages}
                toolCalls={displayToolCalls}
                tasks={tasks}
                slashCommands={displaySlashCommands}
                availableModels={availableModels}
                isProcessing={isProcessing}
                isStreaming={Boolean(streamingText)}
                connectionStatus={{
                  isConnected: currentIsConnected,
                  isAuthenticated: currentIsAuthenticated,
                }}
                currentModel={currentModel || 'claude-sonnet-4-5-20250929'}
                workingDirectory={
                  shouldUseMultiInstance && activeInstance
                    ? activeInstance.projectPath
                    : (activeSessionId && sessionStates.get(activeSessionId)?.projectPath)
                      || projects.find(p => p.id === activeProjectId)?.path
                      || ''
                }
                permissionMode={permissionMode || 'default'}
                sessionStats={sessionStats}
                onSubmit={sendPrompt}
                onAnswerQuestion={handleAnswerQuestion}
                onApprove={(requestId: string, decision: 'allow' | 'deny', reason?: string) => {
                  if (shouldUseMultiInstance && activeInstanceId) {
                    const connection = getConnection(activeInstanceId);
                    if (connection) {
                      sendToInstance(activeInstanceId, {
                        type: 'approval',
                        requestId,
                        sessionId: activeInstanceId,
                        approved: decision === 'allow',
                        reason
                      });
                    }
                  } else {
                    handleSingleApproval(requestId, decision, reason);
                  }
                }}
                onClearTerminal={clearTerminal}
                onInterrupt={interrupt}
                onExecuteSlashCommand={executeSlashCommand}
                onChangeModel={changeModel}
                onSetMode={setMode}
                onTerminalCommand={sendTerminalCommand}
                isTerminalRunning={isTerminalRunning}
                onTerminalInterrupt={activeTerminalCommandId ? () => interruptTerminalCommand(activeTerminalCommandId) : undefined}
                onTerminalInterruptCommand={(commandId: string) => interruptTerminalCommand(commandId)}
                sessionName={activeSessionId ? sessionStates.get(activeSessionId)?.displayName : undefined}
                onRenameSession={activeSessionId ? (newName: string) => renameSession(activeSessionId, newName) : undefined}
                onSpotlightOpen={handleSpotlightOpen}
                insertText={insertTextForInput}
                onInsertTextConsumed={handleInsertTextConsumed}
              />
            )}
          </>
        )}

        {currentView === 'sessions' && (
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={(id) => {
              switchSession(id);
              setCurrentView('terminal');
            }}
          />
        )}

        {currentView === 'tickets' && (
          <TicketsView
            isConnected={currentIsConnected && currentIsAuthenticated}
            sendMessage={sendTicketMessage}
            // activeProjectId={activeProjectId}
          />
        )}

        {currentView === 'history' && !loadedSession && (
          <ChatHistoryView
            sessions={savedSessions}
            onLoadSession={loadSession}
            currentProjectId={projects.find(p => p.id === activeProjectId)?.id}
          />
        )}

        {currentView === 'history' && loadedSession && (
          <SessionViewer
            session={loadedSession}
            onClose={() => setLoadedSession(null)}
            onContinue={(sessionId) => {
              resumeSession(sessionId);
              setCurrentView('terminal');
            }}
          />
        )}

        </Suspense>
      </main>

      {/* Spotlight Search */}
      {isSpotlightOpen && (
        <Suspense fallback={null}>
          <SpotlightSearchComponent
            isOpen={isSpotlightOpen}
            onClose={handleSpotlightClose}
            onSearch={handleSpotlightSearch}
            onPreview={handleFileView}
            onEdit={handleFileEdit}
            onSelect={handleFileSelect}
            searchResults={fileSearchResults}
            isSearching={isFileSearching}
          />
        </Suspense>
      )}

      {/* File Preview */}
      {isFilePreviewOpen && (
        <Suspense fallback={null}>
          <FilePreviewComponent
            isOpen={isFilePreviewOpen}
            onClose={handleFilePreviewClose}
            preview={filePreview}
            error={filePreviewError}
            isLoading={isFilePreviewLoading}
            mode={filePreviewMode}
            onSave={saveFile}
            onToggleMode={handleTogglePreviewMode}
            saveResult={fileSaveResult}
          />
        </Suspense>
      )}

      {/* New Session Dialog */}
      {showNewSession && (
        <Suspense fallback={null}>
          <NewSessionDialog
            isOpen={showNewSession}
            basePath={sessionFolders?.basePath || null}
            folders={sessionFolders?.folders || []}
            folderCreationResult={folderCreationResult}
            onSearch={(query) => listSessionFolders(query || undefined)}
            onCreateFolder={createSessionFolder}
            onSelectFolder={handleFolderSelected}
            onClose={() => { setShowNewSession(false); clearFolderCreationResult(); }}
            onRefresh={() => listSessionFolders()}
          />
        </Suspense>
      )}

      {/* Auth Error Modal */}
      <AuthErrorModal
        error={authError}
        onRetry={() => window.location.reload()}
        onSettings={() => setShowSettings(true)}
      />

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Connection Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">
                  Bridge Server URL
                </label>
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ws://192.168.1.x:3001"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Enter the WebSocket URL of your bridge server. Find your laptop's IP and use port 3001.
                </p>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">
                  Auth Token (optional)
                </label>
                <input
                  type="password"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="From terminal startup message"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Optional authentication token from your terminal. Usually provided via QR code.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-sm rounded-lg hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Save & Reconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
