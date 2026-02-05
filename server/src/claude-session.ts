import { query } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import type { PendingApproval, ApprovalResult } from './types.js';
import type { PermissionMode, Question, QuestionAction } from '../../shared/types.js';

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
  onStream: (text: string) => void;
  onThinking: (text: string) => void;
  onToolStart: (tool: string, input: unknown, toolUseId: string) => void;
  onToolInput: (tool: string, toolUseId: string, input: unknown) => void;
  onToolComplete: (tool: string, toolUseId: string, result: unknown, success: boolean) => void;
  onApprovalRequest: (requestId: string, tool: string, input: unknown, description?: string) => void;
  onDiff: (requestId: string, file: string, oldContent: string, newContent: string, additions: number, deletions: number) => void;
  onStatusChange: (status: 'started' | 'active' | 'complete' | 'error') => void;
  onResult: (result: string, totalCost?: number, duration?: number, toolUses?: number, tokens?: number) => void;
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

  private callbacks: SessionCallbacks;
  private abortController?: AbortController;
  private claudeSessionId?: string;
  private currentToolInputs: Map<string, { name: string; buffer: string; toolUseId: string }> = new Map();
  // Track stats for current turn
  private currentTurnToolUses: number = 0;
  private currentTurnTokens: number = 0;
  private turnMessageIndex: number = 0;

  constructor(id: string, projectPath: string, callbacks: SessionCallbacks) {
    this.id = id;
    this.projectPath = projectPath;
    this.callbacks = callbacks;
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

  getClaudeSessionId(): string | undefined {
    return this.claudeSessionId;
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
    console.log('[DEBUG] New turn started:', this.turnMessageIndex, '| Counters reset');

    // Update permission mode if provided
    if (options?.permissionMode) {
      this.permissionMode = options.permissionMode;
    }

    this.abortController = new AbortController();

    try {
      console.log('[ClaudeSession] Starting query with:');
      console.log('[ClaudeSession]   projectPath:', this.projectPath);
      console.log('[ClaudeSession]   permissionMode:', this.permissionMode);
      console.log('[ClaudeSession]   prompt:', prompt.substring(0, 100) + '...');
      console.log('[ClaudeSession]   ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || '(not set)');
      console.log('[ClaudeSession]   ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL || '(not set)');

      const queryOptions: Parameters<typeof query>[0]['options'] = {
        cwd: this.projectPath,
        includePartialMessages: true,
        abortController: this.abortController,
        // Permission mode - use session's current mode
        permissionMode: this.permissionMode,
        // Pass through environment variables (for LiteLLM proxy support)
        env: process.env as Record<string, string>,
        // Enable thinking tokens if requested
        ...(options?.maxThinkingTokens && { maxThinkingTokens: options.maxThinkingTokens }),
        // Custom tool approval handler - ALL tools go through this
        canUseTool: async (toolName, input) => {
          return this.handleToolApproval(toolName, input);
        },
      };

      console.log('[ClaudeSession] Query options:', JSON.stringify(queryOptions, (key, value) => {
        if (typeof value === 'function') return '[Function]';
        if (key === 'abortController') return '[AbortController]';
        if (key === 'env') return '[env vars]';
        return value;
      }, 2));

      // Resume existing session if we have one
      if (this.claudeSessionId) {
        queryOptions.resume = this.claudeSessionId;
      }

      for await (const message of query({ prompt, options: queryOptions })) {
        this.lastActivity = new Date();

        // Debug: Log message structure to find usage data
        if (message.type === 'result' || message.type === 'assistant') {
          console.log('[DEBUG] Message type:', message.type);
          console.log('[DEBUG] Message keys:', Object.keys(message));
          if ((message as any).usage) {
            console.log('[DEBUG] Usage data:', (message as any).usage);
          }
        }

        // Handle different message types
        if (message.type === 'stream_event') {
          const event = message.event as any;

          // Text streaming
          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              this.callbacks.onStream(event.delta.text);
            }
            // Thinking tokens streaming (extended thinking)
            if (event.delta?.type === 'thinking_delta') {
              this.callbacks.onThinking(event.delta.thinking || '');
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

              // Track this tool's input buffer with toolUseId
              this.currentToolInputs.set(event.index?.toString() || '0', {
                name: toolName,
                buffer: '',
                toolUseId: toolUseId
              });

              // Increment tool use counter for this turn
              this.currentTurnToolUses++;
              console.log('[DEBUG] Tool started:', toolName, '| Turn tool count:', this.currentTurnToolUses);

              this.callbacks.onToolStart(toolName, {}, toolUseId);
            }
          }

          // Tool call complete - parse and emit specialized events
          if (event.type === 'content_block_stop') {
            const toolInfo = this.currentToolInputs.get(event.index?.toString() || '0');
            if (toolInfo && toolInfo.buffer) {
              try {
                const parsedInput = JSON.parse(toolInfo.buffer);
                await this.handleToolInput(toolInfo.name, parsedInput, toolInfo.toolUseId);
              } catch (e) {
                // Partial JSON, ignore
              }
            }
            this.currentToolInputs.delete(event.index?.toString() || '0');
          }
        }

        // Tool progress - includes tool results
        if (message.type === 'tool_progress') {
          const toolProgress = message as any;
          // tool_progress contains tool execution status and results
          if (toolProgress.tool_name && toolProgress.status === 'complete') {
            await this.handleToolResult(toolProgress);
          }
        }

        // Tool use summary - final summary of tool execution
        if (message.type === 'tool_use_summary') {
          const summary = message as any;
          await this.handleToolResult(summary);
        }

        // Assistant message (complete turn)
        if (message.type === 'assistant') {
          // Store session ID for continuity
          this.claudeSessionId = message.session_id;
        }

        // Result message (query complete)
        if (message.type === 'result') {
          const resultMsg = message as any;

          // Extract token usage if available
          if (resultMsg.usage) {
            this.currentTurnTokens = (resultMsg.usage.input_tokens || 0) +
                                     (resultMsg.usage.output_tokens || 0);
            console.log('[DEBUG] Captured tokens from result:', this.currentTurnTokens);
          }

          console.log('[DEBUG] Turn complete:', {
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
            this.currentTurnTokens
          );
        }

        // System message (initialization)
        if (message.type === 'system' && (message as any).subtype === 'init') {
          this.claudeSessionId = message.session_id;
        }
      }

      this.status = 'idle';
      this.callbacks.onStatusChange('complete');
    } catch (error) {
      this.status = 'idle';
      // Log full error details for debugging
      console.error('[ClaudeSession] Error executing prompt:', error);
      if (error instanceof Error) {
        console.error('[ClaudeSession] Error name:', error.name);
        console.error('[ClaudeSession] Error message:', error.message);
        console.error('[ClaudeSession] Error stack:', error.stack);
        // Check for additional error properties
        const anyError = error as any;
        if (anyError.code) console.error('[ClaudeSession] Error code:', anyError.code);
        if (anyError.cause) console.error('[ClaudeSession] Error cause:', anyError.cause);
        if (anyError.exitCode) console.error('[ClaudeSession] Exit code:', anyError.exitCode);
        if (anyError.stderr) console.error('[ClaudeSession] Stderr:', anyError.stderr);
        if (anyError.stdout) console.error('[ClaudeSession] Stdout:', anyError.stdout);
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
      return { behavior: 'allow', updatedInput: input };
    }

    // Check if Write is being used on an existing file
    if (toolName === 'Write') {
      const writeInput = input as { file_path: string; content: string };
      const filePath = path.resolve(this.projectPath, writeInput.file_path);

      // Check if file exists
      if (fs.existsSync(filePath)) {
        console.log('[Write blocked] File exists:', writeInput.file_path);
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

    // Send approval request to mobile FIRST
    this.callbacks.onApprovalRequest(requestId, toolName, input, description);

    // Generate diff for Edit operations AFTER approval request is sent
    // This ensures the approval exists before the diff arrives
    if (toolName === 'Edit') {
      const editInput = input as { file_path: string; old_string: string; new_string: string };
      console.log('[DEBUG] Generating diff for Edit:', {
        requestId,
        file: editInput.file_path,
        oldLength: editInput.old_string?.length || 0,
        newLength: editInput.new_string?.length || 0,
        additions: editInput.new_string.split('\n').length,
        deletions: editInput.old_string.split('\n').length
      });
      this.callbacks.onDiff(
        requestId,
        editInput.file_path,
        editInput.old_string,
        editInput.new_string,
        editInput.new_string.split('\n').length,
        editInput.old_string.split('\n').length
      );
    }

    // Generate diff for Write operations (new files) - show content as all additions
    if (toolName === 'Write') {
      const writeInput = input as { file_path: string; content: string };
      console.log('[DEBUG] Generating diff for Write:', {
        requestId,
        file: writeInput.file_path,
        contentLength: writeInput.content?.length || 0,
        lines: writeInput.content.split('\n').length
      });
      this.callbacks.onDiff(
        requestId,
        writeInput.file_path,
        '', // Empty oldContent for new files
        writeInput.content,
        writeInput.content.split('\n').length, // All lines are additions
        0 // No deletions for new files
      );
    }

    // Wait for approval from mobile
    console.log(`[Session] Waiting for approval: ${requestId} for tool ${toolName}`);
    return new Promise((resolve) => {
      const pending: PendingApproval = {
        requestId,
        toolName,
        input,
        resolve: (result) => {
          console.log(`[Session] Approval callback triggered: ${requestId}, behavior=${result.behavior}`);
          this.status = 'running';
          if (result.behavior === 'allow') {
            console.log(`[Session] Allowing tool: ${toolName}`);
            resolve({ behavior: 'allow', updatedInput: input as Record<string, unknown> });
          } else {
            console.log(`[Session] Denying tool: ${toolName}, reason: ${result.message}`);
            resolve({ behavior: 'deny', message: result.message || 'Rejected by user' });
          }
        },
        timestamp: new Date(),
      };
      this.pendingApprovals.set(requestId, pending);
      console.log(`[Session] Added pending approval. Total pending: ${this.pendingApprovals.size}`);

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
  private async handleToolInput(toolName: string, input: any, toolUseId?: string): Promise<void> {
    // Emit tool input to mobile with full details
    if (toolUseId) {
      this.callbacks.onToolInput(toolName, toolUseId, input);
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

      console.log('[DEBUG] Task agent created:', {
        agentId,
        agentType,
        description,
        turn: this.turnMessageIndex
      });

      this.activeTaskAgents.set(agentId, agent);
      this.callbacks.onTaskAgentStart(agentId, agentType, description);
    }

    // Handle AskUserQuestion - emit question and wait for response
    if (toolName === 'AskUserQuestion') {
      const requestId = toolUseId || uuidv4();

      // Parse questions from the input
      const questions: Question[] = (input.questions || []).map((q: any, idx: number) => ({
        id: q.id || `q${idx}`,
        header: q.header || `Question ${idx + 1}`,
        question: q.question || '',
        multiSelect: q.multiSelect || false,
        options: (q.options || []).map((opt: any) => ({
          label: opt.label || '',
          description: opt.description || '',
          isRecommended: opt.label?.includes('(Recommended)') || false,
        })),
      }));

      // Standard actions for question UI
      const actions: QuestionAction[] = [
        { id: 'chat', label: 'Chat about this' },
        { id: 'skip', label: 'Skip interview and plan immediately' },
      ];

      this.status = 'waiting_question';
      this.callbacks.onAskUserQuestion(requestId, questions, undefined, actions);

      // Store pending question - will be resolved when mobile responds
      // Note: The actual waiting happens in canUseTool handler
    }

    // Handle TodoWrite - emit task list immediately
    if (toolName === 'TodoWrite') {
      const todos = input.todos || [];
      console.log('[TodoWrite] Received tasks:', todos.length);

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
      console.log('[TodoWrite] Emitted task list with', tasks.length, 'tasks');
    }
  }

  // Handle tool results after execution
  private async handleToolResult(toolResult: any): Promise<void> {
    const toolName = toolResult.tool_name || toolResult.name;
    const toolUseId = toolResult.tool_use_id || toolResult.id;
    const result = toolResult.result || toolResult.content;

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
          console.log('[DEBUG] Task tool usage from metadata:', { toolUses, tokens });
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
            console.log('[DEBUG] Task stats from regex:', { toolUses, tokens });
          }
        }

        console.log('[DEBUG] Task agent complete:', {
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
      let linesRead = 0;

      // Try to count lines from result
      if (typeof result === 'string') {
        linesRead = result.split('\n').length;
      } else if (result?.content) {
        linesRead = result.content.split('\n').length;
      }

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
      console.log('[TodoWrite] Tool result - received tasks:', todos.length);

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
      console.log('[TodoWrite] Emitted task list from tool result with', tasks.length, 'tasks');
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
      console.log('[TaskCreate] Created task:', task.subject);
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
      console.log('[TaskUpdate] Updated task:', updateData.taskId, updateData.status);
    }

    // Handle TaskList tool completion
    if (toolName === 'TaskList') {
      const tasks = toolResult.tasks || [];
      this.callbacks.onTaskList(tasks);
      console.log('[TaskList] Listed tasks:', tasks.length);
    }

    // Emit tool complete callback
    this.callbacks.onToolComplete(
      toolName,
      toolUseId,
      result,
      !toolResult.is_error
    );
  }
}
