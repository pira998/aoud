import { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { ConnectionStatus } from './components/ConnectionStatus';
import { SessionList } from './components/SessionList';
import { UnifiedTerminalView } from './components/UnifiedTerminalView';
import { AuthErrorModal } from './components/AuthErrorModal';
import { Settings, Code2, Home, Terminal } from 'lucide-react';

// Extract connection info from URL or localStorage
const getConnectionInfo = (): { url: string; token: string | null } => {
  // Check for ?connect= parameter (from QR code scan)
  const params = new URLSearchParams(window.location.search);
  const connectParam = params.get('connect');
  const tokenParam = params.get('token');

  if (connectParam) {
    // Save the connection URL from QR code
    localStorage.setItem('bridge-server-url', connectParam);
    if (tokenParam) {
      localStorage.setItem('bridge-auth-token', tokenParam);
      console.log('[QR Code] Auth token saved:', tokenParam.substring(0, 8) + '...');
    }
    // Clear the query parameter from URL for clean appearance
    window.history.replaceState({}, '', window.location.pathname);
    console.log('[QR Code] Auto-connected to:', connectParam);
    return { url: connectParam, token: tokenParam };
  }

  // Check localStorage for previously saved values
  const savedUrl = localStorage.getItem('bridge-server-url');
  const savedToken = localStorage.getItem('bridge-auth-token');

  if (savedUrl) {
    console.log('[LocalStorage] Using saved connection');
    return { url: savedUrl, token: savedToken };
  }

  // Auto-detect: use the same host that served this page
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname || 'localhost';
  const port = window.location.port;

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

  console.log('[Auto-detect] Using:', url);
  return { url, token: null };
};

function App() {
  // Extract connection info on mount
  const connectionInfo = getConnectionInfo();
  const [serverUrl, setServerUrl] = useState(connectionInfo.url);
  const [authToken, setAuthToken] = useState(connectionInfo.token || '');
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState<'terminal' | 'sessions'>('terminal');
  const [customUrl, setCustomUrl] = useState(serverUrl);
  const [customToken, setCustomToken] = useState(authToken);

  const {
    isConnected,
    isAuthenticated,
    authError,
    connectionError,
    timeline,
    sessions,
    activeSessionId,
    isProcessing,
    tasks,
    sendPrompt,
    handleApproval,
    setActiveSessionId,
    clearTerminal,
  } = useWebSocket(serverUrl, authToken);

  const handleSaveSettings = () => {
    localStorage.setItem('bridge-server-url', customUrl);
    if (customToken) {
      localStorage.setItem('bridge-auth-token', customToken);
    } else {
      localStorage.removeItem('bridge-auth-token');
    }
    setServerUrl(customUrl);
    setShowSettings(false);
    // Force reconnect by reloading
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground safe-area-top">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold">Claude Code</h1>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus isConnected={isConnected} error={connectionError} />
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Simplified Navigation - Claude Code style */}
      <nav className="border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Terminal</span>
          </div>
          <div className="flex items-center gap-2">
            {currentView === 'terminal' && (
              <button
                onClick={clearTerminal}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors font-medium"
                title="Clear terminal"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setCurrentView(currentView === 'terminal' ? 'sessions' : 'terminal')}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-secondary text-muted-foreground rounded-md hover:bg-secondary/80 transition-colors font-medium"
            >
              {currentView === 'terminal' ? (
                <>
                  <Home className="h-3 w-3" />
                  Sessions
                </>
              ) : (
                <>
                  <Terminal className="h-3 w-3" />
                  Terminal
                </>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {currentView === 'terminal' && (
          <>
            <UnifiedTerminalView
              timeline={timeline}
              isStreaming={isProcessing}
              tasks={tasks}
              onApprove={(requestId, reason, answers) => {
                handleApproval(requestId, 'allow', reason, answers);
              }}
              onReject={(requestId, reason) => {
                handleApproval(requestId, 'deny', reason);
              }}
            />

            {/* Input Area */}
            <div className="border-t border-border bg-card p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const text = formData.get('prompt') as string;
                  if (text.trim()) {
                    sendPrompt(text);
                    e.currentTarget.reset();
                  }
                }}
                className="flex gap-2"
              >
                <input
                  name="prompt"
                  type="text"
                  placeholder="Enter a prompt..."
                  disabled={!isConnected || !isAuthenticated || isProcessing}
                  className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 font-mono"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!isConnected || !isAuthenticated || isProcessing}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                  {isProcessing ? 'Stop' : 'Send'}
                </button>
              </form>
            </div>
          </>
        )}

        {currentView === 'sessions' && (
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={(id) => {
              setActiveSessionId(id);
              setCurrentView('terminal');
            }}
          />
        )}
      </main>

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
