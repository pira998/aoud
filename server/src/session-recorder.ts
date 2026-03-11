import type { ClaudeSession } from './claude-session.js';
import type { ProjectInfo } from '../../shared/types.js';
import type {
  SavedSession,
  SavedMessage,
  ToolExecution,
  FileChange,
  Approval,
  Question,
  TaskInfo,
  TaskAgent,
  TimelineEvent,
  SessionStats,
} from './session-storage.js';
import { sessionStorage } from './session-storage.js';
import { log } from './logger.js';

/**
 * SessionRecorder wraps a ClaudeSession and captures all events
 * to build a complete session record for persistence
 */
export class SessionRecorder {
  private session: ClaudeSession;
  private messages: SavedMessage[] = [];
  private toolExecutions: Map<string, ToolExecution> = new Map();
  private fileChanges: FileChange[] = [];
  private approvals: Map<string, Approval> = new Map();
  private questions: Map<string, Question> = new Map();
  private tasks: Map<string, TaskInfo> = new Map();
  private taskAgents: Map<string, TaskAgent> = new Map();
  private timeline: TimelineEvent[] = [];
  private stats: SessionStats = {
    totalPrompts: 0,
    totalMessages: 0,
    totalToolUses: 0,
    totalTokens: 0,
    totalCost: 0,
    duration: 0,
  };
  private startTime: Date;
  private autoSaveInterval?: NodeJS.Timeout;
  private currentThinking: string = '';

  constructor(session: ClaudeSession) {
    this.session = session;
    this.startTime = new Date();
  }

  /**
   * Record a user message
   */
  recordUserMessage(content: string): void {
    const message: SavedMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    this.messages.push(message);
    this.stats.totalMessages++;
    this.stats.totalPrompts++;

    this.timeline.push({
      timestamp: message.timestamp,
      type: 'message',
      data: { role: 'user', content },
    });
  }

