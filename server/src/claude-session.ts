import { query } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import type { PendingApproval, ApprovalResult } from './types.js';
import type { PermissionMode, Question, QuestionAction } from '../../shared/types.js';
import { log } from './logger.js';
import { TicketStore } from './ticket-engine/index.js';
import type { TicketServerMessage } from '../../shared/ticket-types.js';
import { createTicketMcpServer } from './ticket-mcp-server.js';
import { getModelConfig, resolveAlias, modelSupportsBeta, getModelBetaTag } from './models/model-registry.js';

// Track active task agents
interface ActiveTaskAgent {
  agentId: string;
  agentType: string;
  description: string;
  startTime: number;
  toolUses: number;
  tokens: number;
  sessionTurnStart: number;  // Track which turn this agent belongs to
}

// Track pending user questions
interface PendingQuestion {
  requestId: string;
  questions: Question[];
  planFile?: string;
  actions?: QuestionAction[];
  resolve: (result: { answers: Record<string, string | string[]>; action?: string; customInput?: string }) => void;
}

export interface SessionCallbacks {
  onStream: (text: string, agentId?: string) => void;
  onThinking: (text: string, agentId?: string) => void;
  onToolStart: (tool: string, input: unknown, toolUseId: string, agentId?: string) => void;
  onToolInput: (tool: string, toolUseId: string, input: unknown, agentId?: string) => void;
  onToolComplete: (tool: string, toolUseId: string, result: string, success: boolean, agentId?: string) => void;
  onApprovalRequest: (requestId: string, tool: string, input: unknown, description?: string, diff?: { file: string; oldContent: string; newContent: string; additions: number; deletions: number }) => void;
  onDiff: (requestId: string, file: string, oldContent: string, newContent: string, additions: number, deletions: number) => void;
  onStatusChange: (status: 'started' | 'active' | 'complete' | 'error') => void;
  onResult: (result: string, totalCost?: number, duration?: number, toolUses?: number, tokens?: number, usage?: { inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number }) => void;
  onError: (error: string) => void;
  onModeChanged: (mode: PermissionMode) => void;
  // New callbacks for enhanced UI
  onTaskAgentStart: (agentId: string, agentType: string, description: string) => void;
  onTaskAgentProgress: (agentId: string, toolUses: number, tokens: number, status: 'running' | 'done') => void;
  onTaskAgentComplete: (agentId: string, agentType: string, description: string, toolUses: number, tokens: number, durationMs: number, success: boolean) => void;
  onFileReadResult: (toolUseId: string, filePath: string, fileName: string, linesRead: number) => void;
  onFileWriteResult: (toolUseId: string, filePath: string, fileName: string, linesWritten: number, contentPreview: string | undefined, totalLines: number, isUpdate: boolean, label?: string) => void;
  onAskUserQuestion: (requestId: string, questions: any[], planFile?: string, actions?: any[]) => void;
  onContentBlock: (blockId: string, blockType: 'markdown' | 'code' | 'file_content', content: string, previewLines: number, totalLines: number, title?: string, language?: string, filePath?: string) => void;
  // Task management callbacks
  onTaskCreated: (task: { id: string; subject: string; description: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string; timestamp: string }) => void;
  onTaskUpdated: (taskId: string, status?: 'pending' | 'in_progress' | 'completed', subject?: string, description?: string, activeForm?: string) => void;
  onTaskList: (tasks: any[]) => void;
  // Ticket management callbacks
  onTicketChange: (message: any) => void;
}

export interface ExecuteOptions {
  permissionMode?: PermissionMode;
  maxThinkingTokens?: number;
}

export class ClaudeSession {
  public readonly id: string;
  public readonly projectPath: string;
  public status: 'idle' | 'running' | 'waiting_approval' | 'waiting_question' = 'idle';
  public pendingApprovals: Map<string, PendingApproval> = new Map();
  public pendingQuestions: Map<string, PendingQuestion> = new Map();
  public activeTaskAgents: Map<string, ActiveTaskAgent> = new Map();
  public messageCount: number = 0;
  public lastActivity: Date = new Date();
  public permissionMode: PermissionMode = 'default';
  public model: string = 'claude-sonnet-4-5-20250929';
  public modelAlias: string | undefined = undefined; // Store the alias (e.g., 'sonnet', 'sonnet-1m')
  public modelBetaTag: string | undefined = undefined; // Store the beta tag if applicable

  private callbacks: SessionCallbacks;
  private abortController?: AbortController;
  private claudeSessionId?: string;
  private currentToolInputs: Map<string, { name: string; buffer: string; toolUseId: string; initialInput?: any }> = new Map();
  // Track tool names by ID for matching results
  private toolNamesById: Map<string, string> = new Map();
  // Track which tools already received results from SDK
  private toolsWithResults: Set<string> = new Set();
  // Track stats for current turn
  private currentTurnToolUses: number = 0;
  private currentTurnTokens: number = 0;
  private turnMessageIndex: number = 0;
  // Store slash commands discovered from SDK init message
  private sdkSlashCommands: Array<{name: string; description: string; argumentHint: string}> = [];
  // Ticket management
  private ticketStore: TicketStore;
  private ticketMcpServer: ReturnType<typeof createTicketMcpServer>;

