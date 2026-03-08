import React, { useEffect, useRef, useState, useMemo } from 'react';
import { AnsiUp } from 'ansi_up';
import type {
  AssistantMessage,
  UserMessage as UserMessageType,
  SystemMessage as SystemMessageType,
  TerminalMessage as TerminalMessageType,
  Message,
  ContentBlock,
  ToolCall,
  ApprovalRequestBlock,
} from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallDisplay } from './ToolCallDisplay';
import { AgentContainer } from './AgentContainer';
import { TodoPanel } from './TodoPanel';
import { WelcomeScreen } from './WelcomeScreen';
import { AskUserQuestion } from './AskUserQuestion';
import { useUIStore } from '../store/uiStore';
import { Check, X, FileCode, Terminal, ChevronDown, ChevronUp, Monitor, Square } from 'lucide-react';
import { DiffViewer } from './DiffViewer';
import { log } from '../lib/logger';

interface MessageListProps {
  messages: Message[];
  toolCalls: Record<string, ToolCall>;
  tasks: Array<{
    id: string;
    subject: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm?: string;
  }>;
  onQuickAction: (text: string) => void;
  onAnswerQuestion: (requestId: string, answers: Record<string, string | string[]>) => void;
  onApprove?: (requestId: string, decision: 'allow' | 'deny', reason?: string) => void;
  onTerminalInterrupt?: (commandId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  toolCalls,
  tasks,
  onQuickAction,
  onAnswerQuestion,
  onApprove,
  onTerminalInterrupt,
}) => {
  const showWelcome = useUIStore((s) => s.showWelcome);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  // Track if user is scrolled near the bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 150;
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Only auto-scroll when a new message arrives (not on every tool update)
  // or when user was already near the bottom
  useEffect(() => {
    const isNewMessage = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if ((isNewMessage || isNearBottomRef.current) && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="message-list" ref={listRef}>
      {showWelcome && messages.length === 0 && (
        <WelcomeScreen onQuickAction={onQuickAction} />
      )}

      {messages.map((msg) => {
        switch (msg.role) {
          case 'user':
            return <UserMessageDisplay key={msg.id} message={msg} />;
          case 'assistant':
            return (
              <AssistantMessageDisplay
                key={msg.id}
                message={msg}
                toolCalls={toolCalls}
                onAnswerQuestion={onAnswerQuestion}
                onApprove={onApprove}
              />
            );
          case 'system':
            return <SystemMessageDisplay key={msg.id} message={msg} />;
          case 'terminal':
            return <TerminalMessageDisplay key={msg.id} message={msg} onInterrupt={onTerminalInterrupt} />;
          default:
            return null;
        }
      })}

      {tasks.length > 0 && <TodoPanel tasks={tasks} />}

      <div ref={endRef} className="message-list__spacer" />
    </div>
  );
};

const UserMessageDisplay: React.FC<{ message: UserMessageType }> = ({ message }) => {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="user-message">
      <div className="user-message__header">
        <span className="user-message__avatar">{'>'} You</span>
        <span className="user-message__timestamp">{time}</span>
      </div>
      <div className="user-message__content">{message.content}</div>
    </div>
  );
};

const AssistantMessageDisplay: React.FC<{
  message: AssistantMessage;
  toolCalls: Record<string, ToolCall>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string | string[]>) => void;
  onApprove?: (requestId: string, decision: 'allow' | 'deny') => void;
}> = ({ message, toolCalls, onAnswerQuestion, onApprove }) => {
  // Resolve display name from message.model using the same names as the model registry
  // Model IDs: "claude-sonnet-4-5-20250929", "claude-opus-4-6", "claude-haiku-4-5-20251001"
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
  const modelName = MODEL_DISPLAY_NAMES[message.model || ''] || 'Sonnet 4.5';

  // Safety check: ensure content is an array
  const contentArray = Array.isArray(message.content) ? message.content : [];

  // Build agent groups for agent-scoped tools/approvals
  const agentGroups = new Map<string, { toolCalls: ToolCall[], approvalBlocks: ApprovalRequestBlock[] }>();
  // Track which agent IDs we've already rendered (to avoid duplicates)
  const renderedAgentIds = new Set<string>();

  contentArray.forEach((block) => {
    if (block.type === 'tool_use') {
      const toolCall = toolCalls[block.id];
      if (toolCall && toolCall.agentId) {
        if (!agentGroups.has(toolCall.agentId)) {
          agentGroups.set(toolCall.agentId, { toolCalls: [], approvalBlocks: [] });
        }
        agentGroups.get(toolCall.agentId)!.toolCalls.push(toolCall);
      }
    } else if (block.type === 'approval_request' && (block as ApprovalRequestBlock).agentId) {
      const agId = (block as ApprovalRequestBlock).agentId!;
      if (!agentGroups.has(agId)) {
        agentGroups.set(agId, { toolCalls: [], approvalBlocks: [] });
      }
      agentGroups.get(agId)!.approvalBlocks.push(block as ApprovalRequestBlock);
    }
  });

  return (
    <div className="assistant-message">
      <div className="assistant-message__header">
        <span className="assistant-message__avatar">{'\u2726'} Claude</span>
        <span className="assistant-message__model">{modelName}</span>
      </div>
      <div className="assistant-message__content">
        {/* Render all content blocks in streaming order */}
        {contentArray.map((block, index) => {
          // Agent-scoped tool_use: render AgentContainer at the position of its FIRST tool
          if (block.type === 'tool_use') {
            const toolCall = toolCalls[block.id];
            if (toolCall && toolCall.agentId) {
              const agentId = toolCall.agentId;
              // Only render the AgentContainer once (at the first tool's position)
              if (renderedAgentIds.has(agentId)) return null;
              renderedAgentIds.add(agentId);

              const group = agentGroups.get(agentId);
              if (!group) return null;

              const taskToolCall = Object.values(toolCalls).find(
                tc => tc.toolName === 'Task' && tc.id === agentId
              );
              const agentType = taskToolCall?.input?.subagent_type as string || 'general-purpose';
              const description = taskToolCall?.input?.description as string || taskToolCall?.input?.prompt as string || 'Running task';
              const isActive = group.toolCalls.some(tc => tc.status === 'running');

              return (
                <AgentContainer
                  key={`agent-${agentId}`}
                  agentId={agentId}
                  agentType={agentType}
                  description={description}
                  toolCalls={group.toolCalls}
                  approvalBlocks={group.approvalBlocks}
                  isActive={isActive}
                  renderApprovalBlock={onApprove ? (ab) => (
                    <ApprovalRequestDisplay block={ab} onApprove={onApprove} />
                  ) : undefined}
                />
              );
            }
          }

          // Agent-scoped approval blocks are rendered inside AgentContainer, skip here
          if (block.type === 'approval_request' && (block as ApprovalRequestBlock).agentId) {
            return null;
          }

          // Everything else (text, thinking, regular tool_use, regular approval_request)
          // renders in its original streaming order
          return (
            <ContentBlockDisplay
              key={`${message.id}-block-${index}`}
              block={block}
              messageId={message.id}
              toolCalls={toolCalls}
              onAnswerQuestion={onAnswerQuestion}
              onApprove={onApprove}
            />
          );
        })}

        {message.isStreaming && <span className="assistant-message__streaming" />}
      </div>
    </div>
  );
};

