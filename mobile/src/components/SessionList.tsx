import { Folder, Activity, Clock, ChevronRight } from 'lucide-react';
import type { SessionInfo } from '../hooks/useWebSocket';

interface SessionListProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function SessionList({ sessions, activeSessionId, onSelectSession }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Folder className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No active sessions</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Start a new chat to create a coding session. Your sessions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase">
        Active Sessions
      </h2>
      <div className="space-y-2">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={() => onSelectSession(session.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  isActive,
  onSelect,
}: {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
}) {
  const getStatusColor = () => {
    switch (session.status) {
      case 'running':
        return 'bg-green-500';
      case 'waiting_approval':
        return 'bg-yellow-500';
      default:
        return 'bg-muted-foreground';
    }
  };

  const getStatusText = () => {
    switch (session.status) {
      case 'running':
        return 'Running';
      case 'waiting_approval':
        return `${session.pendingApprovals} pending`;
      default:
        return 'Idle';
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${
        isActive
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:bg-secondary/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-secondary rounded-lg shrink-0">
            <Folder className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{session.projectName}</div>
            <div className="text-xs text-muted-foreground truncate">{session.projectPath}</div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
          {getStatusText()}
        </div>
        <div className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {session.messageCount} messages
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTime(session.lastActivity)}
        </div>
      </div>
    </button>
  );
}