  constructor(id: string, projectPath: string, callbacks: SessionCallbacks, resumeSessionId?: string) {
    this.id = id;
    this.projectPath = projectPath;
    this.callbacks = callbacks;
    // If resuming, set the SDK session ID immediately so first query resumes correctly
    if (resumeSessionId) {
      this.claudeSessionId = resumeSessionId;
      log.info('ClaudeSession', `Resuming from session: ${resumeSessionId}`);
    }
    // Initialize ticket system
    this.ticketStore = new TicketStore(projectPath);
    this.ticketMcpServer = createTicketMcpServer(this.ticketStore, (msg: TicketServerMessage) => {
      this.callbacks.onTicketChange(msg);
    });
  }

  // Resolve a pending question from mobile
  resolveQuestion(requestId: string, answers: Record<string, string | string[]>, action?: string, customInput?: string): boolean {
    const pending = this.pendingQuestions.get(requestId);
    if (pending) {
      pending.resolve({ answers, action, customInput });
      this.pendingQuestions.delete(requestId);
      this.status = 'running';
      return true;
    }
    return false;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    this.callbacks.onModeChanged(mode);
  }

  setModel(model: string): void {
    // Get the full model config to preserve all metadata
    const modelConfig = getModelConfig(model);

    if (modelConfig) {
      // Store the base model ID (for SDK)
      this.model = modelConfig.id;
      // Store the alias (for UI matching)
      this.modelAlias = modelConfig.alias;
      // Store the beta tag (for SDK beta headers)
      this.modelBetaTag = modelConfig.betaTag;

      log.info('ClaudeSession', `Model changed to ${modelConfig.name} (id: ${this.model}, alias: ${this.modelAlias || 'none'}, betaTag: ${this.modelBetaTag || 'none'})`);
    } else {
      // Fallback: resolve alias to ID if config not found
      const resolved = resolveAlias(model) || model;
      this.model = resolved;
      this.modelAlias = undefined;
      this.modelBetaTag = undefined;

      log.warn('ClaudeSession', `Model config not found for '${model}', using ID: ${resolved}`);
    }

    // Set env var so next SDK query picks it up
    process.env.ANTHROPIC_MODEL = this.model;
  }

  /**
   * Check if current model requires beta headers (1M context support)
   */
  private shouldUseBeta(): boolean {
    return this.modelBetaTag !== undefined;
  }

  getClaudeSessionId(): string | undefined {
    return this.claudeSessionId;
  }

  async getSupportedSlashCommands(): Promise<Array<{name: string; description: string; argumentHint: string}>> {
    // Return the actual slash commands discovered from the SDK init message
    // These are dynamically provided by the Claude Agent SDK
    return this.sdkSlashCommands;
  }