const ContentBlockDisplay: React.FC<{
  block: ContentBlock;
  messageId: string;
  toolCalls: Record<string, ToolCall>;
  onAnswerQuestion: (requestId: string, answers: Record<string, string | string[]>) => void;
  onApprove?: (requestId: string, decision: 'allow' | 'deny', reason?: string) => void;
}> = ({ block, messageId, toolCalls, onAnswerQuestion, onApprove }) => {
  // Debug logging for text blocks
  if (block.type === 'text') {
    log.debug('MessageList', 'Rendering text block:', {
      messageId,
      hasText: !!block.text,
      textLength: block.text?.length,
      textPreview: block.text?.substring(0, 100),
    });
  }

  switch (block.type) {
    case 'text':
      return block.text ? <MarkdownRenderer content={block.text} /> : null;

    case 'thinking':
      return <ThinkingBlock thinking={block.thinking} />;

    case 'tool_use':
      // Get tool call from toolCalls record
      const toolCall = toolCalls[block.id];
      return toolCall ? <ToolCallDisplay toolCall={toolCall} /> : null;

    case 'tool_result':
      return null;

    case 'ask_user_question':
      return (
        <AskUserQuestion
          id={block.id}
          questions={block.questions}
          resolved={block.resolved}
          onSubmit={(answers) => {
            log.info('MessageList', 'AskUserQuestion onSubmit called:', {
              blockId: block.id,
              answers,
              answerKeys: Object.keys(answers),
              answerCount: Object.keys(answers).length
            });
            onAnswerQuestion(block.id, answers);
          }}
        />
      );

    case 'approval_request':
      // Don't show approval UI for AskUserQuestion - it handles its own approval
      if (block.tool === 'AskUserQuestion') {
        return null;
      }
      return onApprove ? (
        <ApprovalRequestDisplay
          block={block}
          onApprove={onApprove}
        />
      ) : null;

    default:
      return null;
  }
};

