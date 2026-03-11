/**
 * Ghostty / Tokyo Night Themed Logger
 *
 * Zero-dependency colorful terminal output using ANSI escape codes.
 * Provides structured, themed logging for the bridge server.
 */

// ─── ANSI Color Codes (Ghostty / Tokyo Night palette) ──────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';

// Foreground colors
const FG = {
  black:   '\x1b[30m',
  red:     '\x1b[31m',     // #f7768e - errors
  green:   '\x1b[32m',     // #9ece6a - success
  yellow:  '\x1b[33m',     // #e0af68 - warnings
  blue:    '\x1b[34m',     // #7aa2f7 - info text
  magenta: '\x1b[35m',     // #bb9af7 - debug
  cyan:    '\x1b[36m',     // #7dcfff - tags/labels
  white:   '\x1b[37m',
  gray:    '\x1b[90m',     // dim - timestamps, muted
  brightRed:     '\x1b[91m',
  brightGreen:   '\x1b[92m',
  brightYellow:  '\x1b[93m',
  brightBlue:    '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan:    '\x1b[96m',
  brightWhite:   '\x1b[97m',
};

// Background colors
const BG = {
  red:     '\x1b[41m',
  green:   '\x1b[42m',
  yellow:  '\x1b[43m',
  blue:    '\x1b[44m',
  magenta: '\x1b[45m',
  cyan:    '\x1b[46m',
  gray:    '\x1b[100m',
};

// ─── Tag Icons ──────────────────────────────────────────────────────────────
const TAG_ICONS: Record<string, string> = {
  Server:           '🖥 ',
  Terminal:         '⌨️ ',
  WebSocket:        '🔌',
  Session:          '📋',
  ClaudeSession:    '🤖',
  Approval:         '✅',
  Question:         '❓',
  SlashCommand:     '⚡',
  SessionList:      '📑',
  SessionLoad:      '📂',
  SessionResume:    '▶️ ',
  CloseSession:     '🔒',
  TLS:              '🔐',
  ProcessMonitor:   '👁 ',
  SessionStorage:   '💾',
  ProjectDiscovery: '🔍',
  ProjectRegistry:  '📦',
  Auth:             '🔑',
  Broadcast:        '📡',
  Debug:            '🔮',
  TodoWrite:        '📝',
  AskUserQuestion:  '💬',
  TaskCreate:       '➕',
  TaskUpdate:       '🔄',
  TaskList:         '📋',
  GetMemory:        '🧠',
  ParseSession:     '📄',
  Write:            '✏️ ',
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const isSilent = (): boolean => process.env.AOUD_SILENT === 'true';
const hasColorSupport = (): boolean => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
};

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getIcon(tag: string): string {
  return TAG_ICONS[tag] || '•';
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  return ' ' + args.map(a => {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a, null, 2);
    } catch {
      return String(a);
    }
  }).join(' ');
}

// ─── Core Log Functions ─────────────────────────────────────────────────────

function logInfo(tag: string, message: string, ...args: unknown[]): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  const icon = getIcon(tag);
  if (color) {
    console.log(
      `${FG.gray}[${timestamp()}]${RESET} ${icon} ${FG.cyan}${BOLD}[${tag}]${RESET} ${FG.blue}${message}${RESET}${FG.gray}${formatArgs(args)}${RESET}`
    );
  } else {
    console.log(`[${timestamp()}] [${tag}] ${message}${formatArgs(args)}`);
  }
}

function logSuccess(tag: string, message: string, ...args: unknown[]): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  const icon = getIcon(tag);
  if (color) {
    console.log(
      `${FG.gray}[${timestamp()}]${RESET} ${icon} ${FG.cyan}${BOLD}[${tag}]${RESET} ${FG.green}${message}${RESET}${FG.gray}${formatArgs(args)}${RESET}`
    );
  } else {
    console.log(`[${timestamp()}] ✓ [${tag}] ${message}${formatArgs(args)}`);
  }
}

function logWarn(tag: string, message: string, ...args: unknown[]): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  const icon = '⚠️ ';
  if (color) {
    console.warn(
      `${FG.gray}[${timestamp()}]${RESET} ${icon} ${FG.yellow}${BOLD}[${tag}]${RESET} ${FG.yellow}${message}${RESET}${FG.gray}${formatArgs(args)}${RESET}`
    );
  } else {
    console.warn(`[${timestamp()}] ⚠ [${tag}] ${message}${formatArgs(args)}`);
  }
}

