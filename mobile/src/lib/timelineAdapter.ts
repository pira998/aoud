/**
 * Timeline Adapter
 *
 * Converts WebSocket timeline events into Message objects compatible with new-ui components.
 * This adapter is the bridge between the WebSocket data format and the UI component format.
 */

import type { TimelineEvent, ChatMessage, ServerMessage } from '../hooks/useWebSocket';
import type {
  Message,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  TerminalMessage,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  AskUserQuestionBlock,
  ApprovalRequestBlock,
  ToolCall,
} from '../types';
import { log } from './logger';

interface ConversionResult {
  messages: Message[];
  toolCalls: Record<string, ToolCall>;
}

interface ToolExecution {
  toolUseId: string;
  tool: string;
  input: unknown;
  startTime: number;
  status: 'running' | 'done' | 'error';
  success?: boolean;
  result?: unknown;
  agentId?: string; // If present, this tool belongs to a Task agent
}

/**
 * Converts timeline events into UI messages
 *
 * Strategy:
 * - User messages → UserMessage
 * - Stream messages → Aggregate into single AssistantMessage with TextBlock
 * - Thinking messages → ThinkingBlock in AssistantMessage
 * - Tool executions → ToolCall objects (tracked separately)
 * - Approval requests → AskUserQuestionBlock (if applicable)
 * - System messages → SystemMessage
 */