  /**
   * Record an assistant message
   */
  recordAssistantMessage(content: string, metadata?: {
    thinking?: string;
    toolUses?: number;
    tokens?: number;
    cost?: number;
  }): void {
    const message: SavedMessage = {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.messages.push(message);
    this.stats.totalMessages++;

    if (metadata?.tokens) {
      this.stats.totalTokens += metadata.tokens;
    }
    if (metadata?.cost) {
      this.stats.totalCost += metadata.cost;
    }
    if (metadata?.toolUses) {
      this.stats.totalToolUses += metadata.toolUses;
    }

    this.timeline.push({
      timestamp: message.timestamp,
      type: 'message',
      data: { role: 'assistant', content, metadata },
    });
  }

  /**
   * Record thinking tokens
   */
  recordThinking(text: string): void {
    this.currentThinking += text;
  }

  /**
   * Get and clear accumulated thinking
   */
  getAndClearThinking(): string {
    const thinking = this.currentThinking;
    this.currentThinking = '';
    return thinking;
  }

  /**
   * Record a tool execution start
   */
  recordToolStart(tool: string, toolUseId: string, input: any): void {
    const execution: ToolExecution = {
      id: `${tool}-${Date.now()}`,
      toolUseId,
      tool,
      input,
      success: false,
      startTime: new Date().toISOString(),
    };

    this.toolExecutions.set(toolUseId, execution);

    this.timeline.push({
      timestamp: execution.startTime,
      type: 'tool',
      data: { phase: 'start', tool, toolUseId, input },
    });
  }

  /**
   * Record a tool execution completion
   */
  recordToolComplete(toolUseId: string, result: any, success: boolean): void {
    const execution = this.toolExecutions.get(toolUseId);
    if (execution) {
      execution.result = result;
      execution.success = success;
      execution.endTime = new Date().toISOString();
      execution.duration = new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime();

      this.timeline.push({
        timestamp: execution.endTime,
        type: 'tool',
        data: { phase: 'complete', tool: execution.tool, toolUseId, result, success },
      });
    }
  }

  /**
   * Record a file change (diff)
   */
  recordFileChange(change: FileChange): void {
    this.fileChanges.push(change);

    this.timeline.push({
      timestamp: change.timestamp,
      type: 'diff',
      data: change,
    });
  }

  /**
   * Record an approval request
   */
  recordApprovalRequest(requestId: string, tool: string, input: any, description?: string): void {
    const approval: Approval = {
      requestId,
      tool,
      input,
      description,
      timestamp: new Date().toISOString(),
    };

    this.approvals.set(requestId, approval);

    this.timeline.push({
      timestamp: approval.timestamp,
      type: 'approval',
      data: { phase: 'request', requestId, tool, input, description },
    });
  }

  /**
   * Record an approval response
   */
  recordApprovalResponse(requestId: string, decision: 'allow' | 'deny', reason?: string): void {
    const approval = this.approvals.get(requestId);
    if (approval) {
      approval.decision = decision;
      approval.reason = reason;
      approval.resolvedAt = new Date().toISOString();

      this.timeline.push({
        timestamp: approval.resolvedAt,
        type: 'approval',
        data: { phase: 'response', requestId, decision, reason },
      });
    }
  }

  /**
   * Record a question asked to the user
   */
  recordQuestion(requestId: string, questions: any[]): void {
    const question: Question = {
      requestId,
      questions,
      timestamp: new Date().toISOString(),
    };

    this.questions.set(requestId, question);

    this.timeline.push({
      timestamp: question.timestamp,
      type: 'question',
      data: { phase: 'ask', requestId, questions },
    });
  }

  /**
   * Record a question response
   */
  recordQuestionResponse(requestId: string, answers: Record<string, string | string[]>, action?: string): void {
    const question = this.questions.get(requestId);
    if (question) {
      question.answers = answers;
      question.action = action;
      question.resolvedAt = new Date().toISOString();

      this.timeline.push({
        timestamp: question.resolvedAt,
        type: 'question',
        data: { phase: 'answer', requestId, answers, action },
      });
    }
  }

  /**
   * Record a task created
   */
  recordTask(task: TaskInfo): void {
    this.tasks.set(task.id, task);

    this.timeline.push({
      timestamp: task.timestamp,
      type: 'task',
      data: { phase: 'created', ...task },
    });
  }

  /**
   * Update a task status
   */
  updateTask(taskId: string, updates: Partial<TaskInfo>): void {
    const task = this.tasks.get(taskId);
    if (task) {
      Object.assign(task, updates);

      if (updates.status === 'completed') {
        task.completedAt = new Date().toISOString();
      }

      this.timeline.push({
        timestamp: new Date().toISOString(),
        type: 'task',
        data: { phase: 'updated', taskId, ...updates },
      });
    }
  }

  /**
   * Record a task agent start
   */
  recordTaskAgentStart(agentId: string, agentType: string, description: string): void {
    const agent: TaskAgent = {
      agentId,
      agentType,
      description,
      startTime: new Date().toISOString(),
      toolUses: 0,
      tokens: 0,
    };

    this.taskAgents.set(agentId, agent);

    this.timeline.push({
      timestamp: agent.startTime,
      type: 'agent',
      data: { phase: 'start', agentId, agentType, description },
    });
  }

  /**
   * Update task agent progress
   */
  updateTaskAgentProgress(agentId: string, toolUses: number, tokens: number): void {
    const agent = this.taskAgents.get(agentId);
    if (agent) {
      agent.toolUses = toolUses;
      agent.tokens = tokens;
    }
  }

  /**
   * Record a task agent completion
   */
  recordTaskAgentComplete(agentId: string, toolUses: number, tokens: number, durationMs: number, success: boolean): void {
    const agent = this.taskAgents.get(agentId);
    if (agent) {
      agent.endTime = new Date().toISOString();
      agent.toolUses = toolUses;
      agent.tokens = tokens;
      agent.durationMs = durationMs;
      agent.success = success;

      this.timeline.push({
        timestamp: agent.endTime,
        type: 'agent',
        data: { phase: 'complete', agentId, toolUses, tokens, durationMs, success },
      });
    }
  }

  /**
   * Build a complete SavedSession object
   */
  buildSavedSession(projectInfo: ProjectInfo, sessionId: string, status: 'active' | 'completed' | 'interrupted' | 'error', permissionMode: any): SavedSession {
    const now = new Date().toISOString();
    const duration = Date.now() - this.startTime.getTime();
    this.stats.duration = duration;

    const claudeSessionId = this.session.getClaudeSessionId();

    return {
      metadata: {
        sessionId,
        projectId: projectInfo.id,
        projectPath: projectInfo.path,
        projectName: projectInfo.name,
        createdAt: this.startTime.toISOString(),
        lastModified: now,
        status,
        permissionMode,
        claudeSessionId,
        stats: this.stats,
      },
      timeline: this.timeline,
      messages: this.messages,
      toolExecutions: Array.from(this.toolExecutions.values()),
      fileChanges: this.fileChanges,
      tasks: Array.from(this.tasks.values()),
      taskAgents: Array.from(this.taskAgents.values()),
      approvals: Array.from(this.approvals.values()),
      questions: Array.from(this.questions.values()),
    };
  }

  /**
   * Enable auto-save at regular intervals
   */
  enableAutoSave(projectInfo: ProjectInfo, sessionId: string, permissionMode: any, intervalMs: number = 30000): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(async () => {
      try {
        const savedSession = this.buildSavedSession(projectInfo, sessionId, 'active', permissionMode);
        await sessionStorage.saveSession(sessionId, savedSession);
        log.debug('SessionRecorder', `Auto-saved session ${sessionId}`);
      } catch (error) {
        log.error('SessionRecorder', 'Auto-save failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Disable auto-save
   */
  disableAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = undefined;
    }
  }

  /**
   * Save the current session immediately
   */
  async save(projectInfo: ProjectInfo, sessionId: string, permissionMode: any, status: 'active' | 'completed' | 'interrupted' | 'error' = 'active'): Promise<void> {
    const savedSession = this.buildSavedSession(projectInfo, sessionId, status, permissionMode);
    await sessionStorage.saveSession(sessionId, savedSession);
  }

  /**
   * Get current statistics
   */
  getStats(): SessionStats {
    return { ...this.stats };
  }
}
