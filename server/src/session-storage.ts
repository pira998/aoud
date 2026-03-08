import fs from 'fs';
import path from 'path';
import os from 'os';
import type { PermissionMode } from '../../shared/types.js';
import { log } from './logger.js';

// ============================================
// Session Storage Types
// ============================================

export interface SavedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    thinking?: string;
    toolUses?: number;
    tokens?: number;
    cost?: number;
  };
}

export interface ToolExecution {
  id: string;
  toolUseId: string;
  tool: string;
  input: any;
  result?: any;
  success: boolean;
  startTime: string;
  endTime?: string;
  duration?: number;
}

export interface FileChange {
  file: string;
  oldContent: string;
  newContent: string;
  additions: number;
  deletions: number;
  timestamp: string;
}

export interface Approval {
  requestId: string;
  tool: string;
  input: any;
  description?: string;
  decision?: 'allow' | 'deny';
  reason?: string;
  timestamp: string;
  resolvedAt?: string;
}

export interface Question {
  requestId: string;
  questions: any[];
  answers?: Record<string, string | string[]>;
  action?: string;
  timestamp: string;
  resolvedAt?: string;
}

export interface TaskInfo {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  timestamp: string;
  completedAt?: string;
}

export interface TaskAgent {
  agentId: string;
  agentType: string;
  description: string;
  startTime: string;
  endTime?: string;
  toolUses: number;
  tokens: number;
  durationMs?: number;
  success?: boolean;
}

export interface TimelineEvent {
  timestamp: string;
  type: 'message' | 'tool' | 'approval' | 'diff' | 'task' | 'agent' | 'question';
  data: any;
}

export interface SessionStats {
  totalPrompts: number;
  totalMessages: number;
  totalToolUses: number;
  totalTokens: number;
  totalCost: number;
  duration: number;
}

export interface SavedSession {
  metadata: {
    sessionId: string;
    projectId: string;
    projectPath: string;
    projectName: string;
    createdAt: string;
    lastModified: string;
    status: 'active' | 'completed' | 'interrupted' | 'error';
    permissionMode: PermissionMode;
    claudeSessionId?: string;
    stats: SessionStats;
  };
  timeline: TimelineEvent[];
  messages: SavedMessage[];
  toolExecutions: ToolExecution[];
  fileChanges: FileChange[];
  tasks: TaskInfo[];
  taskAgents: TaskAgent[];
  approvals: Approval[];
  questions: Question[];
}

export interface SessionMetadata {
  sessionId: string;
  projectId: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  lastModified: string;
  status: 'active' | 'completed' | 'interrupted' | 'error';
  stats: SessionStats;
}

export interface ActiveSessionInfo {
  sessionId: string;
  claudeSessionId?: string;
  startedAt: string;
}

interface SessionIndex {
  sessions: SessionMetadata[];
  lastUpdated: string;
}

interface ActiveSessions {
  sessions: ActiveSessionInfo[];
  lastUpdated: string;
}

// ============================================
// Session Storage Class
// ============================================

const CONFIG_DIR = path.join(os.homedir(), '.aoud');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');
const INDEX_FILE = path.join(SESSIONS_DIR, 'index.json');
const ACTIVE_SESSIONS_FILE = path.join(SESSIONS_DIR, 'active-sessions.json');

/**
 * Normalize project path to match Claude Code's directory naming convention
 * Converts both '/' and '_' to '-'
 */
export function normalizeProjectPath(projectPath: string): string {
  return projectPath.replace(/[/_]/g, '-');
}

