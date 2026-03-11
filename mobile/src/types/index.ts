// Mobile App Type Definitions
// These are UI-specific types used by the mobile app

// --- Tool Types ---
export type ToolName =
  | 'Bash' | 'Read' | 'Edit' | 'Write' | 'Glob' | 'Grep'
  | 'WebFetch' | 'WebSearch' | 'NotebookEdit' | 'Task'
  | 'TodoWrite' | 'Skill' | 'MCP' | 'AskUserQuestion';

export interface ToolCall {
  id: string;
  toolName: ToolName | string;
  input: Record<string, unknown>;
  output?: string;
  isStreaming?: boolean;
  isCollapsed?: boolean;
  elapsedMs?: number;
  status: 'running' | 'done' | 'error';
  agentId?: string; // If present, this tool belongs to a Task agent
}

// --- Content Block Types (Anthropic API style) ---
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface AskUserQuestionBlock {
  type: 'ask_user_question';
  id: string;
  questions: AskQuestion[];
  resolved?: boolean;
}

export interface AskQuestion {
  question: string;
  header: string;
  options: AskQuestionOption[];
  multiSelect: boolean;
}

export interface AskQuestionOption {
  label: string;
  description: string;
}

export interface ApprovalRequestBlock {
  type: 'approval_request';
  id: string;
  tool: string;
  description?: string;
  input: Record<string, unknown>;
  diff?: {
    file: string;
    oldContent: string;
    newContent: string;
    additions: number;
    deletions: number;
  };
  resolved?: boolean;
  agentId?: string; // If present, this approval belongs to a Task agent
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | AskUserQuestionBlock | ApprovalRequestBlock;

// --- Message Types ---
export interface UserMessage {
  id: string;
  role: 'user';
  content: string;
  timestamp: number;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  content: ContentBlock[];
  timestamp: number;
  isStreaming?: boolean;
  model?: string;
}

export interface SystemMessage {
  id: string;
  role: 'system';
  subtype: 'init' | 'status' | 'compact_boundary' | 'task_notification' | 'hook_started' | 'hook_response' | 'command_result' | 'error';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  // Command-specific metadata
  commandName?: string;
  commandSuccess?: boolean;
  commandCategory?: string;
}

export interface TerminalMessage {
  id: string;
  role: 'terminal';
  command: string;
  commandId: string;
  output: string;           // accumulated output (may have ANSI codes)
  exitCode: number | null;
  isRunning: boolean;
  cwd: string;
  timestamp: number;
  durationMs?: number;
}

export type InputMode = 'claude' | 'terminal';

export type Message = UserMessage | AssistantMessage | SystemMessage | TerminalMessage;