export function convertTimelineToMessages(timeline: TimelineEvent[]): ConversionResult {
  const messages: Message[] = [];
  let toolCalls: Record<string, ToolCall> = {};

  // Temporary accumulator for streaming assistant response
  let currentAssistantMessage: AssistantMessage | null = null;
  // Ordered content blocks preserving streaming order (text interleaved with tools)
  let orderedContent: ContentBlock[] = [];
  let currentTextAccumulator = '';
  let currentThinkingText = '';

  // Track tool executions
  const toolExecutions = new Map<string, ToolExecution>();

  // Track terminal command messages by commandId
  const terminalMessages = new Map<string, TerminalMessage>();

  for (const event of timeline) {
    if (event.type === 'user') {
      // Finalize any pending assistant message
      finalizeAssistantMessage();

      const chatMsg = event.data as ChatMessage;
      const userMsg: UserMessage = {
        id: event.id,
        role: 'user',
        content: chatMsg.content,
        timestamp: chatMsg.timestamp.getTime(),
      };
      messages.push(userMsg);
    } else {
      // Server message
      const serverMsg = event.data as ServerMessage;

      switch (serverMsg.type) {
        case 'session':
          if (serverMsg.status === 'started' || serverMsg.status === 'active') {
            // Finalize previous message if exists
            finalizeAssistantMessage();

            // Start a new assistant message
            currentAssistantMessage = {
              id: `assistant-${event.sequence}`,
              role: 'assistant',
              content: [],
              timestamp: Date.now(),
              isStreaming: true,
            };
            orderedContent = [];
            currentTextAccumulator = '';
            currentThinkingText = '';
          } else if (serverMsg.status === 'complete' || serverMsg.status === 'error') {
            finalizeAssistantMessage();
          }
          break;

        case 'stream':
          // Accumulate streaming text in the appropriate buffer
          // Ensure text is actually a string to avoid [object Object]
          const streamText = typeof serverMsg.text === 'string'
            ? serverMsg.text
            : JSON.stringify(serverMsg.text);

          // Create assistant message if it doesn't exist (e.g., after question is answered)
          if (!currentAssistantMessage) {
            currentAssistantMessage = {
              id: `assistant-${event.sequence}`,
              role: 'assistant',
              content: [],
              timestamp: Date.now(),
              isStreaming: true,
            };
          }

          currentTextAccumulator += streamText;

          // Mark message as streaming
          currentAssistantMessage.isStreaming = true;
          break;

        case 'thinking':
          // Accumulate thinking text
          currentThinkingText += serverMsg.text;
          break;

        case 'tool_start':
          // IGNORE tool_start messages - they have empty input ({})
          // We only process tool_input messages which have the full input
          log.debug('TimelineAdapter', 'Ignoring tool_start (empty input)');
          break;

        case 'tool_input':
          // Track tool execution with FULL input (from content_block_start)
          const toolUseId = serverMsg.toolUseId;
          const agentId = serverMsg.agentId; // Extract agentId from server message

          // Flush accumulated text BEFORE this tool to preserve streaming order
          if (currentTextAccumulator.trim()) {
            orderedContent.push({
              type: 'text',
              text: currentTextAccumulator,
            } as TextBlock);
            currentTextAccumulator = '';
          }

          log.debug('TimelineAdapter', 'Tool input (full):', {
            tool: serverMsg.tool,
            toolUseId,
            agentId,
            agentIdType: typeof agentId,
            agentIdIsDefined: agentId !== undefined,
            serverMsgAgentId: (serverMsg as any).agentId,
            input: serverMsg.input,
          });

          toolExecutions.set(toolUseId, {
            toolUseId,
            tool: serverMsg.tool,
            input: serverMsg.input,
            startTime: Date.now(),
            status: 'running',
            agentId, // Store agentId
          });

          // Create NEW Record with spread operator to force reference change
          toolCalls = {
            ...toolCalls,
            [toolUseId]: {
              id: toolUseId,
              toolName: serverMsg.tool,
              input: serverMsg.input as Record<string, unknown>,
              status: 'running',
              isStreaming: false,
              isCollapsed: false,
              agentId, // Include agentId in ToolCall
            }
          };

          // Add tool use block to appropriate message
          log.debug('TimelineAdapter', 'Checking agentId:', {
            hasAgentId: !!agentId,
            agentId,
            messagesCount: messages.length,
            toolName: serverMsg.tool,
          });

          if (agentId) {
            log.debug('TimelineAdapter', 'Tool has agentId, searching for parent message...');
            // This tool belongs to an agent - find the message containing the parent Task tool
            // Search both finalized messages AND currentAssistantMessage (which hasn't been pushed yet)
            let parentMessage: AssistantMessage | undefined = messages.find(
              (msg): msg is AssistantMessage =>
                msg.role === 'assistant' &&
                Array.isArray(msg.content) &&
                msg.content.some(block =>
                  block.type === 'tool_use' && (block as ToolUseBlock).id === agentId
                )
            );

            // Also check currentAssistantMessage (not yet in messages array)
            if (!parentMessage && currentAssistantMessage) {
              const hasParent = currentAssistantMessage.content.some(
                block => block.type === 'tool_use' && (block as ToolUseBlock).id === agentId
              );
              if (hasParent) {
                parentMessage = currentAssistantMessage;
              }
            }

            log.debug('TimelineAdapter', 'Parent message search result:', {
              found: !!parentMessage,
              parentMessageId: parentMessage?.id,
              parentContentCount: parentMessage?.content.length,
              foundInCurrent: parentMessage === currentAssistantMessage,
            });

            if (parentMessage) {
              // Check if this tool block already exists in parent message
              const hasToolBlock = parentMessage.content.some(
                (block) => block.type === 'tool_use' && (block as ToolUseBlock).id === toolUseId
              );

              if (!hasToolBlock) {
                parentMessage.content.push({
                  type: 'tool_use',
                  id: toolUseId,
                  name: serverMsg.tool,
                  input: serverMsg.input as Record<string, unknown>,
                } as ToolUseBlock);
                log.success('TimelineAdapter', 'Added nested tool to parent message:', { agentId, toolUseId, toolName: serverMsg.tool });
              } else {
                log.debug('TimelineAdapter', 'Tool block already exists in parent');
              }
            } else {
              log.warn('TimelineAdapter', 'Parent message not found for agentId:', agentId, 'Available messages:', messages.map(m => ({
                id: m.id,
                role: m.role,
                toolBlocks: m.role === 'assistant' && Array.isArray((m as AssistantMessage).content)
                  ? (m as AssistantMessage).content.filter((b: any) => b.type === 'tool_use').map((b: any) => b.id)
                  : []
              })));
            }
          } else {
            // Regular tool - add to current assistant message
            // Create assistant message if it doesn't exist
            if (!currentAssistantMessage) {
              currentAssistantMessage = {
                id: `assistant-${event.sequence}`,
                role: 'assistant',
                content: [],
                timestamp: Date.now(),
                isStreaming: false,
              };
            }

            // Check if this tool block already exists
            const hasToolBlock = currentAssistantMessage.content.some(
              (block) => block.type === 'tool_use' && (block as ToolUseBlock).id === toolUseId
            );

            if (!hasToolBlock) {
              const toolBlock = {
                type: 'tool_use',
                id: toolUseId,
                name: serverMsg.tool,
                input: serverMsg.input as Record<string, unknown>,
              } as ToolUseBlock;
              currentAssistantMessage.content.push(toolBlock);
              // Also track in ordered content for correct interleaving
              orderedContent.push(toolBlock);
            }
          }
          break;

        case 'tool_complete':
          // Update tool execution
          const execution = toolExecutions.get(serverMsg.toolUseId);

          log.debug('TimelineAdapter', 'Tool complete BEFORE update:', {
            toolUseId: serverMsg.toolUseId,
            success: serverMsg.success,
            result: serverMsg.result,
            resultType: typeof serverMsg.result,
            hasExecution: !!execution,
            hasToolCall: !!toolCalls[serverMsg.toolUseId],
            currentStatus: toolCalls[serverMsg.toolUseId]?.status,
            toolCallsBefore: Object.keys(toolCalls),
          });

          if (execution) {
            execution.status = serverMsg.success ? 'done' : 'error';
            execution.success = serverMsg.success;
            execution.result = serverMsg.result;

            // Convert result to output string
            let outputString: string;
            if (typeof serverMsg.result === 'string') {
              outputString = serverMsg.result;
            } else if (serverMsg.result === null || serverMsg.result === undefined) {
              outputString = '';
            } else {
              outputString = JSON.stringify(serverMsg.result, null, 2);
            }

            // Create NEW Record with updated toolCall to force reference change
            if (toolCalls[serverMsg.toolUseId]) {
              const oldToolCallsRef = toolCalls;
              toolCalls = {
                ...toolCalls,
                [serverMsg.toolUseId]: {
                  ...toolCalls[serverMsg.toolUseId],
                  status: serverMsg.success ? 'done' : 'error',
                  output: outputString,
                  elapsedMs: Date.now() - execution.startTime,
                }
              };

              log.debug('TimelineAdapter', 'Updated toolCall AFTER:', {
                toolUseId: serverMsg.toolUseId,
                newStatus: toolCalls[serverMsg.toolUseId].status,
                hasOutput: !!toolCalls[serverMsg.toolUseId].output,
                outputLength: toolCalls[serverMsg.toolUseId].output?.length,
                outputPreview: toolCalls[serverMsg.toolUseId].output?.substring(0, 100),
                newElapsedMs: toolCalls[serverMsg.toolUseId].elapsedMs,
                recordRefChanged: oldToolCallsRef !== toolCalls,
                toolCallKeys: Object.keys(toolCalls),
              });
            } else {
              log.warn('TimelineAdapter', 'Tool complete but no toolCall found for:', serverMsg.toolUseId);
            }
          } else {
            log.warn('TimelineAdapter', 'Tool complete but no execution found for:', serverMsg.toolUseId);
          }
          break;

        case 'approval_request':
          // Determine if this approval belongs to an agent
          // tool_input (with agentId) always arrives before approval_request for the same tool
          let approvalAgentId: string | undefined;
          for (const [, exec] of toolExecutions.entries()) {
            if (exec.tool === serverMsg.tool && exec.status === 'running' && exec.agentId) {
              approvalAgentId = exec.agentId;
              break;
            }
          }

          const approvalBlock: ApprovalRequestBlock = {
            type: 'approval_request',
            id: serverMsg.requestId,
            tool: serverMsg.tool,
            description: serverMsg.description,
            input: serverMsg.input as Record<string, unknown>,
            resolved: false,
            agentId: approvalAgentId,
            // Include diff directly if provided in the approval request message
            diff: serverMsg.diff,
          };

          if (approvalAgentId) {
            // Agent-scoped approval: embed in the parent message where the agent lives
            // Do NOT call finalizeAssistantMessage() - keep the agent context intact
            let parentMsg: AssistantMessage | undefined = messages.find(
              (msg): msg is AssistantMessage =>
                msg.role === 'assistant' &&
                Array.isArray(msg.content) &&
                msg.content.some(b => b.type === 'tool_use' && (b as ToolUseBlock).id === approvalAgentId)
            );
            if (!parentMsg && currentAssistantMessage) {
              const has = currentAssistantMessage.content.some(
                b => b.type === 'tool_use' && (b as ToolUseBlock).id === approvalAgentId
              );
              if (has) parentMsg = currentAssistantMessage;
            }

            if (parentMsg) {
              // Check if this approval block already exists
              const hasBlock = parentMsg.content.some(
                b => b.type === 'approval_request' && (b as ApprovalRequestBlock).id === serverMsg.requestId
              );
              if (!hasBlock) {
                parentMsg.content.push(approvalBlock);
                log.success('TimelineAdapter', 'Added approval to agent parent message:', { approvalAgentId, requestId: serverMsg.requestId });
              }
            } else {
              // Fallback: create separate message
              log.warn('TimelineAdapter', 'Agent parent not found for approval, creating separate message');
              finalizeAssistantMessage();
              const approvalMsg: AssistantMessage = {
                id: `approval-${serverMsg.requestId}`,
                role: 'assistant',
                content: [approvalBlock],
                timestamp: Date.now(),
              };
              messages.push(approvalMsg);
            }
          } else {
            // Regular non-agent approval: attach to the current assistant message
            // so it renders right after its associated tool block
            if (currentAssistantMessage) {
              // Find the tool_use block in orderedContent that this approval belongs to
              // and insert the approval right after it
              const toolUseIndex = orderedContent.findIndex(
                b => b.type === 'tool_use' && (b as ToolUseBlock).name === serverMsg.tool &&
                  toolExecutions.get((b as ToolUseBlock).id)?.status === 'running'
              );
              if (toolUseIndex !== -1) {
                // Insert approval right after its tool
                orderedContent.splice(toolUseIndex + 1, 0, approvalBlock);
              } else {
                // Fallback: add to end of orderedContent
                orderedContent.push(approvalBlock);
              }
              currentAssistantMessage.content.push(approvalBlock);
              log.success('TimelineAdapter', 'Added approval inline with tool in current message');
            } else {
              // No current message - create separate message as fallback
              const approvalMsg: AssistantMessage = {
                id: `approval-${serverMsg.requestId}`,
                role: 'assistant',
                content: [approvalBlock],
                timestamp: Date.now(),
              };
              messages.push(approvalMsg);
            }
          }
          break;

        case 'diff':
          // Attach diff to existing approval request
          // Search all assistant messages AND currentAssistantMessage (approval may be embedded in agent parent)
          let diffAttached = false;
          const assistantMsgs: AssistantMessage[] = messages.filter(
            (msg): msg is AssistantMessage => msg.role === 'assistant'
          );
          if (currentAssistantMessage) assistantMsgs.push(currentAssistantMessage);

          for (const msg of assistantMsgs) {
            const targetBlock = msg.content.find(
              (b) => b.type === 'approval_request' && (b as ApprovalRequestBlock).id === serverMsg.requestId
            ) as ApprovalRequestBlock | undefined;

            if (targetBlock) {
              targetBlock.diff = {
                file: serverMsg.file,
                oldContent: serverMsg.oldContent,
                newContent: serverMsg.newContent,
                additions: serverMsg.additions,
                deletions: serverMsg.deletions,
              };
              diffAttached = true;
              break;
            }
          }
          if (!diffAttached) {
            log.warn('TimelineAdapter', 'Could not attach diff, approval block not found:', serverMsg.requestId);
          }
          break;

        case 'ask_user_question':
          // Convert server questions to AskUserQuestionBlock
          finalizeAssistantMessage();

          const questionMsg: AssistantMessage = {
            id: `question-${serverMsg.requestId}`,
            role: 'assistant',
            content: [
              {
                type: 'ask_user_question',
                id: serverMsg.requestId,
                questions: serverMsg.questions.map(q => ({
                  question: q.question,
                  header: q.header,
                  options: q.options,
                  multiSelect: q.multiSelect,
                })),
                resolved: (serverMsg as any).resolved || false,
              } as AskUserQuestionBlock,
            ],
            timestamp: Date.now(),
          };
          messages.push(questionMsg);
          break;

        case 'result':
          // Add cost/duration as system message
          if (serverMsg.totalCost !== undefined) {
            finalizeAssistantMessage();

            const resultMsg: SystemMessage = {
              id: `result-${event.sequence}`,
              role: 'system',
              subtype: 'status',
              content: `Completed (Cost: $${serverMsg.totalCost.toFixed(4)}, Duration: ${((serverMsg.duration || 0) / 1000).toFixed(1)}s)`,
              timestamp: Date.now(),
            };
            messages.push(resultMsg);
          }
          break;

        case 'mode_changed':
          finalizeAssistantMessage();

          const modeMsg: SystemMessage = {
            id: `mode-${event.sequence}`,
            role: 'system',
            subtype: 'status',
            content: `Mode changed to: ${serverMsg.mode}`,
            timestamp: Date.now(),
          };
          messages.push(modeMsg);
          break;

        case 'task_created':
        case 'task_updated':
          // Task notifications handled by TodoPanel, not in message stream
          break;

        case 'task_agent_start':
        case 'task_agent_progress':
        case 'task_agent_complete':
          // Agent task notifications handled separately
          break;

        case 'slash_command_result':
          // Display slash command results as system messages
          finalizeAssistantMessage();

          const cmdResult = serverMsg as any;
          if (cmdResult.output) {
            const slashResultMsg: SystemMessage = {
              id: `slash-result-${event.sequence}`,
              role: 'system',
              subtype: cmdResult.success ? 'command_result' : 'error',
              content: cmdResult.output,
              timestamp: Date.now(),
              // Store command metadata for display
              commandName: cmdResult.command,
              commandSuccess: cmdResult.success,
              commandCategory: cmdResult.category,
            };
            messages.push(slashResultMsg);
          }
          break;

        // ---------- Direct terminal execution ----------
        case 'terminal_start': {
          finalizeAssistantMessage();
          const termMsg: TerminalMessage = {
            id: `terminal-${(serverMsg as any).commandId}`,
            role: 'terminal',
            command: (serverMsg as any).command,
            commandId: (serverMsg as any).commandId,
            output: '',
            exitCode: null,
            isRunning: true,
            cwd: (serverMsg as any).cwd,
            timestamp: Date.now(),
          };
          terminalMessages.set((serverMsg as any).commandId, termMsg);
          messages.push(termMsg);
          break;
        }

        case 'terminal_output': {
          const termOut = terminalMessages.get((serverMsg as any).commandId);
          if (termOut) {
            termOut.output += (serverMsg as any).data;
          }
          break;
        }

        case 'terminal_exit': {
          const termExit = terminalMessages.get((serverMsg as any).commandId);
          if (termExit) {
            termExit.exitCode = (serverMsg as any).exitCode;
            termExit.isRunning = false;
            termExit.durationMs = (serverMsg as any).durationMs;
          }
          break;
        }

        default:
          // Other messages - add as system messages if important
          break;
      }
    }
  }

  // Finalize any pending assistant message
  finalizeAssistantMessage();

  function finalizeAssistantMessage() {
    if (!currentAssistantMessage) return;

    log.debug('TimelineAdapter', 'Finalizing message:', {
      messageId: currentAssistantMessage.id,
      orderedContentLength: orderedContent.length,
      currentTextAccumulatorLength: currentTextAccumulator.length,
    });

    // Build content preserving streaming order:
    // orderedContent already has text and tool blocks interleaved in the order they streamed
    const content: ContentBlock[] = [];

    // 1. Add thinking block if present (always at the top)
    if (currentThinkingText.trim()) {
      content.push({
        type: 'thinking',
        thinking: currentThinkingText,
      } as ThinkingBlock);
    }

    // 2. Add all ordered content (text and tools interleaved in streaming order)
    content.push(...orderedContent);

    // 3. Flush any remaining accumulated text after the last tool
    if (currentTextAccumulator.trim()) {
      content.push({
        type: 'text',
        text: currentTextAccumulator,
      } as TextBlock);
    }

    // 4. Add any other blocks from content that aren't already in orderedContent
    //    (e.g., agent-scoped tool blocks, approval blocks added directly to content)
    const orderedToolUseIds = new Set(
      orderedContent
        .filter(b => b.type === 'tool_use')
        .map(b => (b as ToolUseBlock).id)
    );
    const orderedApprovalIds = new Set(
      orderedContent
        .filter(b => b.type === 'approval_request')
        .map(b => (b as ApprovalRequestBlock).id)
    );
    for (const block of currentAssistantMessage.content) {
      if (block.type === 'tool_use' && orderedToolUseIds.has((block as ToolUseBlock).id)) {
        continue; // Already in orderedContent
      }
      if (block.type === 'approval_request' && orderedApprovalIds.has((block as ApprovalRequestBlock).id)) {
        continue; // Already in orderedContent
      }
      if (block.type === 'text' || block.type === 'thinking') {
        continue; // Already handled above
      }
      content.push(block);
    }

    // Only add message if it has content (including tool blocks)
    if (content.length > 0) {
      currentAssistantMessage.content = content;
      currentAssistantMessage.isStreaming = false;

      log.debug('TimelineAdapter', 'Finalized message content:', {
        messageId: currentAssistantMessage.id,
        contentBlockCount: content.length,
        blockTypes: content.map(b => b.type),
        textBlocksCount: content.filter(b => b.type === 'text').length,
        toolBlocksCount: content.filter(b => b.type === 'tool_use').length,
      });

      messages.push(currentAssistantMessage);
    }

    // Reset ALL accumulators
    currentAssistantMessage = null;
    orderedContent = [];
    currentTextAccumulator = '';
    currentThinkingText = '';
  }

  log.debug('TimelineAdapter', 'RETURNING:', {
    messageCount: messages.length,
    toolCallCount: Object.keys(toolCalls).length,
    toolCallStatuses: Object.fromEntries(
      Object.entries(toolCalls).map(([id, tc]) => [id.substring(0, 8), tc.status])
    ),
  });

  return { messages, toolCalls };
}

/**
 * Get real-time streaming content (for active message)
 */
export function getStreamingContent(
  streamingText: string,
  thinkingText: string
): ContentBlock[] {
  const content: ContentBlock[] = [];

  if (thinkingText) {
    content.push({
      type: 'thinking',
      thinking: thinkingText,
    } as ThinkingBlock);
  }

  if (streamingText) {
    content.push({
      type: 'text',
      text: streamingText,
    } as TextBlock);
  }

  return content;
}
