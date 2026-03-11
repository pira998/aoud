import React, { useMemo } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { MessageList } from './MessageList';
import { SessionDropdown } from './SessionDropdown';
import { usePaneStore } from '../store/paneStore';
import { convertTimelineToMessages } from '../lib/timelineAdapter';
import type { SessionInfo } from '../../../shared/types';
import type { SessionState } from '../hooks/useWebSocket';

interface SessionPaneProps {
  paneId: string;
  sessionId: string | null;
  isFocused: boolean;
  sessionStates: Map<string, SessionState>;
  allSessionIds: string[];
  sessions: SessionInfo[];
  onApprove?: (sessionId: string, requestId: string, decision: 'allow' | 'deny', reason?: string) => void;
  onAnswerQuestion: (sessionId: string, requestId: string, answers: Record<string, string | string[]>) => void;
  onTerminalInterruptCommand: (sessionId: string, commandId: string) => void;
  onCreateSession?: () => void;
}

export const SessionPane: React.FC<SessionPaneProps> = ({
  paneId,
  sessionId,
  isFocused,
  sessionStates,
  allSessionIds,
  sessions,
  onApprove,
  onAnswerQuestion,
  onTerminalInterruptCommand,
  onCreateSession,
}) => {
  const setPaneSession = usePaneStore((s) => s.setPaneSession);
  const removePane = usePaneStore((s) => s.removePane);
  const paneCount = usePaneStore((s) => s.panes.length);

  // Get per-session state
  const sessionState = sessionId ? sessionStates.get(sessionId) : undefined;

  // Convert timeline to messages for this pane's session
  const { messages, toolCalls } = useMemo(() => {
    if (!sessionState?.timeline || sessionState.timeline.length === 0) {
      return { messages: [], toolCalls: {} };
    }
    return convertTimelineToMessages(sessionState.timeline);
  }, [sessionState?.timeline]);

  // Combine history + converted messages
  const allMessages = useMemo(() => {
    const history = sessionState?.historyMessages || [];
    return [...history, ...messages];
  }, [sessionState?.historyMessages, messages]);

  const hasPendingApprovals = (sessionState?.pendingApprovals?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        'session-pane',
        isFocused && 'session-pane--focused',
        hasPendingApprovals && !isFocused && 'session-pane--has-approval'
      )}
    >
      {/* Pane Header — drag handle + session selector */}
      <div className="pane-drag-handle">
        <GripHorizontal className="h-3 w-3 text-muted-foreground shrink-0" />

        <SessionDropdown
          currentSessionId={sessionId}
          allSessionIds={allSessionIds}
          sessions={sessions}
          sessionStates={sessionStates}
          onChange={(newSessionId) => setPaneSession(paneId, newSessionId)}
          onCreateSession={onCreateSession}
        />

        {/* Status indicators */}
        {sessionState?.isProcessing && (
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shrink-0" />
        )}
        {hasPendingApprovals && (
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" title="Pending approval" />
        )}

        {/* Focus indicator */}
        {isFocused && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Active input target" />
        )}

        {/* Close pane — only if more than 1 pane */}
        {paneCount > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removePane(paneId);
            }}
            className="ml-auto p-0.5 rounded hover:bg-destructive/20 transition-colors"
            title="Close pane"
          >
            <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
          </button>
        )}
      </div>

      {/* Pane Content — message display */}
      <div className="pane-content">
        {sessionId && allMessages.length > 0 ? (
          <MessageList
            messages={allMessages}
            toolCalls={toolCalls}
            tasks={sessionState?.tasks || []}
            onQuickAction={() => {}}
            onAnswerQuestion={(requestId, answers) =>
              onAnswerQuestion(sessionId, requestId, answers)
            }
            onApprove={
              onApprove
                ? (requestId, decision, reason) =>
                    onApprove(sessionId, requestId, decision, reason)
                : undefined
            }
            onTerminalInterrupt={(commandId) =>
              onTerminalInterruptCommand(sessionId, commandId)
            }
          />
        ) : sessionId ? (
          <div className="pane-empty">
            <span>No messages yet — send a prompt below</span>
          </div>
        ) : (
          <div className="pane-empty">
            <span>Select a session above</span>
          </div>
        )}
      </div>
    </div>
  );
};