const SystemMessageDisplay: React.FC<{ message: SystemMessageType }> = ({ message }) => {
  const isCommand = message.subtype === 'command_result';
  const isError = message.subtype === 'error' || (isCommand && message.commandSuccess === false);
  const isInit = message.subtype === 'init';

  return (
    <div
      className={`system-message ${
        isInit ? 'system-message--init' :
        isCommand ? 'system-message--command' :
        isError ? 'system-message--error' : ''
      }`}
    >
      {isCommand && message.commandName && (
        <div className="system-message__header">
          <span className="system-message__badge">
            /{message.commandName}
          </span>
          {message.commandCategory && (
            <span className="system-message__category">
              {message.commandCategory}
            </span>
          )}
          <span className={`system-message__status ${
            message.commandSuccess ? 'success' : 'error'
          }`}>
            {message.commandSuccess ? '✓' : '✗'}
          </span>
        </div>
      )}
      <div className="system-message__content">
        {message.content}
      </div>
    </div>
  );
};

const ApprovalRequestDisplay: React.FC<{
  block: ApprovalRequestBlock;
  onApprove: (requestId: string, decision: 'allow' | 'deny', reason?: string) => void;
}> = ({ block, onApprove }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMessageInput, setShowMessageInput] = useState<'approve' | 'reject' | null>(null);
  const [approvalMessage, setApprovalMessage] = useState('');

  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'Edit':
      case 'Write':
        return <FileCode className="h-4 w-4" />;
      case 'Bash':
        return <Terminal className="h-4 w-4" />;
      default:
        return <FileCode className="h-4 w-4" />;
    }
  };

  const getToolDescription = () => {
    if (block.description) return block.description;

    const input = block.input;
    switch (block.tool) {
      case 'Edit':
        return `Edit ${input.file_path}`;
      case 'Write':
        return `Write to ${input.file_path}`;
      case 'Bash':
        return `Run: ${input.command}`;
      default:
        return `Use ${block.tool}`;
    }
  };

  if (block.resolved) {
    return (
      <div className="approval-request approval-request--resolved">
        <div className="approval-request__resolved-badge">
          ✓ Resolved
        </div>
      </div>
    );
  }

  return (
    <div className="approval-request">
      {/* Header */}
      <div
        className="approval-request__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="approval-request__header-left">
          <div className="approval-request__icon">
            {getToolIcon(block.tool)}
          </div>
          <div className="approval-request__info">
            <div className="approval-request__tool">{block.tool}</div>
            <div className="approval-request__description">
              {getToolDescription()}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="approval-request__content">
          {/* Diff View for Edit/Write operations (GitHub-style unified diff) */}
          {block.diff && <DiffViewer diff={block.diff} />}

          {/* Content Preview for Write operations (new files only - no diff attached) */}
          {block.tool === 'Write' && !block.diff && (
            <DiffViewer diff={{
              file: block.input.file_path as string,
              oldContent: '',
              newContent: block.input.content as string,
              additions: (block.input.content as string).split('\n').length,
              deletions: 0,
            }} />
          )}

          {/* Bash Command */}
          {block.tool === 'Bash' && (
            <div className="approval-request__bash">
              <pre>$ {block.input.command as string}</pre>
            </div>
          )}

          {/* Message Input */}
          {showMessageInput && (
            <div className="approval-request__message-input">
              <input
                type="text"
                placeholder={`Enter ${showMessageInput} reason...`}
                value={approvalMessage}
                onChange={(e) => setApprovalMessage(e.target.value)}
                className="approval-request__input"
                autoFocus
              />
              <div className="approval-request__message-actions">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const decision = showMessageInput === 'approve' ? 'allow' : 'deny';
                    log.info('MessageList', 'ApprovalRequest: Submitting with message:', {
                      blockId: block.id,
                      decision,
                      message: approvalMessage
                    });
                    onApprove(block.id, decision, approvalMessage);
                    setShowMessageInput(null);
                    setApprovalMessage('');
                  }}
                  className="approval-request__action approval-request__action--submit"
                >
                  Submit
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMessageInput(null);
                    setApprovalMessage('');
                  }}
                  className="approval-request__action approval-request__action--cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!showMessageInput && (
            <div className="approval-request__actions">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  log.info('MessageList', 'ApprovalRequest: Approve clicked:', block.id);
                  onApprove(block.id, 'allow');
                }}
                className="approval-request__action approval-request__action--approve"
              >
                <Check className="h-4 w-4" />
                Approve
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  log.info('MessageList', 'ApprovalRequest: Reject clicked:', block.id);
                  onApprove(block.id, 'deny');
                }}
                className="approval-request__action approval-request__action--reject"
              >
                <X className="h-4 w-4" />
                Reject
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  log.debug('MessageList', 'ApprovalRequest: Approve with message clicked');
                  setShowMessageInput('approve');
                }}
                className="approval-request__action approval-request__action--approve-msg"
              >
                <Check className="h-4 w-4" />
                Approve with message
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  log.debug('MessageList', 'ApprovalRequest: Reject with message clicked');
                  setShowMessageInput('reject');
                }}
                className="approval-request__action approval-request__action--reject-msg"
              >
                <X className="h-4 w-4" />
                Reject with message
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// DiffViewer is now imported from ./DiffViewer.tsx (GitHub-style unified diff)