  async executePrompt(prompt: string, options?: ExecuteOptions): Promise<void> {
    this.status = 'running';
    this.lastActivity = new Date();
    this.messageCount++;
    this.callbacks.onStatusChange('active');

    // Reset turn counters for new prompt
    this.currentTurnToolUses = 0;
    this.currentTurnTokens = 0;
    this.turnMessageIndex++;
    this.toolsWithResults.clear();
    log.debug('Debug', 'New turn started:', this.turnMessageIndex, '| Counters reset');

    // Update permission mode if provided
    if (options?.permissionMode) {
      this.permissionMode = options.permissionMode;
    }

    this.abortController = new AbortController();

    try {
      log.keyValue('ClaudeSession', {
        projectPath: this.projectPath,
        permissionMode: this.permissionMode,
        model: this.model,
        prompt: prompt.substring(0, 100) + '...',
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '(not set)',
      });

      const queryOptions: Parameters<typeof query>[0]['options'] = {
        cwd: this.projectPath,
        includePartialMessages: true,
        abortController: this.abortController,
        // Permission mode - use session's current mode
        permissionMode: this.permissionMode,
        // Model - use session's current model
        model: this.model,
        // Beta headers - enable 1M context if model has beta tag stored
        ...(this.shouldUseBeta() && { betas: [this.modelBetaTag!] as any }),
        // Pass through environment variables (for LiteLLM proxy support)
        // Ensure node's directory is in PATH (fixes ENOENT in nvm/GUI environments)
        env: (() => {
          const env = { ...process.env } as Record<string, string>;
          const nodeDir = path.dirname(process.execPath);
          if (env.PATH && !env.PATH.includes(nodeDir)) {
            env.PATH = `${nodeDir}:${env.PATH}`;
          }
          return env;
        })(),
        // Enable thinking tokens if requested
        ...(options?.maxThinkingTokens && { maxThinkingTokens: options.maxThinkingTokens }),
        // Register MCP servers
        mcpServers: {
          'ticket-manager': this.ticketMcpServer,
        },
        // Auto-approve ticket tool
        allowedTools: [
          'mcp__ticket-manager__ticket_write',
        ],
        // https://github.com/shanraisshan/claude-code-best-practice/blob/main/reports/claude-agent-sdk-vs-cli-system-prompts.md
        systemPrompt: {
          type: "preset",
          preset: "claude_code"
        },
        // Load CLAUDE.md from project and user settings
        settingSources: ['project', 'user'],
        // Custom tool approval handler - ALL tools go through this
        canUseTool: async (toolName, input) => {
          return this.handleToolApproval(toolName, input);
        },
      };

      log.debug('ClaudeSession', 'Query options:', JSON.stringify(queryOptions, (key, value) => {
        if (typeof value === 'function') return '[Function]';
        if (key === 'abortController') return '[AbortController]';
        if (key === 'env') return '[env vars]';
        if (key === 'mcpServers') return '[MCP Servers]';
        return value;
      }, 2));

      // Resume existing session if we have one
      if (this.claudeSessionId) {
        queryOptions.resume = this.claudeSessionId;
      }

      for await (const message of query({ prompt, options: queryOptions })) {
        this.lastActivity = new Date();

        // Extract parent_tool_use_id from SDK message (indicates this is inside a Task agent)
        const parentToolUseId = (message as any).parent_tool_use_id || undefined;

        // Debug: Log ALL message types to diagnose missing tool_complete
        log.debug('SDK', message.type, message.type === 'assistant' ? `(has ${(message as any).message?.content?.length || 0} content blocks)` : '', parentToolUseId ? `[agent: ${parentToolUseId}]` : '');

        // Debug: Log message structure to find usage data
        if (message.type === 'result' || message.type === 'assistant') {
          log.debug('Debug', 'Message type:', message.type);
          log.debug('Debug', 'Message keys:', Object.keys(message));
          if ((message as any).usage) {
            log.debug('Debug', 'Usage data:', (message as any).usage);
          }
        }

        // Handle different message types
        if (message.type === 'stream_event') {
          const event = message.event as any;

          // Text streaming
          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              this.callbacks.onStream(event.delta.text, parentToolUseId);
            }
            // Thinking tokens streaming (extended thinking)
            if (event.delta?.type === 'thinking_delta') {
              this.callbacks.onThinking(event.delta.thinking || '', parentToolUseId);
            }
            // Tool input streaming - buffer for later parsing
            if (event.delta?.type === 'input_json_delta') {
              const toolInfo = this.currentToolInputs.get(event.index?.toString() || '0');
              if (toolInfo) {
                toolInfo.buffer += event.delta.partial_json || '';
              }
            }
          }

          // Thinking block start (for extended thinking mode)
          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'thinking') {
              // Beginning of thinking block - could track state if needed
            }
          }

          // Tool call starting
          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              const toolUseId = event.content_block.id;
              const toolName = event.content_block.name;
              // Extract full input if available (most tool calls have full input here)
              const toolInput = event.content_block.input || {};

              // Track tool name by ID for later result matching
              this.toolNamesById.set(toolUseId, toolName);

              // Track this tool's input buffer with toolUseId (for rare cases of streaming input)
              this.currentToolInputs.set(event.index?.toString() || '0', {
                name: toolName,
                buffer: '',
                toolUseId: toolUseId,
                initialInput: toolInput
              });

              // Increment tool use counter for this turn
              this.currentTurnToolUses++;
              log.debug('Debug', 'Tool started:', toolName, 'with input:', toolInput, '| Turn tool count:', this.currentTurnToolUses, parentToolUseId ? `| Agent: ${parentToolUseId}` : '');

