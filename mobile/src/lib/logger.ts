/**
 * Browser-compatible logger for mobile client
 *
 * Provides styled console output with timestamps and tags for better debugging
 * in browser dev tools.
 *
 * Features:
 * - Colored output using CSS styles
 * - Timestamps with millisecond precision
 * - Tagged messages for easy filtering
 * - DEBUG mode support via localStorage
 * - Five log levels: debug, info, success, warn, error
 */

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

interface LogStyles {
  tag: string;
  message: string;
}

const LOG_STYLES: Record<LogLevel, LogStyles> = {
  info: {
    tag: 'background: #3b82f6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    message: 'color: #3b82f6;',
  },
  success: {
    tag: 'background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    message: 'color: #10b981;',
  },
  warn: {
    tag: 'background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    message: 'color: #f59e0b;',
  },
  error: {
    tag: 'background: #ef4444; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    message: 'color: #ef4444;',
  },
  debug: {
    tag: 'background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    message: 'color: #8b5cf6;',
  },
};

/**
 * Check if debug mode is enabled
 * Can be enabled via localStorage: localStorage.setItem('debug', 'true')
 */
function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem('debug') === 'true' ||
           localStorage.getItem('DEBUG') === 'true';
  } catch {
    return false;
  }
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions & { fractionalSecondDigits?: number });
}

function logWithStyle(level: LogLevel, tag: string, message: string, ...args: any[]): void {
  // Skip debug logs unless debug mode is enabled
  if (level === 'debug' && !isDebugEnabled()) {
    return;
  }

  const timestamp = formatTimestamp();
  const styles = LOG_STYLES[level];

  // Get the appropriate console method
  const consoleMethod = level === 'success' ? 'log' : level;

  // Format: [HH:MM:SS.mmm] [TAG] message
  console[consoleMethod](
    `%c[${timestamp}]%c %c${tag}%c ${message}`,
    'color: #6b7280; font-weight: normal;', // timestamp
    '', // reset
    styles.tag, // tag style
    styles.message, // message style
    ...args
  );
}

export const log = {
  /**
   * Log informational message
   */
  info(tag: string, message: string, ...args: any[]): void {
    logWithStyle('info', tag, message, ...args);
  },

  /**
   * Log success message
   */
  success(tag: string, message: string, ...args: any[]): void {
    logWithStyle('success', tag, message, ...args);
  },

  /**
   * Log warning message
   */
  warn(tag: string, message: string, ...args: any[]): void {
    logWithStyle('warn', tag, message, ...args);
  },

  /**
   * Log error message
   */
  error(tag: string, message: string, ...args: any[]): void {
    logWithStyle('error', tag, message, ...args);
  },

  /**
   * Log debug message
   */
  debug(tag: string, message: string, ...args: any[]): void {
    logWithStyle('debug', tag, message, ...args);
  },
};
