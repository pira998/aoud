// Re-export shared types
export * from '../../shared/types.js';

// Server-specific types

export interface PendingApproval {
  requestId: string;
  toolName: string;
  input: unknown;
  resolve: (result: ApprovalResult) => void;
  timestamp: Date;
}

export interface ApprovalResult {
  behavior: 'allow' | 'deny';
  updatedInput?: unknown;
  message?: string;
}

export interface ActiveSession {
  id: string;
  projectPath: string;
  status: 'idle' | 'running' | 'waiting_approval';
  abortController?: AbortController;
  pendingApprovals: Map<string, PendingApproval>;
  messageCount: number;
  lastActivity: Date;
}

export interface ServerConfig {
  port: number;
  wsPort: number;
  authToken?: string;
  allowedOrigins: string[];
}
