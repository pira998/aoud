/**
 * Component Bridge Utilities
 *
 * Helper functions for adapting server data to UI component props
 */

import type { PermissionMode } from '../../../shared/types';

/**
 * Format timestamp as relative time (e.g., "2m ago", "1h ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format cost in USD
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Format token count with K/M suffixes
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

/**
 * Get tool icon emoji
 */
export function getToolIcon(toolName: string): string {
  const icons: Record<string, string> = {
    Bash: '💻',
    Read: '📖',
    Edit: '✏️',
    Write: '📝',
    Glob: '🔍',
    Grep: '🔎',
    WebFetch: '🌐',
    WebSearch: '🔍',
    Task: '⚙️',
    Skill: '🎯',
    NotebookEdit: '📓',
    TodoWrite: '✅',
    MCP: '🔌',
  };

  return icons[toolName] || '🔧';
}

/**
 * Get status color class
 */
export function getStatusColor(status: 'running' | 'done' | 'error'): string {
  switch (status) {
    case 'running':
      return 'text-blue-400';
    case 'done':
      return 'text-green-400';
    case 'error':
      return 'text-red-400';
  }
}

/**
 * Get permission mode display name
 */
export function getPermissionModeDisplay(mode: PermissionMode): string {
  switch (mode) {
    case 'default':
      return 'Default';
    case 'plan':
      return 'Plan Mode';
    case 'acceptEdits':
      return 'Accept Edits';
    default:
      return mode;
  }
}

/**
 * Get permission mode color
 */
export function getPermissionModeColor(mode: PermissionMode): string {
  switch (mode) {
    case 'default':
      return 'text-gray-400';
    case 'plan':
      return 'text-blue-400';
    case 'acceptEdits':
      return 'text-green-400';
    default:
      return 'text-gray-400';
  }
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Extract file name from path
 */
export function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/**
 * Get file extension
 */
export function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts.pop()! : '';
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = getFileExtension(filePath).toLowerCase();

  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    md: 'markdown',
    sql: 'sql',
  };

  return languageMap[ext] || 'plaintext';
}

/**
 * Parse tool input for display
 */
export function parseToolInput(_toolName: string, input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    return { value: input };
  }

  return input as Record<string, unknown>;
}

/**
 * Format tool input for display
 */
export function formatToolInput(toolName: string, input: unknown): string {
  const parsed = parseToolInput(toolName, input);

  switch (toolName) {
    case 'Bash':
      return (parsed.command as string) || '';

    case 'Read':
      return (parsed.file_path as string) || '';

    case 'Edit':
      return (parsed.file_path as string) || '';

    case 'Write':
      return (parsed.file_path as string) || '';

    case 'Glob':
      return (parsed.pattern as string) || '';

    case 'Grep':
      return `"${parsed.pattern}" in ${parsed.path || 'current dir'}`;

    default:
      return JSON.stringify(parsed, null, 2);
  }
}

/**
 * Check if tool requires approval
 */
export function requiresApproval(toolName: string): boolean {
  const approvalRequired = ['Edit', 'Write', 'Bash', 'NotebookEdit'];
  return approvalRequired.includes(toolName);
}

/**
 * Check if output should be syntax highlighted
 */
export function shouldHighlightOutput(toolName: string): boolean {
  const highlightTools = ['Read', 'Edit', 'Write'];
  return highlightTools.includes(toolName);
}