export class SessionStorage {
  constructor() {
    this.ensureDirectories();
    this.cleanupIncompleteSessions();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  private getProjectDir(projectId: string): string {
    // Normalize project ID to match Claude Code's convention
    const normalizedId = normalizeProjectPath(projectId);
    const dir = path.join(SESSIONS_DIR, 'by-project', normalizedId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getSessionFilePath(sessionId: string, projectId: string): string {
    const projectDir = this.getProjectDir(projectId);
    return path.join(projectDir, `${sessionId}.json`);
  }

  private loadIndex(): SessionIndex {
    try {
      if (fs.existsSync(INDEX_FILE)) {
        const content = fs.readFileSync(INDEX_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      log.error('SessionStorage', 'Error loading session index:', error);
    }
    return { sessions: [], lastUpdated: new Date().toISOString() };
  }

  private saveIndex(index: SessionIndex): void {
    try {
      index.lastUpdated = new Date().toISOString();
      fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    } catch (error) {
      log.error('SessionStorage', 'Error saving session index:', error);
    }
  }

  private loadActiveSessions(): ActiveSessions {
    try {
      if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
        const content = fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      log.error('SessionStorage', 'Error loading active sessions:', error);
    }
    return { sessions: [], lastUpdated: new Date().toISOString() };
  }

  private saveActiveSessions(active: ActiveSessions): void {
    try {
      active.lastUpdated = new Date().toISOString();
      fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(active, null, 2));
    } catch (error) {
      log.error('SessionStorage', 'Error saving active sessions:', error);
    }
  }

  private updateIndex(metadata: SessionMetadata): void {
    const index = this.loadIndex();
    const existingIndex = index.sessions.findIndex(s => s.sessionId === metadata.sessionId);

    if (existingIndex >= 0) {
      index.sessions[existingIndex] = metadata;
    } else {
      index.sessions.push(metadata);
    }

    // Sort by lastModified (most recent first)
    index.sessions.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    this.saveIndex(index);
  }

  private removeFromIndex(sessionId: string): void {
    const index = this.loadIndex();
    index.sessions = index.sessions.filter(s => s.sessionId !== sessionId);
    this.saveIndex(index);
  }

  /**
   * Save a complete session to disk
   */
  async saveSession(sessionId: string, data: SavedSession): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const filePath = this.getSessionFilePath(sessionId, data.metadata.projectId);

        // Update last modified
        data.metadata.lastModified = new Date().toISOString();

        // Write session file
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

        // Update index
        const metadata: SessionMetadata = {
          sessionId: data.metadata.sessionId,
          projectId: data.metadata.projectId,
          projectPath: data.metadata.projectPath,
          projectName: data.metadata.projectName,
          createdAt: data.metadata.createdAt,
          lastModified: data.metadata.lastModified,
          status: data.metadata.status,
          stats: data.metadata.stats,
        };
        this.updateIndex(metadata);

        resolve();
      } catch (error) {
        log.error('SessionStorage', 'Error saving session:', error);
        reject(error);
      }
    });
  }