// ============================================================
// Terminal Output Display (PC Persona)
// ============================================================
const TerminalMessageDisplay: React.FC<{
  message: TerminalMessageType;
  onInterrupt?: (commandId: string) => void;
}> = ({ message, onInterrupt }) => {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output container to bottom when streaming
  useEffect(() => {
    if (message.isRunning && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [message.output, message.isRunning]);

  // Render ANSI escape codes as colorful HTML using ansi_up (Ghostty-themed)
  const renderOutput = useMemo(() => {
    const ansiUp = new AnsiUp();
    ansiUp.use_classes = true; // Use CSS classes for Ghostty theme styling
    ansiUp.escape_html = true;

    let output = message.output;
    // Truncate large outputs
    const MAX_OUTPUT = 100 * 1024; // 100KB
    if (output.length > MAX_OUTPUT) {
      output = output.slice(0, MAX_OUTPUT) + '\n\n--- Output truncated (100KB limit) ---';
    }

    return ansiUp.ansi_to_html(output);
  }, [message.output]);

  return (
    <div className="terminal-output">
      <div className="terminal-output__header">
        <span className="terminal-output__avatar">
          <Monitor className="inline h-3 w-3 mr-1" style={{ verticalAlign: '-2px' }} />
          PC
        </span>
        <span className="terminal-output__cwd" title={message.cwd}>
          {message.cwd.split('/').slice(-2).join('/')}
        </span>
        <span className="terminal-output__timestamp">{time}</span>
      </div>

      <div className="terminal-output__command">
        {message.command}
      </div>

      {message.output && (
        <div
          ref={outputRef}
          className={`terminal-output__content ${message.isRunning ? 'terminal-output__content--running' : ''}`}
        >
          <span dangerouslySetInnerHTML={{ __html: renderOutput }} />
          {message.isRunning && <span className="terminal-output__cursor" />}
        </div>
      )}

      <div className="terminal-output__footer">
        {message.isRunning ? (
          <div className="terminal-output__running">
            <span className="terminal-output__running-spinner" />
            <span>Running...</span>
            {onInterrupt && (
              <button
                className="terminal-output__stop-btn"
                onClick={() => onInterrupt(message.commandId)}
                title="Stop command"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            )}
          </div>
        ) : (
          <>
            {message.exitCode !== null && (
              <span className={`terminal-output__exit-code ${
                message.exitCode === 0
                  ? 'terminal-output__exit-code--success'
                  : 'terminal-output__exit-code--error'
              }`}>
                Exit: {message.exitCode}
              </span>
            )}
            {message.durationMs !== undefined && (
              <span className="terminal-output__duration">
                {message.durationMs < 1000
                  ? `${message.durationMs}ms`
                  : `${(message.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// WriteContentViewer removed - now handled by DiffViewer with empty oldContent
