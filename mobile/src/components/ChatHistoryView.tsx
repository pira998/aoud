import React from 'react';
import './ChatHistoryView.css';

interface SavedSessionMetadata {
  sessionId: string;
  projectId: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  lastModified: string;
  status: 'active' | 'completed' | 'interrupted' | 'error';
  stats: {
    totalPrompts: number;
    totalMessages: number;
    totalToolUses: number;
    totalTokens: number;
    totalCost: number;
    duration: number;
  };
  firstMessage?: string;
}

interface ChatHistoryViewProps {
  sessions: SavedSessionMetadata[];
  onLoadSession: (sessionId: string) => void;
  currentProjectId?: string;
}

export const ChatHistoryView: React.FC<ChatHistoryViewProps> = ({
  sessions,
  onLoadSession,
  currentProjectId,
}) => {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffHours < 48) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  // Filter by current project if projectId is set
  const filteredSessions = currentProjectId
    ? sessions.filter(s => s.projectId === currentProjectId)
    : sessions;

  // Sort by last modified (most recent first, invalid dates at bottom)
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    const timeA = new Date(a.lastModified).getTime();
    const timeB = new Date(b.lastModified).getTime();

    // Handle invalid dates - NaN values go to bottom
    if (isNaN(timeA) && isNaN(timeB)) return 0;
    if (isNaN(timeA)) return 1;  // a goes to bottom
    if (isNaN(timeB)) return -1; // b goes to bottom

    return timeB - timeA; // Most recent first
  });

  return (
    <div className="chat-history">
      <div className="chat-history__header">
        <h2>Chat History</h2>
        <span className="chat-history__count">
          {sortedSessions.length} {sortedSessions.length === 1 ? 'chat' : 'chats'}
        </span>
      </div>

      {sortedSessions.length === 0 ? (
        <div className="chat-history__empty">
          <p>No chat history yet</p>
          <p className="chat-history__empty-hint">
            Your conversations will appear here
          </p>
        </div>
      ) : (
        <div className="chat-history__list">
          {sortedSessions.map(session => (
            <div
              key={session.sessionId}
              className="chat-history-item"
              onClick={() => onLoadSession(session.sessionId)}
            >
              <div className="chat-history-item__header">
                <span className="chat-history-item__title">
                  {session.firstMessage || `Session ${session.sessionId.substring(0, 8)}`}
                </span>
                <span className="chat-history-item__time">
                  {formatTimestamp(session.lastModified)}
                </span>
              </div>

              <div className="chat-history-item__stats">
                <span>{session.stats.totalPrompts} prompts</span>
                <span>•</span>
                <span>${session.stats.totalCost.toFixed(4)}</span>
                <span>•</span>
                <span>{formatTokens(session.stats.totalTokens)} tokens</span>
              </div>

              <span className={`chat-history-item__status chat-history-item__status--${session.status}`}>
                {session.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