  /**
   * Load a session from disk
   */
  async loadSession(sessionId: string): Promise<SavedSession | null> {
    return new Promise((resolve) => {
      try {
        // Find session in index to get projectId
        const index = this.loadIndex();
        const metadata = index.sessions.find(s => s.sessionId === sessionId);

        if (!metadata) {
          resolve(null);
          return;
        }

        const filePath = this.getSessionFilePath(sessionId, metadata.projectId);

        if (!fs.existsSync(filePath)) {
          resolve(null);
          return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const session = JSON.parse(content) as SavedSession;
        resolve(session);
      } catch (error) {
        log.error('SessionStorage', 'Error loading session:', error);
        resolve(null);
      }
    });
  }

  /**
   * Update specific fields of a session
   */
  async updateSession(sessionId: string, updates: Partial<SavedSession>): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const session = await this.loadSession(sessionId);
        if (!session) {
          reject(new Error(`Session ${sessionId} not found`));
          return;
        }

        // Deep merge updates
        const updated = { ...session };
        if (updates.metadata) {
          updated.metadata = { ...session.metadata, ...updates.metadata };
        }
        if (updates.timeline) {
          updated.timeline = updates.timeline;
        }
        if (updates.messages) {
          updated.messages = updates.messages;
        }
        if (updates.toolExecutions) {
          updated.toolExecutions = updates.toolExecutions;
        }
        if (updates.fileChanges) {
          updated.fileChanges = updates.fileChanges;
        }
        if (updates.tasks) {
          updated.tasks = updates.tasks;
        }
        if (updates.taskAgents) {
          updated.taskAgents = updates.taskAgents;
        }
        if (updates.approvals) {
          updated.approvals = updates.approvals;
        }
        if (updates.questions) {
          updated.questions = updates.questions;
        }

        await this.saveSession(sessionId, updated);
        resolve();
      } catch (error) {
        log.error('SessionStorage', 'Error updating session:', error);
        reject(error);
      }
    });
  }

  /**
   * Delete a session from disk
   */
  async deleteSession(sessionId: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const index = this.loadIndex();
        const metadata = index.sessions.find(s => s.sessionId === sessionId);

        if (!metadata) {
          resolve();
          return;
        }

        const filePath = this.getSessionFilePath(sessionId, metadata.projectId);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        this.removeFromIndex(sessionId);
        resolve();
      } catch (error) {
        log.error('SessionStorage', 'Error deleting session:', error);
        reject(error);
      }
    });
  }

  /**
   * List all sessions, optionally filtered by project
   */
  async listSessions(projectId?: string): Promise<SessionMetadata[]> {
    return new Promise((resolve) => {
      try {
        const index = this.loadIndex();

        if (projectId) {
          resolve(index.sessions.filter(s => s.projectId === projectId));
        } else {
          resolve(index.sessions);
        }
      } catch (error) {
        log.error('SessionStorage', 'Error listing sessions:', error);
        resolve([]);
      }
    });
  }

  /**
   * Get all sessions for a specific project
   */
  async getSessionsByProject(projectId: string): Promise<SessionMetadata[]> {
    return this.listSessions(projectId);
  }

  /**
   * Mark a session as active (currently running)
   */
  async markSessionActive(sessionId: string, claudeSessionId?: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const active = this.loadActiveSessions();

        // Remove if already exists
        active.sessions = active.sessions.filter(s => s.sessionId !== sessionId);

        // Add as active
        active.sessions.push({
          sessionId,
          claudeSessionId,
          startedAt: new Date().toISOString(),
        });

        this.saveActiveSessions(active);
        resolve();
      } catch (error) {
        log.error('SessionStorage', 'Error marking session active:', error);
        resolve();
      }
    });
  }

  /**
   * Mark a session as complete (no longer running)
   */
  async markSessionComplete(sessionId: string): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        // Remove from active sessions
        const active = this.loadActiveSessions();
        active.sessions = active.sessions.filter(s => s.sessionId !== sessionId);
        this.saveActiveSessions(active);

        // Update session status
        await this.updateSession(sessionId, {
          metadata: {
            status: 'completed',
          } as any,
        });

        resolve();
      } catch (error) {
        log.error('SessionStorage', 'Error marking session complete:', error);
        resolve();
      }
    });
  }

  /**
   * Get all currently active sessions
   */
  async getActiveSessions(): Promise<ActiveSessionInfo[]> {
    return new Promise((resolve) => {
      try {
        const active = this.loadActiveSessions();
        resolve(active.sessions);
      } catch (error) {
        log.error('SessionStorage', 'Error getting active sessions:', error);
        resolve([]);
      }
    });
  }

  /**
   * Archive old sessions (move to archive folder)
   */
  async archiveOldSessions(olderThanDays: number): Promise<number> {
    return new Promise(async (resolve) => {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const index = this.loadIndex();
        let archived = 0;

        for (const metadata of index.sessions) {
          const lastModified = new Date(metadata.lastModified);
          if (lastModified < cutoffDate && metadata.status === 'completed') {
            // Could implement archival logic here
            // For now, just count them
            archived++;
          }
        }

        resolve(archived);
      } catch (error) {
        log.error('SessionStorage', 'Error archiving sessions:', error);
        resolve(0);
      }
    });
  }

  /**
   * Cleanup interrupted sessions on startup
   */
  cleanupIncompleteSessions(): void {
    try {
      const active = this.loadActiveSessions();

      if (active.sessions.length > 0) {
        log.info('SessionStorage', `Found ${active.sessions.length} interrupted session(s), marking as interrupted...`);

        // Mark all active sessions as interrupted
        for (const activeSession of active.sessions) {
          this.updateSession(activeSession.sessionId, {
            metadata: {
              status: 'interrupted',
            } as any,
          }).catch(err => {
            log.error('SessionStorage', `Error marking session ${activeSession.sessionId} as interrupted:`, err);
          });
        }

        // Clear active sessions
        this.saveActiveSessions({ sessions: [], lastUpdated: new Date().toISOString() });
      }
    } catch (error) {
      log.error('SessionStorage', 'Error cleaning up incomplete sessions:', error);
    }
  }
}

// Singleton instance
export const sessionStorage = new SessionStorage();
