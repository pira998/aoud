import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Folder } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SessionInfo } from '../../../shared/types';
import type { SessionState } from '../hooks/useWebSocket';

interface SessionDropdownProps {
  currentSessionId: string | null;
  allSessionIds: string[];
  sessions: SessionInfo[];
  sessionStates: Map<string, SessionState>;
  onChange: (sessionId: string) => void;
  onCreateSession?: () => void;
}

export const SessionDropdown: React.FC<SessionDropdownProps> = ({
  currentSessionId,
  allSessionIds,
  sessions,
  sessionStates,
  onChange,
  onCreateSession,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const getSessionLabel = (sessionId: string): string => {
    const localState = sessionStates.get(sessionId);
    const serverSession = sessions.find((s) => s.id === sessionId);
    if (localState?.displayName) return localState.displayName;
    if (serverSession?.projectName) return serverSession.projectName;
    return `Session ${sessionId.substring(0, 6)}`;
  };

  const getSessionPath = (sessionId: string): string | undefined => {
    const localState = sessionStates.get(sessionId);
    const serverSession = sessions.find((s) => s.id === sessionId);
    return localState?.projectPath || serverSession?.projectPath;
  };

  const currentLabel = currentSessionId
    ? getSessionLabel(currentSessionId)
    : 'Select session';

  return (
    <div className="relative flex-1 min-w-0" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium w-full min-w-0',
          'hover:bg-secondary/50 transition-colors',
          currentSessionId ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown className={cn(
          'h-3 w-3 shrink-0 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto z-50 rounded-lg border border-border/50 bg-card/95 backdrop-blur-xl shadow-xl">
          {allSessionIds.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No sessions available
            </div>
          ) : (
            allSessionIds.map((sessionId) => {
              const label = getSessionLabel(sessionId);
              const path = getSessionPath(sessionId);
              const state = sessionStates.get(sessionId);
              const isActive = sessionId === currentSessionId;

              return (
                <button
                  key={sessionId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(sessionId);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 transition-colors flex items-center gap-2',
                    isActive && 'bg-primary/10 text-primary'
                  )}
                >
                  <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{label}</div>
                    {path && (
                      <div className="truncate text-muted-foreground text-[10px]">{path}</div>
                    )}
                  </div>
                  {state?.isProcessing && (
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" />
                  )}
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              );
            })
          )}

          {/* Create new session option */}
          {onCreateSession && (
            <>
              <div className="border-t border-border/30" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSession();
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 transition-colors flex items-center gap-2 text-primary"
              >
                <Plus className="h-3 w-3 shrink-0" />
                <span className="font-medium">New Session</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
