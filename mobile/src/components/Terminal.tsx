import React, { useState, useRef, useEffect } from 'react';
import type {
  Message,
  ToolCall,
} from '../types';
import type { SlashCommand, PermissionMode, ModelInfo } from '../../../shared/types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { StatusBar } from './StatusBar';
import { TokenUsageBar } from './TokenUsageBar';

interface TerminalProps {
  messages: Message[];
  toolCalls: Record<string, ToolCall>;
  tasks: Array<{
    id: string;
    subject: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm?: string;
  }>;
  slashCommands: SlashCommand[];
  availableModels?: ModelInfo[];
  isProcessing: boolean;
  isStreaming: boolean;
  connectionStatus: {
    isConnected: boolean;
    isAuthenticated: boolean;
  };
  currentModel: string;
  workingDirectory: string;
  permissionMode: string;
  costInfo?: {
    totalCostUSD: number;
    inputTokens: number;
    outputTokens: number;
    numTurns: number;
  };
  sessionStats?: {
    totalCost: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    turnCount: number;
  };
  onSubmit: (text: string) => void;
  onAnswerQuestion: (requestId: string, answers: Record<string, string | string[]>) => void;
  onApprove?: (requestId: string, decision: 'allow' | 'deny', reason?: string) => void;
  onClearTerminal: () => void;
  onInterrupt?: () => void;
  onExecuteSlashCommand?: (command: string, args?: string) => void;
  onChangeModel?: (model: string) => void;
  onSetMode?: (mode: PermissionMode) => void;
  // Direct terminal execution
  onTerminalCommand?: (command: string) => void;
  isTerminalRunning?: boolean;
  onTerminalInterrupt?: () => void;
  onTerminalInterruptCommand?: (commandId: string) => void;
  // Session rename
  sessionName?: string;
  onRenameSession?: (newName: string) => void;
  // Spotlight search
  onSpotlightOpen?: () => void;
  insertText?: string | null;
  onInsertTextConsumed?: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({
  messages,
  toolCalls,
  tasks,
  slashCommands,
  availableModels,
  isProcessing,
  isStreaming: _isStreaming,  // Unused but kept for potential future use
  connectionStatus,
  currentModel,
  workingDirectory,
  permissionMode,
  costInfo,
  sessionStats,
  onSubmit,
  onAnswerQuestion,
  onApprove,
  onClearTerminal,
  onInterrupt,
  onExecuteSlashCommand,
  onChangeModel,
  onSetMode,
  onTerminalCommand,
  isTerminalRunning,
  onTerminalInterrupt,
  onTerminalInterruptCommand,
  sessionName,
  onRenameSession,
  onSpotlightOpen,
  insertText,
  onInsertTextConsumed,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Truncate long paths: show ~/<last-two-parts> for paths with 3+ segments
  const truncatePath = (path: string): string => {
    if (!path) return '';
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 2) return path;
    return `~/${parts.slice(-2).join('/')}`;
  };

  const handleStartEdit = () => {
    if (!onRenameSession) return;
    setEditValue(sessionName || truncatePath(workingDirectory) || 'Aoud');
    setIsEditing(true);
  };

  const handleFinishEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && onRenameSession) {
      onRenameSession(trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const displayTitle = sessionName || (workingDirectory ? truncatePath(workingDirectory) : '');

  // Resolve display name using the same names as the model registry
  const MODEL_DISPLAY_NAMES: Record<string, string> = {
    'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
    'claude-opus-4-6': 'Opus 4.6',
    'claude-haiku-4-5-20251001': 'Haiku 4.5',
    'sonnet': 'Sonnet 4.5',
    'opus': 'Opus 4.6',
    'haiku': 'Haiku 4.5',
    'sonnet-1m': 'Sonnet 4.5 (1M)',
    'opus-1m': 'Opus 4.6 (1M)',
  };
  const modelName = MODEL_DISPLAY_NAMES[currentModel] || 'Sonnet 4.5';

  return (
    <div className="terminal">
      <div className="terminal__header">
        <span className="terminal__header-dot terminal__header-dot--red" />
        <span className="terminal__header-dot terminal__header-dot--yellow" />
        <span className="terminal__header-dot terminal__header-dot--green" />
        {isEditing ? (
          <input
            ref={editInputRef}
            className="terminal__header-edit-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={handleEditKeyDown}
          />
        ) : (
          <span
            className={`terminal__header-title ${onRenameSession ? 'terminal__header-title--editable' : ''}`}
            onClick={handleStartEdit}
            title={workingDirectory || undefined}
          >
            Aoud{displayTitle ? ` • ${displayTitle}` : ''}
          </span>
        )}
        <span className="terminal__header-model">{modelName}</span>
      </div>

      <MessageList
        messages={messages}
        toolCalls={toolCalls}
        tasks={tasks}
        onQuickAction={onSubmit}
        onAnswerQuestion={onAnswerQuestion}
        onApprove={onApprove}
        onTerminalInterrupt={onTerminalInterruptCommand}
      />

      <StatusBar
        isConnected={connectionStatus.isConnected}
        isAuthenticated={connectionStatus.isAuthenticated}
        isProcessing={isProcessing}
        permissionMode={permissionMode}
        costInfo={costInfo}
        onInterrupt={onInterrupt}
        currentModel={currentModel}
        availableModels={availableModels}
        onChangeModel={onChangeModel}
        onSetMode={onSetMode}
      />

      {sessionStats && (
        <TokenUsageBar
          totalCost={sessionStats.totalCost}
          totalTokens={sessionStats.totalTokens}
          inputTokens={sessionStats.inputTokens}
          outputTokens={sessionStats.outputTokens}
          cacheCreationTokens={sessionStats.cacheCreationTokens || 0}
          cacheReadTokens={sessionStats.cacheReadTokens || 0}
          turnCount={sessionStats.turnCount}
          currentModel={currentModel}
        />
      )}

      <MessageInput
        onSubmit={onSubmit}
        isProcessing={isProcessing}
        slashCommands={slashCommands}
        onClearTerminal={onClearTerminal}
        onExecuteSlashCommand={onExecuteSlashCommand}
        onTerminalCommand={onTerminalCommand}
        isTerminalRunning={isTerminalRunning}
        onTerminalInterrupt={onTerminalInterrupt}
        onSpotlightOpen={onSpotlightOpen}
        insertText={insertText}
        onInsertTextConsumed={onInsertTextConsumed}
      />
    </div>
  );
};