function logError(tag: string, message: string, ...args: unknown[]): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  const icon = '❌';
  if (color) {
    console.error(
      `${FG.gray}[${timestamp()}]${RESET} ${icon} ${FG.red}${BOLD}[${tag}]${RESET} ${FG.red}${message}${RESET}${FG.brightRed}${formatArgs(args)}${RESET}`
    );
  } else {
    console.error(`[${timestamp()}] ✗ [${tag}] ${message}${formatArgs(args)}`);
  }
}

function logDebug(tag: string, message: string, ...args: unknown[]): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  const icon = getIcon('Debug');
  if (color) {
    console.log(
      `${FG.gray}[${timestamp()}]${RESET} ${icon} ${FG.magenta}[${tag}]${RESET} ${DIM}${FG.magenta}${message}${RESET}${FG.gray}${DIM}${formatArgs(args)}${RESET}`
    );
  } else {
    console.log(`[${timestamp()}] [DEBUG:${tag}] ${message}${formatArgs(args)}`);
  }
}

// ─── Special Formatters ─────────────────────────────────────────────────────

function logServer(message: string): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  if (color) {
    console.log(
      `${FG.gray}[${timestamp()}]${RESET} 🖥  ${FG.brightCyan}${BOLD}[Server]${RESET} ${FG.white}${message}${RESET}`
    );
  } else {
    console.log(`[${timestamp()}] [Server] ${message}`);
  }
}

function logDivider(label?: string): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  if (color) {
    if (label) {
      console.log(`${FG.gray}${'─'.repeat(8)} ${FG.cyan}${label} ${FG.gray}${'─'.repeat(50 - label.length)}${RESET}`);
    } else {
      console.log(`${FG.gray}${'─'.repeat(60)}${RESET}`);
    }
  } else {
    if (label) {
      console.log(`-------- ${label} ${'─'.repeat(50 - label.length)}`);
    } else {
      console.log('─'.repeat(60));
    }
  }
}

function logBanner(lines: string[]): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  const maxLen = Math.max(...lines.map(l => l.length));
  const pad = (s: string) => s.padEnd(maxLen);

  if (color) {
    console.log('');
    console.log(`  ${FG.cyan}${BOLD}╔${'═'.repeat(maxLen + 4)}╗${RESET}`);
    for (const line of lines) {
      console.log(`  ${FG.cyan}${BOLD}║${RESET}  ${FG.brightWhite}${pad(line)}${RESET}  ${FG.cyan}${BOLD}║${RESET}`);
    }
    console.log(`  ${FG.cyan}${BOLD}╚${'═'.repeat(maxLen + 4)}╝${RESET}`);
    console.log('');
  } else {
    console.log('');
    console.log(`  +${'-'.repeat(maxLen + 4)}+`);
    for (const line of lines) {
      console.log(`  |  ${pad(line)}  |`);
    }
    console.log(`  +${'-'.repeat(maxLen + 4)}+`);
    console.log('');
  }
}

function logKeyValue(tag: string, pairs: Record<string, string | number | boolean | undefined>): void {
  if (isSilent()) return;
  const color = hasColorSupport();
  const icon = getIcon(tag);

  if (color) {
    console.log(
      `${FG.gray}[${timestamp()}]${RESET} ${icon} ${FG.cyan}${BOLD}[${tag}]${RESET}`
    );
    for (const [key, value] of Object.entries(pairs)) {
      if (value !== undefined) {
        console.log(
          `${FG.gray}           ${RESET}   ${FG.gray}├─${RESET} ${FG.brightCyan}${key}:${RESET} ${FG.white}${value}${RESET}`
        );
      }
    }
  } else {
    console.log(`[${timestamp()}] [${tag}]`);
    for (const [key, value] of Object.entries(pairs)) {
      if (value !== undefined) {
        console.log(`             ├─ ${key}: ${value}`);
      }
    }
  }
}

// ─── Exported Logger ────────────────────────────────────────────────────────

export const log = {
  info: logInfo,
  success: logSuccess,
  warn: logWarn,
  error: logError,
  debug: logDebug,
  server: logServer,
  divider: logDivider,
  banner: logBanner,
  keyValue: logKeyValue,
};

export default log;
