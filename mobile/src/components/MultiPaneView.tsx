import React, { useCallback, useState } from 'react';
import '../styles/multi-pane.css';
import { usePaneStore } from '../store/paneStore';
import { SessionPane } from './SessionPane';
import { PaneInputBar } from './PaneInputBar';
import { PaneLayoutPresets } from './PaneLayoutPresets';
import type { SessionInfo, SlashCommand, PermissionMode, ModelInfo } from '../../../shared/types';
import type { SessionState } from '../hooks/useWebSocket';

interface MultiPaneViewProps {
  sessionStates: Map<string, SessionState>;
  allSessionIds: string[];
  sessions: SessionInfo[];
  slashCommands: SlashCommand[];
  availableModels?: ModelInfo[];
  currentModel: string;
  permissionMode: string;
  connectionStatus: { isConnected: boolean; isAuthenticated: boolean };
  // Session-targeted actions
  onSubmit: (sessionId: string, text: string) => void;
  onApprove: (sessionId: string, requestId: string, decision: 'allow' | 'deny', reason?: string) => void;
  onAnswerQuestion: (sessionId: string, requestId: string, answers: Record<string, string | string[]>) => void;
  onInterrupt: (sessionId: string) => void;
  onTerminalCommand: (sessionId: string, command: string) => void;
  onTerminalInterruptCommand: (sessionId: string, commandId: string) => void;
  onClearTerminal: (sessionId: string) => void;
  onExecuteSlashCommand?: (command: string, args?: string) => void;
  onChangeModel?: (model: string) => void;
  onSetMode?: (mode: PermissionMode) => void;
  onCreateSession: () => void;
}

export const MultiPaneView: React.FC<MultiPaneViewProps> = ({
  sessionStates,
  allSessionIds,
  sessions,
  slashCommands,
  availableModels,
  currentModel,
  permissionMode,
  connectionStatus,
  onSubmit,
  onApprove,
  onAnswerQuestion,
  onInterrupt,
  onTerminalCommand,
  onTerminalInterruptCommand,
  onClearTerminal,
  onExecuteSlashCommand,
  onChangeModel,
  onSetMode,
  onCreateSession,
}) => {
  const panes = usePaneStore((s) => s.panes);
  const focusedPaneId = usePaneStore((s) => s.focusedPaneId);
  const setFocusedPane = usePaneStore((s) => s.setFocusedPane);
  const swapPanes = usePaneStore((s) => s.swapPanes);

  const [draggedPaneId, setDraggedPaneId] = useState<string | null>(null);

  const handlePaneClick = useCallback(
    (paneId: string) => {
      setFocusedPane(paneId);
    },
    [setFocusedPane]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, paneId: string) => {
      setDraggedPaneId(paneId);
      e.dataTransfer.effectAllowed = 'move';
      // Make the drag image semi-transparent
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5';
      }
    },
    []
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      setDraggedPaneId(null);
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '1';
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetPaneId: string) => {
      e.preventDefault();
      if (draggedPaneId && draggedPaneId !== targetPaneId) {
        swapPanes(draggedPaneId, targetPaneId);
      }
      setDraggedPaneId(null);
    },
    [draggedPaneId, swapPanes]
  );

  // Determine CSS grid class based on pane count.
  // 1: 1×1  |  2: 2×1  |  3: 3×1  |  4: 2×2  |  5: 3+2  |  6: 3×2
  const paneCount = panes.length;
  let gridClass = 'pane-grid--2';
  if (paneCount === 1) gridClass = 'pane-grid--1';
  else if (paneCount === 2) gridClass = 'pane-grid--2';
  else if (paneCount === 3) gridClass = 'pane-grid--3';
  else if (paneCount === 4) gridClass = 'pane-grid--4';
  else if (paneCount === 5) gridClass = 'pane-grid--5';
  else if (paneCount >= 6) gridClass = 'pane-grid--6';

  return (
    <div className="multi-pane-root">
      {/* Layout presets toolbar */}
      <PaneLayoutPresets />

      {/* CSS Grid of panes — fills all space between toolbar and bottom bar */}
      <div className={`pane-grid ${gridClass}`}>
        {panes.map((pane) => (
          <div
            key={pane.paneId}
            className={`pane-grid-cell ${draggedPaneId === pane.paneId ? 'pane-grid-cell--dragging' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, pane.paneId)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, pane.paneId)}
            onClick={() => handlePaneClick(pane.paneId)}
          >
            <SessionPane
              paneId={pane.paneId}
              sessionId={pane.sessionId}
              isFocused={pane.paneId === focusedPaneId}
              sessionStates={sessionStates}
              allSessionIds={allSessionIds}
              sessions={sessions}
              onApprove={onApprove}
              onAnswerQuestion={onAnswerQuestion}
              onTerminalInterruptCommand={onTerminalInterruptCommand}
              onCreateSession={onCreateSession}
            />
          </div>
        ))}
      </div>

      {/* Shared bottom bar — StatusBar + TokenUsageBar + Input */}
      <PaneInputBar
        sessionStates={sessionStates}
        sessions={sessions}
        slashCommands={slashCommands}
        availableModels={availableModels}
        connectionStatus={connectionStatus}
        currentModel={currentModel}
        permissionMode={permissionMode}
        onSubmit={onSubmit}
        onClearTerminal={onClearTerminal}
        onExecuteSlashCommand={onExecuteSlashCommand}
        onTerminalCommand={onTerminalCommand}
        onInterrupt={onInterrupt}
        onChangeModel={onChangeModel}
        onSetMode={onSetMode}
      />
    </div>
  );
};
