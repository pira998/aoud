import React from 'react';
import { TimelineEvent, ChatMessage } from '../hooks/useWebSocket';
import { ServerMessage } from '../../../shared/types';
import * as Diff from 'diff';
import { TaskList } from './TaskList';

interface Task {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  timestamp: string;
}

interface UnifiedTerminalViewProps {
  timeline: TimelineEvent[];
  isStreaming: boolean;
  tasks: Task[];
  onApprove: (requestId: string, reason?: string, answers?: Record<string, string>) => void;
  onReject: (requestId: string, reason?: string) => void;
}

interface ActionItem {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'task_agent' | 'file_read' | 'result' | 'approval';
  text?: string;
  // Tool-specific fields
  toolName?: string;
  toolInput?: any;
  // Agent fields
  agentType?: string;
  description?: string;
  // Approval fields
  requestId?: string;
  tool?: string;
  diff?: {
    file: string;
    oldContent: string;
    newContent: string;
    additions: number;
    deletions: number;
  };
  // Common fields
  fileName?: string;
  linesRead?: number;
  status: 'running' | 'done' | 'pending';
  toolUses?: number;
  tokens?: number;
  duration?: number;
  timestamp?: Date;
  totalCost?: number;
  success?: boolean;
}

export const UnifiedTerminalView: React.FC<UnifiedTerminalViewProps> = ({
  timeline,
  isStreaming,
  tasks,
  onApprove,
  onReject,
}) => {
  const [actionItems, setActionItems] = React.useState<ActionItem[]>([]);
  const [approvalMessages, setApprovalMessages] = React.useState<Record<string, string>>({});
  const [showMessageInput, setShowMessageInput] = React.useState<Record<string, 'approve' | 'reject' | null>>({});
  // Track selected answers for AskUserQuestion: { requestId: { questionIndex: selectedOptionIndex } }
  const [questionAnswers, setQuestionAnswers] = React.useState<Record<string, Record<number, number>>>({});

  React.useEffect(() => {
    const items: ActionItem[] = [];
    const agentMap = new Map<string, number>(); // Track agent items by ID
    let currentAssistantItem: ActionItem | null = null;

    // Process timeline events in sequence order (already sorted by sequence number)
    timeline.forEach((event, idx) => {
      if (event.type === 'user') {
        // User message - this ends any current assistant response
        currentAssistantItem = null;
        const userMsg = event.data as ChatMessage;
        items.push({
          id: event.id,
          type: 'user',
          text: userMsg.content,
          status: 'done',
          timestamp: userMsg.timestamp,
        });
      } else if (event.type === 'server') {
        const msg = event.data as ServerMessage;

        // Assistant streaming response
        if (msg.type === 'stream') {
          // If we have a current assistant item, append to it
          // Otherwise create a new one
          if (currentAssistantItem && currentAssistantItem.type === 'assistant') {
            currentAssistantItem.text = (currentAssistantItem.text || '') + msg.text;
          } else {
            currentAssistantItem = {
              id: `assistant-${idx}`,
              type: 'assistant',
              text: msg.text,
              status: 'done',
              timestamp: new Date(),
            };
            items.push(currentAssistantItem);
          }
        }

        // File read results - show as Read(filename)
        if (msg.type === 'file_read_result') {
          currentAssistantItem = null; // File read ends assistant response
          items.push({
            id: `file-read-${idx}`,
            type: 'file_read',
            agentType: 'Read',
            fileName: msg.fileName,
            linesRead: msg.linesRead,
            status: 'done',
          });
        }

        // Handle tool executions
        if ((msg as any).type === 'tool_execution') {
          currentAssistantItem = null;
          const toolMsg = msg as any;

          items.push({
            id: `tool-${toolMsg.toolUseId}`,
            type: 'tool',
            toolName: toolMsg.tool,
            toolInput: toolMsg.input,
            status: toolMsg.status || 'running',
            success: toolMsg.success,
          });
        }

        // Handle approval requests
        if (msg.type === 'approval_request') {
          currentAssistantItem = null;
          const approvalMsg = msg as any;

          items.push({
            id: `approval-${approvalMsg.requestId}`,
            type: 'approval',
            requestId: approvalMsg.requestId,
            tool: approvalMsg.tool,
            description: approvalMsg.description,
            toolInput: approvalMsg.input,
            diff: approvalMsg.diff,
            status: 'pending',
          });
        }

        // Task agents (Explore, Plan, etc)
        if (msg.type === 'task_agent_start') {
          currentAssistantItem = null; // Task agent ends assistant response
          const agentIdx = items.length;
          agentMap.set(msg.agentId, agentIdx);

          items.push({
            id: `agent-${msg.agentId}`,
            type: 'task_agent',
            agentType: msg.agentType,
            description: msg.description,
            status: 'running',
          });
        }

        if (msg.type === 'task_agent_complete') {
          const agentIdx = agentMap.get(msg.agentId);
          if (agentIdx !== undefined && items[agentIdx]) {
            const agentItem = items[agentIdx];
            agentItem.status = 'done';
            agentItem.toolUses = msg.toolUses;
            agentItem.tokens = msg.tokens;
            agentItem.duration = msg.durationMs;
          }
        }

        // Result message - show turn summary with stats
        if (msg.type === 'result') {
          currentAssistantItem = null;

          // Add result summary if we have stats
          if (msg.totalCost !== undefined || msg.duration !== undefined || msg.toolUses || msg.tokens) {
            items.push({
              id: `result-${idx}`,
              type: 'result',
              status: 'done',
              toolUses: msg.toolUses || 0,
              tokens: msg.tokens || 0,
              duration: msg.duration,
              totalCost: msg.totalCost,
            });
          }
        }
      }
    });

    setActionItems(items);
  }, [timeline]);

  const formatDuration = (ms: number | undefined): string => {
    if (!ms) return '';
    const seconds = ms / 1000;
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getToolDescription = (toolName: string, input: any): string => {
    if (!input) return '';

    try {
      switch (toolName) {
        case 'Bash':
          return input.command?.slice(0, 50) || 'command';
        case 'Read':
          // Extract just filename from path
          const readPath = input.file_path || '';
          return readPath.split('/').pop() || 'file';
        case 'Grep':
          return `"${input.pattern?.slice(0, 30)}"` || 'search';
        case 'Glob':
          return input.pattern || 'pattern';
        case 'Edit':
          const editPath = input.file_path || '';
          return editPath.split('/').pop() || 'file';
        case 'Write':
          const writePath = input.file_path || '';
          return writePath.split('/').pop() || 'file';
        case 'AskUserQuestion':
          // Show first question
          if (input.questions && input.questions.length > 0) {
            return input.questions[0].question?.slice(0, 50) || 'asking question';
          }
          return 'asking question';
        case 'WebSearch':
          const query = input.query?.slice(0, 40) || 'searching';
          if (input.allowed_domains && input.allowed_domains.length > 0) {
            return `${query} on ${input.allowed_domains[0]}`;
          }
          return query;
        case 'WebFetch':
          return input.url?.slice(0, 50) || 'fetching';
        case 'Task':
          return input.description || input.prompt?.slice(0, 50) || 'running task';
        case 'TaskCreate':
          return input.subject?.slice(0, 50) || 'creating task';
        case 'TaskUpdate':
          return input.taskId ? `task ${input.taskId}` : 'updating task';
        case 'TaskList':
          return 'listing tasks';
        case 'EnterPlanMode':
          return 'entering plan mode';
        case 'ExitPlanMode':
          return 'exiting plan mode';
        default:
          return '';
      }
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 font-mono text-[15px] leading-relaxed">
      <div className="max-w-3xl space-y-3">
        {/* Task List */}
        {tasks.length > 0 && (
          <TaskList tasks={tasks} />
        )}

        {actionItems.map((item) => (
          <div key={item.id} className="flex gap-3 items-start">
            {/* Bullet point */}
            <div className="flex-shrink-0 pt-1.5">
              {item.status === 'running' ? (
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              {/* User message - styled differently to distinguish from output */}
              {item.type === 'user' && item.text && (
                <div className="flex items-center gap-2">
                  <span className="text-foreground/50 text-sm">›</span>
                  <span className="text-foreground font-medium">{item.text}</span>
                </div>
              )}

              {/* Assistant message */}
              {item.type === 'assistant' && item.text && (
                <div className="text-foreground/80 whitespace-pre-wrap">
                  {item.text}
                </div>
              )}

              {/* File Read */}
              {item.type === 'file_read' && (
                <>
                  {/* Agent badge with filename */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center px-2 py-0.5 bg-green-500/10 rounded text-green-400 text-sm">
                      <span className="font-semibold">{item.agentType}</span>
                    </div>
                    <span className="text-foreground/90">({item.fileName})</span>
                  </div>

                  {/* Details line */}
                  <div className="mt-1 text-foreground/60 text-sm ml-1">
                    └ Read {item.linesRead} lines
                  </div>
                </>
              )}

              {/* Generic Tool Execution */}
              {item.type === 'tool' && item.toolName && (
                <>
                  {/* Tool badge with input details */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center px-2 py-0.5 bg-blue-500/10 rounded text-blue-400 text-sm">
                      <span className="font-semibold">{item.toolName}</span>
                    </div>
                    {(() => {
                      const description = getToolDescription(item.toolName, item.toolInput);
                      return description ? (
                        <span className="text-foreground/90">({description})</span>
                      ) : null;
                    })()}
                  </div>

                  {/* Details line */}
                  {item.status === 'done' ? (
                    <div className="mt-1 text-foreground/60 text-sm ml-1">
                      └ {item.success !== false ? 'Done' : 'Failed'}
                    </div>
                  ) : (
                    <div className="mt-1 text-yellow-400/80 text-sm ml-1">
                      └ Running...
                    </div>
                  )}
                </>
              )}

              {/* Approval Request */}
              {item.type === 'approval' && item.requestId && (
                <>
                  {/* Approval badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center px-2 py-0.5 bg-yellow-500/10 rounded text-yellow-400 text-sm">
                      <span className="font-semibold">Approval Required</span>
                    </div>
                    <span className="text-foreground/90">
                      {item.tool} · {item.description}
                    </span>
                  </div>

                  {/* Special handling for AskUserQuestion - show all questions and options */}
                  {item.tool === 'AskUserQuestion' && item.toolInput && (item.toolInput as any).questions && (
                    <div className="mt-2 ml-1 border border-border rounded-lg overflow-hidden bg-secondary/50">
                      {(item.toolInput as any).questions.map((q: any, qIdx: number) => {
                        const requestAnswers = questionAnswers[item.requestId!] || {};
                        const selectedOption = requestAnswers[qIdx];

                        return (
                          <div key={qIdx} className={qIdx > 0 ? 'border-t border-border' : ''}>
                            {/* Question header */}
                            <div className="px-3 py-2 bg-secondary/80">
                              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <span className="text-primary">{q.header}</span>
                                {selectedOption !== undefined && (
                                  <span className="text-green-400 text-xs">✓ Selected</span>
                                )}
                              </div>
                              <div className="text-sm text-foreground/90 mt-1">{q.question}</div>
                            </div>

                            {/* Options */}
                            <div className="px-3 py-2 space-y-2">
                              {q.options.map((opt: any, optIdx: number) => {
                                const isSelected = selectedOption === optIdx;
                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => {
                                      setQuestionAnswers({
                                        ...questionAnswers,
                                        [item.requestId!]: {
                                          ...requestAnswers,
                                          [qIdx]: optIdx,
                                        },
                                      });
                                    }}
                                    className={`w-full text-left p-2 rounded border transition-colors ${
                                      isSelected
                                        ? 'bg-primary/20 border-primary'
                                        : 'bg-background/50 border-border hover:border-primary/50'
                                    }`}
                                  >
                                    <div className={`text-sm font-medium flex items-center gap-2 ${
                                      isSelected ? 'text-primary' : 'text-foreground'
                                    }`}>
                                      {isSelected && <span className="text-green-400">✓</span>}
                                      <span>{optIdx + 1}. {opt.label}</span>
                                    </div>
                                    {opt.description && (
                                      <div className="text-xs text-muted-foreground mt-1 ml-6">
                                        {opt.description}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Diff viewer if available */}
                  {item.diff && (
                    <div className="mt-2 ml-1 border border-border rounded-lg overflow-hidden bg-secondary/50">
                      {/* File header */}
                      <div className="px-3 py-2 bg-secondary border-b border-border flex items-center gap-2 text-sm">
                        <span className="font-mono text-foreground">{item.diff.file}</span>
                        <span className="text-green-400 text-xs">+{item.diff.additions}</span>
                        <span className="text-red-400 text-xs">-{item.diff.deletions}</span>
                      </div>

                      {/* Diff content */}
                      <div className="p-3 font-mono text-xs max-h-96 overflow-y-auto">
                        {(() => {
                          // Handle new files (no oldContent) - show all as additions
                          const isNewFile = !item.diff.oldContent || item.diff.oldContent.length === 0;

                          if (isNewFile) {
                            // Show entire new content as additions
                            return (
                              <div className="bg-green-500/10 text-green-400">
                                {item.diff.newContent.split('\n').map((line, lineIdx) => (
                                  <div key={lineIdx} className="px-2">
                                    <span className="select-none mr-2">+</span>
                                    {line}
                                  </div>
                                ))}
                              </div>
                            );
                          }

                          // Regular diff for edited files
                          const changes = Diff.diffLines(item.diff.oldContent, item.diff.newContent);
                          return changes.map((change, idx) => (
                            <div
                              key={idx}
                              className={`${
                                change.added
                                  ? 'bg-green-500/10 text-green-400'
                                  : change.removed
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'text-foreground/60'
                              }`}
                            >
                              {change.value.split('\n').map((line, lineIdx) => {
                                if (!line && lineIdx === change.value.split('\n').length - 1) return null;
                                return (
                                  <div key={lineIdx} className="px-2">
                                    <span className="select-none mr-2">
                                      {change.added ? '+' : change.removed ? '-' : ' '}
                                    </span>
                                    {line}
                                  </div>
                                );
                              })}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Approve/Reject buttons */}
                  <div className="mt-3 ml-1 space-y-2">
                    {/* Show message input if user clicked with message */}
                    {showMessageInput[item.requestId!] && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`Enter ${showMessageInput[item.requestId!]} reason...`}
                          value={approvalMessages[item.requestId!] || ''}
                          onChange={(e) => setApprovalMessages({
                            ...approvalMessages,
                            [item.requestId!]: e.target.value
                          })}
                          className="flex-1 px-3 py-1.5 bg-secondary border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            const message = approvalMessages[item.requestId!];

                            // Build answers for AskUserQuestion
                            let answers: Record<string, string> | undefined;
                            if (item.tool === 'AskUserQuestion' && item.toolInput) {
                              const selectedAnswers = questionAnswers[item.requestId!];
                              if (selectedAnswers) {
                                const questions = (item.toolInput as any).questions || [];
                                const built: Record<string, string> = {};

                                Object.entries(selectedAnswers).forEach(([qIdx, optIdx]) => {
                                  const question = questions[parseInt(qIdx)];
                                  if (question && question.options[optIdx]) {
                                    built[qIdx] = question.options[optIdx].label;
                                  }
                                });

                                if (Object.keys(built).length > 0) answers = built;
                              }
                            }

                            if (showMessageInput[item.requestId!] === 'approve') {
                              onApprove(item.requestId!, message, answers);
                            } else {
                              onReject(item.requestId!, message);
                            }
                            setShowMessageInput({ ...showMessageInput, [item.requestId!]: null });
                            setApprovalMessages({ ...approvalMessages, [item.requestId!]: '' });
                          }}
                          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors font-medium"
                        >
                          Submit
                        </button>
                        <button
                          onClick={() => {
                            setShowMessageInput({ ...showMessageInput, [item.requestId!]: null });
                            setApprovalMessages({ ...approvalMessages, [item.requestId!]: '' });
                          }}
                          className="px-3 py-1.5 text-sm bg-secondary text-foreground rounded hover:bg-secondary/80 transition-colors font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Main action buttons */}
                    {!showMessageInput[item.requestId!] && (() => {
                      // Helper to build answers for AskUserQuestion
                      const buildAnswers = () => {
                        if (item.tool !== 'AskUserQuestion' || !item.toolInput) return undefined;

                        const selectedAnswers = questionAnswers[item.requestId!];
                        if (!selectedAnswers) return undefined;

                        const questions = (item.toolInput as any).questions || [];
                        const answers: Record<string, string> = {};

                        // Convert selected indices to option labels
                        Object.entries(selectedAnswers).forEach(([qIdx, optIdx]) => {
                          const question = questions[parseInt(qIdx)];
                          if (question && question.options[optIdx]) {
                            answers[qIdx] = question.options[optIdx].label;
                          }
                        });

                        return Object.keys(answers).length > 0 ? answers : undefined;
                      };

                      return (
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => onApprove(item.requestId!, undefined, buildAnswers())}
                            className="px-3 py-1.5 text-sm bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => onReject(item.requestId!)}
                            className="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors font-medium"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => setShowMessageInput({ ...showMessageInput, [item.requestId!]: 'approve' })}
                            className="px-3 py-1.5 text-sm bg-green-500/10 text-green-400/80 rounded hover:bg-green-500/20 transition-colors font-medium border border-green-500/30"
                          >
                            Approve with message
                          </button>
                          <button
                            onClick={() => setShowMessageInput({ ...showMessageInput, [item.requestId!]: 'reject' })}
                            className="px-3 py-1.5 text-sm bg-red-500/10 text-red-400/80 rounded hover:bg-red-500/20 transition-colors font-medium border border-red-500/30"
                          >
                            Reject with message
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* Task Agent */}
              {item.type === 'task_agent' && (
                <>
                  {/* Agent badge with description */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center px-2 py-0.5 bg-green-500/10 rounded text-green-400 text-sm">
                      <span className="font-semibold">{item.agentType}</span>
                    </div>
                    <span className="text-foreground/90">({item.description})</span>
                  </div>

                  {/* Status and stats on separate line */}
                  {item.status === 'done' ? (
                    <div className="mt-1 text-foreground/60 text-sm ml-1">
                      └ Done ({item.toolUses || 0} tool use{(item.toolUses || 0) !== 1 ? 's' : ''}
                      {item.tokens !== undefined && ` · ${(item.tokens / 1000).toFixed(1)}k tokens`}
                      {item.duration && ` · ${formatDuration(item.duration)}`})
                    </div>
                  ) : (
                    <div className="mt-1 text-yellow-400/80 text-sm ml-1">
                      └ Running...
                    </div>
                  )}
                </>
              )}

              {/* Result Summary */}
              {item.type === 'result' && (
                <>
                  <div className="inline-flex items-center px-2 py-0.5 bg-blue-500/10 rounded text-blue-400 text-sm">
                    <span className="font-semibold">Completed</span>
                  </div>
                  <div className="mt-1 text-foreground/60 text-sm ml-1">
                    └ Done (
                    {(item.toolUses ?? 0) > 0 && `${item.toolUses} tool use${item.toolUses !== 1 ? 's' : ''}`}
                    {(item.tokens ?? 0) > 0 && (item.toolUses ?? 0) > 0 && ' · '}
                    {(item.tokens ?? 0) > 0 && `${((item.tokens ?? 0) / 1000).toFixed(1)}k tokens`}
                    {item.duration && ((item.toolUses ?? 0) > 0 || (item.tokens ?? 0) > 0) && ' · '}
                    {item.duration && formatDuration(item.duration)}
                    {item.totalCost !== undefined && ` · $${item.totalCost.toFixed(4)}`}
                    )
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Show current streaming if processing */}
        {isStreaming && (
          <div className="flex gap-3 items-start">
            <div className="flex-shrink-0 pt-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="text-foreground/90">
                Processing
                <span className="inline-block w-1.5 h-4 ml-1 bg-primary/80 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {actionItems.length === 0 && !isStreaming && (
          <div className="text-foreground/40 text-center py-16 text-sm">
            No activity yet. Start a conversation to see the terminal log.
          </div>
        )}
      </div>
    </div>
  );
};