              // Send tool_input message immediately with full input (not tool_start with empty input)
              log.debug('Debug', 'Calling onToolInput with agentId:', parentToolUseId, '| tool:', toolName, '| toolUseId:', toolUseId);
              this.callbacks.onToolInput(toolName, toolUseId, toolInput, parentToolUseId);
            }
          }

          // Tool call complete - parse and emit specialized events
          if (event.type === 'content_block_stop') {
            const toolInfo = this.currentToolInputs.get(event.index?.toString() || '0');
            log.debug('Debug', 'content_block_stop:', {
              hasToolInfo: !!toolInfo,
              buffer: toolInfo?.buffer,
              bufferLength: toolInfo?.buffer?.length,
            });

            if (toolInfo && toolInfo.buffer) {
              try {
                const parsedInput = JSON.parse(toolInfo.buffer);
                log.debug('Debug', 'Parsed tool input successfully:', parsedInput);
                await this.handleToolInput(toolInfo.name, parsedInput, toolInfo.toolUseId, parentToolUseId);
              } catch (e) {
                log.debug('Debug', 'Failed to parse tool input:', e, 'Buffer:', toolInfo.buffer);
                // Partial JSON, ignore
              }
            }
            this.currentToolInputs.delete(event.index?.toString() || '0');
          }
        }

        // Tool progress - includes tool results
        if (message.type === 'tool_progress') {
          const toolProgress = message as any;
          log.debug('ClaudeSession', 'tool_progress message:', {
            tool_name: toolProgress.tool_name,
            status: toolProgress.status,
            hasToolUseId: !!toolProgress.tool_use_id,
            agentId: parentToolUseId,
          });
          // tool_progress contains tool execution status and results
          if (toolProgress.tool_name && toolProgress.status === 'complete') {
            log.debug('ClaudeSession', 'Calling handleToolResult for tool_progress');
            await this.handleToolResult(toolProgress, parentToolUseId);
          }
        }

        // Tool use summary - final summary of tool execution
        if (message.type === 'tool_use_summary') {
          const summary = message as any;
          log.debug('ClaudeSession', 'tool_use_summary message:', {
            tool_name: summary.tool_name,
            hasToolUseId: !!summary.tool_use_id,
            agentId: parentToolUseId,
          });
          log.debug('ClaudeSession', 'Calling handleToolResult for tool_use_summary');
          await this.handleToolResult(summary, parentToolUseId);
        }

        // User message (contains tool results from SDK)
        if (message.type === 'user') {
          // Tool results come as user messages with content blocks
          // CRITICAL FIX: Access message.message.content, not message.content!
          const userMsg = (message as any).message;
          log.debug('Debug', 'User message:', {
            hasContent: !!userMsg.content,
            contentLength: userMsg.content?.length,
            contentPreview: userMsg.content ? JSON.stringify(userMsg.content).substring(0, 300) : 'none'
          });
          if (userMsg.content) {
            for (const block of userMsg.content) {
              log.debug('Debug', 'User content block:', {
                type: block.type,
                tool_use_id: block.tool_use_id,
                hasContent: !!block.content,
                contentType: typeof block.content,
                allKeys: Object.keys(block),
                fullBlock: JSON.stringify(block).substring(0, 500)
              });
              // Handle tool_result blocks
              if (block.type === 'tool_result') {
                const toolUseId = block.tool_use_id;
                const toolName = this.toolNamesById.get(toolUseId);
                log.debug('Debug', 'Found tool_result block:', {
                  toolUseId,
                  toolName,
                  isError: block.is_error,
                  hasContent: !!block.content,
                  contentType: typeof block.content,
                  contentIsArray: Array.isArray(block.content),
                  contentPreview: typeof block.content === 'string' ? block.content.substring(0, 200) : JSON.stringify(block.content).substring(0, 200),
                });

                if (toolName) {
                  // Extract result content and ensure it's a string
                  let result: string;
                  if (typeof block.content === 'string') {
                    result = block.content;
                  } else if (Array.isArray(block.content)) {
                    // Content is an array of blocks, extract text
                    result = block.content
                      .map((c: any) => {
                        if (typeof c === 'string') return c;
                        if (c.type === 'text') return c.text;
                        return JSON.stringify(c);
                      })
                      .join('\n');
                  } else if (block.content === null || block.content === undefined) {
                    result = '';
                  } else {
                    // Fallback: stringify any other object
                    result = JSON.stringify(block.content, null, 2);
                  }

                  log.debug('ClaudeSession', 'Tool result extracted:', {
                    toolName,
                    toolUseId,
                    agentId: parentToolUseId,
                    success: !block.is_error,
                    resultType: typeof result,
                    resultLength: result.length,
                    resultPreview: result.substring(0, 100),
                  });

                  // Emit tool complete callback
                  this.callbacks.onToolComplete(
                    toolName,
                    toolUseId,
                    result,
                    !block.is_error,
                    parentToolUseId
                  );

                  // Track that this tool received a result
                  this.toolsWithResults.add(toolUseId);

                  // Clean up tracking
                  this.toolNamesById.delete(toolUseId);
                }
              }
            }
          }
        }

        // Assistant message (complete turn)
        if (message.type === 'assistant') {
          // Store session ID for continuity
          this.claudeSessionId = message.session_id;

          // Handle nested tool calls inside agents
          // When includePartialMessages: true, SDK sends complete assistant messages for nested calls
          const assistantMsg = (message as any).message;
          if (assistantMsg?.content && Array.isArray(assistantMsg.content)) {
            for (const block of assistantMsg.content) {
              if (block.type === 'tool_use') {
                const toolUseId = block.id;
                const toolName = block.name;
                const toolInput = block.input || {};

                log.debug('Debug', 'Assistant message tool_use block:', {
                  toolName,
                  toolUseId,
                  parentToolUseId,
                  hasParent: !!parentToolUseId,
                });

                // Track tool name by ID for later result matching
                if (!this.toolNamesById.has(toolUseId)) {
                  this.toolNamesById.set(toolUseId, toolName);
                  this.currentTurnToolUses++;
                  log.debug('Debug', 'Calling onToolInput for assistant message with agentId:', parentToolUseId);
                  this.callbacks.onToolInput(toolName, toolUseId, toolInput, parentToolUseId);
                }
              }
            }
          }
        }

        // User message (tool results)
        if (message.type === 'user') {
          const userMsg = (message as any).message;
          if (userMsg?.content && Array.isArray(userMsg.content)) {
            for (const block of userMsg.content) {
              if (block.type === 'tool_result') {
                const toolUseId = block.tool_use_id;
                const toolName = this.toolNamesById.get(toolUseId);

                if (toolName) {
                  log.debug('Debug', 'User message tool_result block:', {
                    toolName,
                    toolUseId,
                    parentToolUseId,
                    hasParent: !!parentToolUseId,
                  });

                  // Handle the tool result
                  await this.handleToolResult({
                    tool_name: toolName,
                    tool_use_id: toolUseId,
                    status: block.is_error ? 'error' : 'complete',
                    result: block.content,
                  }, parentToolUseId);
                }
              }
            }
          }
        }

        // Result message (query complete)
        if (message.type === 'result') {
          const resultMsg = message as any;

          // Extract detailed token usage if available
          let detailedUsage = undefined;
          if (resultMsg.usage) {
            this.currentTurnTokens = (resultMsg.usage.input_tokens || 0) +
                                     (resultMsg.usage.output_tokens || 0);

            // Build detailed usage object
            detailedUsage = {
              inputTokens: resultMsg.usage.input_tokens || 0,
              outputTokens: resultMsg.usage.output_tokens || 0,
              cacheCreationTokens: resultMsg.usage.cache_creation_input_tokens || 0,
              cacheReadTokens: resultMsg.usage.cache_read_input_tokens || 0,
            };

            log.debug('Debug', 'Captured tokens from result:', this.currentTurnTokens, detailedUsage);
          }

          // Clear tracking
          this.toolNamesById.clear();
          this.toolsWithResults.clear();

          log.debug('Debug', 'Turn complete:', {
            toolUses: this.currentTurnToolUses,
            tokens: this.currentTurnTokens,
            duration: resultMsg.duration_ms,
            cost: resultMsg.total_cost_usd
          });

          this.callbacks.onResult(
            resultMsg.result || '',
            resultMsg.total_cost_usd,
            resultMsg.duration_ms,
            this.currentTurnToolUses,
            this.currentTurnTokens,
            detailedUsage
          );
        }

        // System message (initialization)
        if (message.type === 'system' && (message as any).subtype === 'init') {
          this.claudeSessionId = message.session_id;

          // Capture slash commands from SDK
          const initMessage = message as any;
          if (initMessage.slash_commands && Array.isArray(initMessage.slash_commands)) {
            log.info('ClaudeSession', 'Discovered slash commands from SDK:', initMessage.slash_commands);
            // Parse slash commands (format: ["/command", "/another"] or detailed format)
            this.sdkSlashCommands = initMessage.slash_commands.map((cmd: any) => {
              if (typeof cmd === 'string') {
                // Simple string format: "/command"
                const name = cmd.startsWith('/') ? cmd.substring(1) : cmd;
                return { name, description: '', argumentHint: '' };
              } else if (typeof cmd === 'object' && cmd.name) {
                // Detailed format with metadata
                return {
                  name: cmd.name.startsWith('/') ? cmd.name.substring(1) : cmd.name,
                  description: cmd.description || '',
                  argumentHint: cmd.argumentHint || cmd.argument_hint || '',
                };
              }
              return null;
            }).filter(Boolean);
          }
        }
      }

      this.status = 'idle';
      this.callbacks.onStatusChange('complete');
    } catch (error) {
      this.status = 'idle';
      // Log full error details for debugging
      log.error('ClaudeSession', 'Error executing prompt:', error);
      if (error instanceof Error) {
        log.error('ClaudeSession', 'Error name:', error.name);
        log.error('ClaudeSession', 'Error message:', error.message);
        log.error('ClaudeSession', 'Error stack:', error.stack);
        // Check for additional error properties
        const anyError = error as any;
        if (anyError.code) log.error('ClaudeSession', 'Error code:', anyError.code);
        if (anyError.cause) log.error('ClaudeSession', 'Error cause:', anyError.cause);
        if (anyError.exitCode) log.error('ClaudeSession', 'Exit code:', anyError.exitCode);
        if (anyError.stderr) log.error('ClaudeSession', 'Stderr:', anyError.stderr);
        if (anyError.stdout) log.error('ClaudeSession', 'Stdout:', anyError.stdout);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.callbacks.onError(errorMessage);
      this.callbacks.onStatusChange('error');
    }
  }

  private async handleToolApproval(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string }> {
    // Auto-approve read operations - they're safe
    const autoApproveTools = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task'];
    if (autoApproveTools.includes(toolName)) {
      log.info('Approval', `Auto-approving ${toolName} tool`);
      return { behavior: 'allow', updatedInput: input };
    }

    // Handle AskUserQuestion - create pending question and wait for user response
    if (toolName === 'AskUserQuestion') {
      const requestId = uuidv4();
      this.status = 'waiting_question';

      const questions: Question[] = ((input.questions as any[]) || []).map((q: any, idx: number) => ({
        id: q.id || `q${idx}`,
        header: q.header || `Question ${idx + 1}`,
        question: q.question || '',
        multiSelect: q.multiSelect || false,
        options: (q.options || []).map((opt: any) => ({
          label: opt.label || '',
          description: opt.description || ''
        }))
      }));

      log.info('AskUserQuestion', 'Sending questions to mobile and waiting for response...');

      // Send question to mobile
      this.callbacks.onAskUserQuestion(requestId, questions);

      // Create promise that will be resolved when user submits answers
      const userAnswersPromise = new Promise<{ answers: Record<string, string | string[]>; action?: string; customInput?: string }>((resolve) => {
        this.pendingQuestions.set(requestId, {
          requestId,
          questions,
          resolve
        });
      });

      // Wait for user to answer
      const result = await userAnswersPromise;

      log.success('AskUserQuestion', 'User answered:', result.answers);

      // Update input with user's answers for SDK
      return {
        behavior: 'allow',
        updatedInput: {
          ...input,
          answers: result.answers
        }
      };
    }

    // Check if Write is being used on an existing file
    if (toolName === 'Write') {
      const writeInput = input as { file_path: string; content: string };
      const filePath = path.resolve(this.projectPath, writeInput.file_path);

      // Check if file exists
      if (fs.existsSync(filePath)) {
        log.warn('Write', 'File exists:', writeInput.file_path);
        return {
          behavior: 'deny',
          message: `File "${writeInput.file_path}" already exists. Use the Edit tool to modify it and show diffs, or delete the file first if you intend to completely rewrite it.`
        };
      }
    }

    // For write operations, request approval from mobile
    const requestId = uuidv4();
    this.status = 'waiting_approval';

    // Generate description for Bash commands
    let description: string | undefined;
    if (toolName === 'Bash') {
      const bashInput = input as { command: string; description?: string };
      description = bashInput.description || `Run: ${bashInput.command}`;
    }

    // Generate description for Write operations
    if (toolName === 'Write') {
      const writeInput = input as { file_path: string; content: string };
      description = `Create/overwrite: ${writeInput.file_path}`;
    }

    // Generate diff data for Edit/Write operations BEFORE sending approval request
    let diffData: { file: string; oldContent: string; newContent: string; additions: number; deletions: number } | undefined;

    if (toolName === 'Edit') {
      const editInput = input as { file_path: string; old_string: string; new_string: string };
      diffData = {
        file: editInput.file_path,
        oldContent: editInput.old_string,
        newContent: editInput.new_string,
        additions: editInput.new_string.split('\n').length,
        deletions: editInput.old_string.split('\n').length
      };
      log.debug('Debug', 'Generated diff for Edit:', {
        requestId,
        file: diffData.file,
        oldLength: diffData.oldContent?.length || 0,
        newLength: diffData.newContent?.length || 0,
        additions: diffData.additions,
        deletions: diffData.deletions
      });
    }

    if (toolName === 'Write') {
      const writeInput = input as { file_path: string; content: string };
      diffData = {
        file: writeInput.file_path,
        oldContent: '', // Empty oldContent for new files
        newContent: writeInput.content,
        additions: writeInput.content.split('\n').length, // All lines are additions
        deletions: 0 // No deletions for new files
      };
      log.debug('Debug', 'Generated diff for Write:', {
        requestId,
        file: diffData.file,
        contentLength: diffData.newContent?.length || 0,
        lines: diffData.additions
      });
    }

    // Send approval request to mobile with diff data included
    this.callbacks.onApprovalRequest(requestId, toolName, input, description, diffData);

    // Also send separate diff message for backward compatibility
    if (diffData) {
      this.callbacks.onDiff(
        requestId,
        diffData.file,
        diffData.oldContent,
        diffData.newContent,
        diffData.additions,
        diffData.deletions
      );
    }

    // Wait for approval from mobile
    log.info('Session', `Waiting for approval: ${requestId} for tool ${toolName}`);
    return new Promise((resolve) => {
      const pending: PendingApproval = {
        requestId,
        toolName,
        input,
        resolve: (result) => {
          log.info('Session', `Approval callback triggered: ${requestId}, behavior=${result.behavior}`);
          this.status = 'running';
          if (result.behavior === 'allow') {
            log.success('Session', `Allowing tool: ${toolName}`);
            resolve({ behavior: 'allow', updatedInput: input as Record<string, unknown> });
          } else {
            log.warn('Session', `Denying tool: ${toolName}, reason: ${result.message}`);
            resolve({ behavior: 'deny', message: result.message || 'Rejected by user' });
          }
        },
        timestamp: new Date(),
      };
      this.pendingApprovals.set(requestId, pending);
      log.info('Session', `Added pending approval. Total pending: ${this.pendingApprovals.size}`);

      // Timeout after 5 minutes - auto-deny
      setTimeout(() => {
        if (this.pendingApprovals.has(requestId)) {
          this.pendingApprovals.delete(requestId);
          this.status = 'running';
          resolve({ behavior: 'deny', message: 'Approval timeout - no response from mobile' });
        }
      }, 5 * 60 * 1000);
    });
  }

  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
    }

    // Deny all pending approvals
    for (const [, pending] of this.pendingApprovals) {
      pending.resolve({ behavior: 'deny', message: 'Session interrupted' });
    }
    this.pendingApprovals.clear();

    // Resolve all pending questions with empty answers
    for (const [, pending] of this.pendingQuestions) {
      pending.resolve({ answers: {}, action: 'cancel' });
    }
    this.pendingQuestions.clear();

    // Mark all active task agents as failed
    for (const [agentId, agent] of this.activeTaskAgents) {
      const duration = Date.now() - agent.startTime;
      this.callbacks.onTaskAgentComplete(
        agentId,
        agent.agentType,
        agent.description,
        agent.toolUses,
        agent.tokens,
        duration,
        false
      );
    }
    this.activeTaskAgents.clear();

    this.status = 'idle';
  }

  // Handle tool input when tool_use block completes streaming
  private async handleToolInput(toolName: string, input: any, toolUseId?: string, agentId?: string): Promise<void> {
    log.debug('Debug', 'handleToolInput called:', {
      toolName,
      toolUseId,
      agentId,
      input: JSON.stringify(input),
      inputKeys: Object.keys(input || {}),
    });

    // Emit tool input to mobile with full details
    if (toolUseId) {
      this.callbacks.onToolInput(toolName, toolUseId, input, agentId);
    }

    // Handle Task tool - spawn sub-agents (Explore, Plan, etc.)
    if (toolName === 'Task') {
      const agentId = toolUseId || uuidv4();
      const agentType = input.subagent_type || 'general-purpose';
      const description = input.description || input.prompt?.substring(0, 50) || 'Running task';

      const agent: ActiveTaskAgent = {
        agentId,
        agentType,
        description,
        startTime: Date.now(),
        toolUses: 0,  // Will be updated from task result
        tokens: 0,    // Will be updated from task result
        sessionTurnStart: this.turnMessageIndex,
      };

      log.debug('Debug', 'Task agent created:', {
        agentId,
        agentType,
        description,
        turn: this.turnMessageIndex
      });

      this.activeTaskAgents.set(agentId, agent);
      this.callbacks.onTaskAgentStart(agentId, agentType, description);
    }

    // Note: AskUserQuestion is now handled in handleToolApproval, not here

    // Handle TodoWrite - emit task list immediately
    if (toolName === 'TodoWrite') {
      const todos = input.todos || [];
      log.info('TodoWrite', 'Received tasks:', todos.length);

      // Convert TodoWrite format to our Task format
      const tasks = todos.map((todo: any) => ({
        id: uuidv4(),
        subject: todo.content || 'Untitled task',
        description: todo.description || '',
        status: todo.status || 'pending',
        activeForm: todo.activeForm,
        timestamp: new Date().toISOString(),
      }));

      // Emit task list update
      this.callbacks.onTaskList(tasks);
      log.info('TodoWrite', 'Emitted task list with', tasks.length, 'tasks');
    }
  }

  // Handle tool results after execution
  private async handleToolResult(toolResult: any, agentId?: string): Promise<void> {
    const toolName = toolResult.tool_name || toolResult.name;
    const toolUseId = toolResult.tool_use_id || toolResult.id;
    const rawResult = toolResult.result || toolResult.content;

    log.debug('ClaudeSession', 'handleToolResult CALLED:', {
      toolName,
      toolUseId,
      agentId,
      hasResult: !!rawResult,
      resultType: typeof rawResult,
      isError: !!toolResult.is_error,
    });

    // Convert result to string
    let result: string;
    if (typeof rawResult === 'string') {
      result = rawResult;
    } else if (rawResult === null || rawResult === undefined) {
      result = '';
    } else {
      result = JSON.stringify(rawResult, null, 2);
    }

    // Handle Task tool completion
    if (toolName === 'Task') {
      const agent = this.activeTaskAgents.get(toolUseId);
      if (agent) {
        const duration = Date.now() - agent.startTime;

        // Try to extract stats from toolResult metadata
        let toolUses = agent.toolUses;
        let tokens = agent.tokens;

        // Check if toolResult contains usage metadata
        if (toolResult.usage) {
          tokens = (toolResult.usage.input_tokens || 0) +
                   (toolResult.usage.output_tokens || 0);
          log.debug('Debug', 'Task tool usage from metadata:', { toolUses, tokens });
        }

        // Try parsing from result string as fallback
        if (typeof result === 'string' && tokens === 0) {
          const statsMatch = result.match(/(\d+)\s*tool\s*uses?.*?(\d+(?:\.\d+)?)\s*k?\s*tokens?/i);
          if (statsMatch) {
            toolUses = parseInt(statsMatch[1]) || toolUses;
            const tokenVal = parseFloat(statsMatch[2]);
            tokens = statsMatch[2].toLowerCase().includes('k') || tokenVal < 1000
              ? Math.round(tokenVal * 1000)
              : Math.round(tokenVal);
            log.debug('Debug', 'Task stats from regex:', { toolUses, tokens });
          }
        }

        log.debug('Debug', 'Task agent complete:', {
          agentId: toolUseId,
          agentType: agent.agentType,
          toolUses,
          tokens,
          duration
        });

        this.callbacks.onTaskAgentComplete(
          toolUseId,
          agent.agentType,
          agent.description,
          toolUses,
          tokens,
          duration,
          !toolResult.is_error
        );
        this.activeTaskAgents.delete(toolUseId);
      }
    }

    // Handle Read tool completion
    if (toolName === 'Read') {
      const filePath = toolResult.input?.file_path || '';
      const fileName = path.basename(filePath);

      // Count lines from result (result is now always a string)
      const linesRead = result ? result.split('\n').length : 0;

      this.callbacks.onFileReadResult(toolUseId, filePath, fileName, linesRead);
    }

    // Handle Write tool completion
    if (toolName === 'Write') {
      const filePath = toolResult.input?.file_path || '';
      const fileName = path.basename(filePath);
      const content = toolResult.input?.content || '';
      const lines = content.split('\n');
      const totalLines = lines.length;
      const previewLines = lines.slice(0, 10).join('\n');

      // Determine if it's a plan file
      const isPlanFile = filePath.includes('.claude/plans') || filePath.endsWith('.md');
      const label = isPlanFile ? 'Updated plan' : undefined;

      this.callbacks.onFileWriteResult(
        toolUseId,
        filePath,
        fileName,
        totalLines,
        previewLines,
        totalLines,
        false, // TODO: detect if update vs create
        label
      );

      // Also emit content block for markdown preview
      if (isPlanFile && content) {
        const blockId = uuidv4();
        const previewLineCount = Math.min(10, totalLines);
        this.callbacks.onContentBlock(
          blockId,
          'markdown',
          content,
          previewLineCount,
          totalLines,
          fileName,
          undefined,
          filePath
        );
      }
    }

    // Handle Edit tool completion
    if (toolName === 'Edit') {
      const filePath = toolResult.input?.file_path || '';
      const fileName = path.basename(filePath);
      const newString = toolResult.input?.new_string || '';
      const lines = newString.split('\n').length;

      this.callbacks.onFileWriteResult(
        toolUseId,
        filePath,
        fileName,
        lines,
        newString.substring(0, 500),
        lines,
        true,
        undefined
      );
    }

    // Handle TodoWrite tool completion
    if (toolName === 'TodoWrite') {
      const todos = toolResult.input?.todos || [];
      log.info('TodoWrite', 'Tool result - received tasks:', todos.length);

      // Convert TodoWrite format to our Task format
      const tasks = todos.map((todo: any) => ({
        id: uuidv4(),
        subject: todo.content || 'Untitled task',
        description: todo.description || '',
        status: todo.status || 'pending',
        activeForm: todo.activeForm,
        timestamp: new Date().toISOString(),
      }));

      // Emit task list update
      this.callbacks.onTaskList(tasks);
      log.info('TodoWrite', 'Emitted task list from tool result with', tasks.length, 'tasks');
    }

    // Handle TaskCreate tool completion
    if (toolName === 'TaskCreate') {
      const taskData = toolResult.content || toolResult;
      const status = (taskData.status as 'pending' | 'in_progress' | 'completed') || 'pending';
      const task = {
        id: taskData.id || toolUseId,
        subject: taskData.subject || 'New task',
        description: taskData.description || '',
        status,
        activeForm: taskData.activeForm,
        timestamp: new Date().toISOString(),
      };
      this.callbacks.onTaskCreated(task);
      log.info('TaskCreate', 'Created task:', task.subject);
    }

    // Handle TaskUpdate tool completion
    if (toolName === 'TaskUpdate') {
      const updateData = toolResult.content || toolResult;
      this.callbacks.onTaskUpdated(
        updateData.taskId,
        updateData.status as 'pending' | 'in_progress' | 'completed' | undefined,
        updateData.subject,
        updateData.description,
        updateData.activeForm
      );
      log.info('TaskUpdate', 'Updated task:', updateData.taskId, updateData.status);
    }

    // Handle TaskList tool completion
    if (toolName === 'TaskList') {
      const tasks = toolResult.tasks || [];
      this.callbacks.onTaskList(tasks);
      log.info('TaskList', 'Listed tasks:', tasks.length);
    }

    // Emit tool complete callback
    log.debug('ClaudeSession', 'CALLING onToolComplete callback:', {
      toolName,
      toolUseId,
      agentId,
      success: !toolResult.is_error,
      resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length,
    });
    this.callbacks.onToolComplete(
      toolName,
      toolUseId,
      result,
      !toolResult.is_error,
      agentId
    );
    log.debug('ClaudeSession', 'onToolComplete callback RETURNED');
  }
}
