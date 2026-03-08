import React from 'react';
import { MessageList } from './MessageList';
import './SessionViewer.css';

interface SessionViewerProps {
  session: any; // SavedSession type
  onClose: () => void;
  onContinue: (sessionId: string) => void;
}

export const SessionViewer: React.FC<SessionViewerProps> = ({
  session,
  onClose,
  onContinue,
}) => {
  // Convert saved session messages to Message[] format
  const messages = session.messages?.map((msg: any, idx: number) => {
    if (msg.role === 'assistant') {
      // Assistant messages have proper ContentBlock[] structure
      return {
        id: `${session.metadata.sessionId}-${idx}`,
        role: msg.role,
        content: Array.isArray(msg.content) ? msg.content : [
          { type: 'text' as const, text: String(msg.content || '') }
        ],
        timestamp: msg.timestamp || new Date(msg.timestamp).getTime(),
        model: msg.model,
      };
    } else {
      // User messages use string content
      let contentString = '';
      if (typeof msg.content === 'string') {
        contentString = msg.content;
      } else if (msg.content) {
        contentString = JSON.stringify(msg.content);
      }

      return {
        id: `${session.metadata.sessionId}-${idx}`,
        role: msg.role,
        content: contentString,
        timestamp: msg.timestamp || new Date(msg.timestamp).getTime(),
      };
    }
  }) || [];

  // Extract toolCalls from session (now included by server)
  const toolCalls = session.toolCalls || {};

  return (
    <div className="session-viewer">
      <div className="session-viewer__header">
        <button onClick={onClose} className="session-viewer__back">
          ← Back
        </button>
        <div className="session-viewer__info">
          <span className="session-viewer__title">
            {session.metadata.projectName}
          </span>
          <span className="session-viewer__meta">
            {new Date(session.metadata.createdAt).toLocaleString()}
          </span>
        </div>
        <button
          onClick={() => onContinue(session.metadata.sessionId)}
          className="session-viewer__continue"
        >
          Continue →
        </button>
      </div>

      <div className="session-viewer__stats">
        <span>${session.metadata.stats.totalCost.toFixed(4)}</span>
        <span>•</span>
        <span>{session.metadata.stats.totalTokens.toLocaleString()} tokens</span>
        <span>•</span>
        <span>{session.metadata.stats.totalPrompts} prompts</span>
      </div>

      <div className="session-viewer__content">
        <MessageList
          messages={messages}
          toolCalls={toolCalls}
          tasks={[]}
          onQuickAction={() => {}}
          onAnswerQuestion={() => {}}
        />
      </div>
    </div>
  );
};
