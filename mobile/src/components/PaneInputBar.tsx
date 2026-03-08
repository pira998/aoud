import React, { useMemo } from 'react';
import { MessageInput } from './MessageInput';
import { StatusBar } from './StatusBar';
import { TokenUsageBar } from './TokenUsageBar';
import { usePaneStore } from '../store/paneStore';
import type { SlashCommand, PermissionMode, ModelInfo } from '../../../shared/types';
import type { SessionInfo } from '../../../shared/types';
import type { SessionState } from '../hooks/useWebSocket';

interface PaneInputBarProps {
  sessionStates: Map<string, SessionState>;
  sessions: SessionInfo[];
  slashCommands: SlashCommand[];
  availableModels?: ModelInfo[];
  connectionStatus: { isConnected: boolean; isAuthenticated: boolean };
  currentModel: string;
  permissionMode: string;
  sessionStats?: {
    totalCost: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    turnCount: number;
  };
  onSubmit: (sessionId: string, text: string) => void;
  onClearTerminal?: (sessionId: string) => void;
  onExecuteSlashCommand?: (command: string, args?: string) => void;
  onTerminalCommand?: (sessionId: string, command: string) => void;
  onInterrupt?: (sessionId: string) => void;
  onChangeModel?: (model: string) => void;
  onSetMode?: (mode: PermissionMode) => void;
  isTerminalRunning?: boolean;
  onTerminalInterrupt?: () => void;
}

export const PaneInputBar: React.FC<PaneInputBarProps> = ({
  sessionStates,
  sessions,
  slashCommands,
  availableModels,
  connectionStatus,
  currentModel,
  permissionMode,
  sessionStats,
  onSubmit,
  onClearTerminal,
  onExecuteSlashCommand,
  onTerminalCommand,
  onInterrupt,
  onChangeModel,
  onSetMode,
  isTerminalRunning,
  onTerminalInterrupt,
}) => {
  const focusedPaneId = usePaneStore((s) => s.focusedPaneId);
  const panes = usePaneStore((s) => s.panes);

  // Derive focused session info
  const focusedPane = useMemo(
    () => panes.find((p) => p.paneId === focusedPaneId),
    [panes, focusedPaneId]
  );
  const focusedSessionId = focusedPane?.sessionId ?? null;

  const focusedSessionState = focusedSessionId
    ? sessionStates.get(focusedSessionId)
    : undefined;

  // Get display label for focused session
  const focusedLabel = useMemo(() => {
    if (!focusedSessionId) return null;
    const localState = sessionStates.get(focusedSessionId);
    const serverSession = sessions.find((s) => s.id === focusedSessionId);
    if (localState?.displayName) return localState.displayName;
    if (serverSession?.projectName) return serverSession.projectName;
    return `Session ${focusedSessionId.substring(0, 6)}`;
  }, [focusedSessionId, sessionStates, sessions]);

  const isProcessing = focusedSessionState?.isProcessing ?? false;

  // Derive session stats from focused session state
  const focusedStats = useMemo(() => {
    if (focusedSessionState?.sessionStats) return focusedSessionState.sessionStats;
    return sessionStats;
  }, [focusedSessionState?.sessionStats, sessionStats]);

  return (
    <div className="pane-bottom-bar">
      {/* Status Bar — model, mode, interrupt */}
      <StatusBar
        isConnected={connectionStatus.isConnected}
        isAuthenticated={connectionStatus.isAuthenticated}
        isProcessing={isProcessing}
        permissionMode={permissionMode}
        onInterrupt={
          focusedSessionId && onInterrupt
            ? () => onInterrupt(focusedSessionId)
            : undefined
        }
        currentModel={currentModel}
        availableModels={availableModels}
        onChangeModel={onChangeModel}
        onSetMode={onSetMode}
      />

      {/* Token Usage Bar */}
      {focusedStats && (
        <TokenUsageBar
          totalCost={focusedStats.totalCost}
          totalTokens={focusedStats.totalTokens}
          inputTokens={focusedStats.inputTokens}
          outputTokens={focusedStats.outputTokens}
          cacheCreationTokens={focusedStats.cacheCreationTokens || 0}
          cacheReadTokens={focusedStats.cacheReadTokens || 0}
          turnCount={focusedStats.turnCount}
          currentModel={currentModel}
        />
      )}

      {/* Focus indicator */}
      {focusedLabel && (
        <div className="pane-input-indicator">
          <span>Sending to:</span>
          <span className="pane-input-indicator__label">{focusedLabel}</span>
        </div>
      )}

      {!focusedSessionId && (
        <div className="pane-input-indicator">
          <span className="text-muted-foreground italic">
            Click a pane to select where to send messages
          </span>
        </div>
      )}

      <MessageInput
        onSubmit={(text) => {
          if (focusedSessionId) {
            onSubmit(focusedSessionId, text);
          }
        }}
        isProcessing={isProcessing || !focusedSessionId}
        slashCommands={slashCommands}
        onClearTerminal={
          focusedSessionId && onClearTerminal
            ? () => onClearTerminal(focusedSessionId)
            : undefined
        }
        onExecuteSlashCommand={onExecuteSlashCommand}
        onTerminalCommand={
          focusedSessionId && onTerminalCommand
            ? (cmd) => onTerminalCommand(focusedSessionId, cmd)
            : undefined
        }
        isTerminalRunning={isTerminalRunning}
        onTerminalInterrupt={onTerminalInterrupt}
      />
    </div>
  );
};
