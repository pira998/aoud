import React from 'react';
import { motion } from 'framer-motion';
import { Plus, X, FolderPlus } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SessionInfo } from '../../../shared/types';
import type { SessionState } from '../hooks/useWebSocket';
import './SessionTabs.css';

interface SessionTabsProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  sessionStates: Map<string, SessionState>;
  allSessionIds: string[];
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onCloseSession: (sessionId: string) => void;
  onOpenNewSession?: () => void;
}

export const SessionTabs: React.FC<SessionTabsProps> = ({
  sessions,
  activeSessionId,
  sessionStates,
  allSessionIds,
  onSelectSession,
  onCreateSession,
  onCloseSession,
  onOpenNewSession,
}) => {
  // Build merged tab items from server sessions + local session states
  const tabItems = allSessionIds.map((id) => {
    const serverSession = sessions.find(s => s.id === id);
    const localState = sessionStates.get(id);

    // Determine display name priority: displayName > projectName > short ID
    let label = 'New Session';
    if (localState?.displayName) {
      label = localState.displayName;
    } else if (serverSession?.projectName) {
      label = serverSession.projectName;
    } else {
      label = `Session ${id.substring(0, 6)}`;
    }

    // Determine status
    const status = localState?.isProcessing
      ? 'running'
      : serverSession?.status || 'idle';

    return {
      id,
      label,
      status,
      hasUnread: localState?.hasUnreadMessages || false,
      isActive: id === activeSessionId,
      hasMessages: (localState?.timeline?.length || 0) > 0 || (localState?.historyMessages?.length || 0) > 0,
    };
  });

  // Don't render if no sessions
  if (tabItems.length === 0) return null;

  return (
    <div className="session-tabs">
      <div className="session-tabs__scroll">
        {tabItems.map((tab) => (
          <motion.div
            key={tab.id}
            className="session-tabs__tab-wrapper"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectSession(tab.id)}
              className={cn(
                'session-tabs__tab',
                tab.isActive && 'session-tabs__tab--active',
                tab.hasUnread && !tab.isActive && 'session-tabs__tab--unread'
              )}
            >
              {/* Status dot */}
              <span
                className={cn(
                  'session-tabs__dot',
                  tab.status === 'running' && 'session-tabs__dot--running',
                  (tab.status === 'waiting_approval' || tab.status === 'waiting_question') && 'session-tabs__dot--waiting',
                )}
              />
              <span className="session-tabs__label">{tab.label}</span>
              {/* Unread notification badge */}
              {tab.hasUnread && !tab.isActive && (
                <span className="session-tabs__unread-dot" />
              )}
            </motion.button>
            {/* Close button - only show on hover if more than 1 session */}
            {tabItems.length > 1 && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseSession(tab.id);
                }}
                className="session-tabs__close"
                title="Close session"
              >
                <X className="h-3 w-3" />
              </motion.button>
            )}
          </motion.div>
        ))}

        {/* Quick new session button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onCreateSession}
          className="session-tabs__new"
          title="New session"
        >
          <Plus className="h-3.5 w-3.5" />
        </motion.button>

        {/* New session in project folder button */}
        {onOpenNewSession && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onOpenNewSession}
            className="session-tabs__new"
            title="New session in project folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </motion.button>
        )}
      </div>
    </div>
  );
};
