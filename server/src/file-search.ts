import fs from 'fs';
import path from 'path';
import type { FileSearchEntry } from '../../shared/types.js';

const MAX_RESULTS = 100;
const MAX_DEPTH = 8;

// Directories to always skip
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', '.next',
  '__pycache__', '.cache', '.vscode', '.idea', 'coverage', '.nyc_output',
  'vendor', '.DS_Store', 'bower_components', '.terraform', '.eggs',
]);

// Common binary extensions to skip during search
const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.lib',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock',
]);

/**
 * Search files and folders in a project directory.
 * Returns matching entries sorted by relevance.
 */
export function searchFiles(
  projectPath: string,
  query: string,
  options: { includeFiles?: boolean; includeDirs?: boolean } = {}
): { entries: FileSearchEntry[]; totalCount: number; truncated: boolean } {
  const { includeFiles = true, includeDirs = true } = options;
  const results: FileSearchEntry[] = [];
  const lowerQuery = query.toLowerCase();
  let totalCount = 0;

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH) return;
    if (results.length >= MAX_RESULTS * 2) return; // collect extra for sorting

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && IGNORE_DIRS.has(entry.name)) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const isDir = entry.isDirectory();
      const lowerName = entry.name.toLowerCase();

      // Match against query
      if (lowerName.includes(lowerQuery)) {
        if ((isDir && includeDirs) || (!isDir && includeFiles)) {
          const ext = isDir ? undefined : path.extname(entry.name).toLowerCase();
          if (!isDir && ext && BINARY_EXTENSIONS.has(ext)) continue;

          let size: number | undefined;
          let mtime: number | undefined;
          if (!isDir) {
            try {
              const stats = fs.statSync(fullPath);
              size = stats.size;
              mtime = stats.mtimeMs;
            } catch {
              // skip files we can't stat
            }
          }

          results.push({
            name: entry.name,
            path: fullPath,
            isDirectory: isDir,
            size,
            extension: ext || undefined,
            mtime,
          });
          totalCount++;
        }
      }

      // Recurse into directories
      if (isDir && !entry.name.startsWith('.')) {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(projectPath, 0);

  // Sort: exact prefix match first, then by name length (shorter = more relevant), dirs before files
  results.sort((a, b) => {
    const aStartsWith = a.name.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
    const bStartsWith = b.name.toLowerCase().startsWith(lowerQuery) ? 0 : 1;
    if (aStartsWith !== bStartsWith) return aStartsWith - bStartsWith;
    // Directories first
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    // Shorter names first
    return a.name.length - b.name.length;
  });

  const truncated = results.length > MAX_RESULTS;
  return {
    entries: results.slice(0, MAX_RESULTS),
    totalCount,
    truncated,
  };
}

/**
 * Get the MIME type and language for a file based on its extension.
 */
export function getFileInfo(filePath: string): { mimeType: string; language?: string; isBinary: boolean } {
  const ext = path.extname(filePath).toLowerCase();

  const textTypes: Record<string, { mime: string; lang?: string }> = {
    '.ts': { mime: 'text/typescript', lang: 'typescript' },
    '.tsx': { mime: 'text/typescript', lang: 'typescript' },
    '.js': { mime: 'text/javascript', lang: 'javascript' },
    '.jsx': { mime: 'text/javascript', lang: 'javascript' },
    '.py': { mime: 'text/x-python', lang: 'python' },
    '.rb': { mime: 'text/x-ruby', lang: 'ruby' },
    '.go': { mime: 'text/x-go', lang: 'go' },
    '.rs': { mime: 'text/x-rust', lang: 'rust' },
    '.java': { mime: 'text/x-java', lang: 'java' },
    '.kt': { mime: 'text/x-kotlin', lang: 'kotlin' },
    '.swift': { mime: 'text/x-swift', lang: 'swift' },
    '.c': { mime: 'text/x-c', lang: 'c' },
    '.cpp': { mime: 'text/x-c++', lang: 'cpp' },
    '.h': { mime: 'text/x-c', lang: 'c' },
    '.hpp': { mime: 'text/x-c++', lang: 'cpp' },
    '.cs': { mime: 'text/x-csharp', lang: 'csharp' },
    '.php': { mime: 'text/x-php', lang: 'php' },
    '.html': { mime: 'text/html', lang: 'html' },
    '.htm': { mime: 'text/html', lang: 'html' },
    '.css': { mime: 'text/css', lang: 'css' },
    '.scss': { mime: 'text/x-scss', lang: 'scss' },
    '.less': { mime: 'text/x-less', lang: 'css' },
    '.json': { mime: 'application/json', lang: 'json' },
    '.xml': { mime: 'text/xml', lang: 'xml' },
    '.yaml': { mime: 'text/yaml', lang: 'yaml' },
    '.yml': { mime: 'text/yaml', lang: 'yaml' },
    '.md': { mime: 'text/markdown', lang: 'markdown' },
    '.mdx': { mime: 'text/markdown', lang: 'markdown' },
    '.txt': { mime: 'text/plain' },
    '.sh': { mime: 'text/x-sh', lang: 'bash' },
    '.bash': { mime: 'text/x-sh', lang: 'bash' },
    '.zsh': { mime: 'text/x-sh', lang: 'bash' },
    '.sql': { mime: 'text/x-sql', lang: 'sql' },
    '.dockerfile': { mime: 'text/x-dockerfile', lang: 'dockerfile' },
    '.toml': { mime: 'text/x-toml', lang: 'ini' },
    '.ini': { mime: 'text/x-ini', lang: 'ini' },
    '.cfg': { mime: 'text/plain' },
    '.env': { mime: 'text/plain' },
    '.gitignore': { mime: 'text/plain' },
    '.lua': { mime: 'text/x-lua', lang: 'lua' },
    '.dart': { mime: 'text/x-dart', lang: 'dart' },
    '.r': { mime: 'text/x-r', lang: 'r' },
    '.scala': { mime: 'text/x-scala', lang: 'scala' },
    '.clj': { mime: 'text/x-clojure', lang: 'clojure' },
    '.ex': { mime: 'text/x-elixir', lang: 'elixir' },
    '.exs': { mime: 'text/x-elixir', lang: 'elixir' },
    '.erl': { mime: 'text/x-erlang', lang: 'erlang' },
    '.hs': { mime: 'text/x-haskell', lang: 'haskell' },
    '.vue': { mime: 'text/x-vue', lang: 'html' },
    '.svelte': { mime: 'text/x-svelte', lang: 'html' },
    '.graphql': { mime: 'text/x-graphql' },
    '.proto': { mime: 'text/x-protobuf', lang: 'protobuf' },
    '.makefile': { mime: 'text/x-makefile', lang: 'makefile' },
    '.cmake': { mime: 'text/x-cmake', lang: 'cmake' },
    '.csv': { mime: 'text/csv' },
    '.log': { mime: 'text/plain' },
  };

  const imageTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
  };

  if (textTypes[ext]) {
    return { mimeType: textTypes[ext].mime, language: textTypes[ext].lang, isBinary: false };
  }
  if (imageTypes[ext]) {
    return { mimeType: imageTypes[ext], isBinary: true };
  }

  // Fallback: check if file with no recognized ext might be text
  // Files like Makefile, Dockerfile (no extension)
  const basename = path.basename(filePath).toLowerCase();
  if (basename === 'makefile') return { mimeType: 'text/x-makefile', language: 'makefile', isBinary: false };
  if (basename === 'dockerfile') return { mimeType: 'text/x-dockerfile', language: 'dockerfile', isBinary: false };
  if (basename === 'rakefile') return { mimeType: 'text/x-ruby', language: 'ruby', isBinary: false };
  if (basename === 'gemfile') return { mimeType: 'text/x-ruby', language: 'ruby', isBinary: false };

  return { mimeType: 'application/octet-stream', isBinary: true };
}

const MAX_PREVIEW_SIZE = 1024 * 512; // 512KB max for text files
const MAX_IMAGE_SIZE = 1024 * 1024 * 5; // 5MB max for images

/**
 * Read file content for preview.
 */
export function readFileForPreview(filePath: string): {
  content: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  size: number;
  language?: string;
} {
  const resolved = path.resolve(filePath);

  // Security: prevent directory traversal
  if (resolved.includes('..')) {
    throw new Error('Invalid file path');
  }

  if (!fs.existsSync(resolved)) {
    throw new Error('File not found');
  }

  const stats = fs.statSync(resolved);
  if (stats.isDirectory()) {
    throw new Error('Path is a directory');
  }

  const { mimeType, language, isBinary } = getFileInfo(resolved);

  if (isBinary && mimeType.startsWith('image/')) {
    if (stats.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large (${(stats.size / 1024 / 1024).toFixed(1)}MB, max 5MB)`);
    }
    const buffer = fs.readFileSync(resolved);
    return {
      content: buffer.toString('base64'),
      encoding: 'base64',
      mimeType,
      size: stats.size,
      language,
    };
  }

  if (isBinary) {
    throw new Error('Binary file cannot be previewed');
  }

  if (stats.size > MAX_PREVIEW_SIZE) {
    // Read only first 512KB
    const buffer = Buffer.alloc(MAX_PREVIEW_SIZE);
    const fd = fs.openSync(resolved, 'r');
    fs.readSync(fd, buffer, 0, MAX_PREVIEW_SIZE, 0);
    fs.closeSync(fd);
    return {
      content: buffer.toString('utf8') + '\n\n... [truncated, file too large]',
      encoding: 'utf8',
      mimeType,
      size: stats.size,
      language,
    };
  }

  return {
    content: fs.readFileSync(resolved, 'utf8'),
    encoding: 'utf8',
    mimeType,
    size: stats.size,
    language,
  };
}

const MAX_RECENT_FILES = 50;

/**
 * Get recently modified files from a project directory.
 * Returns files sorted by modification time (newest first).
 */
export function getRecentFiles(
  projectPath: string,
  limit: number = 20
): { entries: FileSearchEntry[]; totalCount: number } {
  const files: FileSearchEntry[] = [];

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH) return;
    if (files.length >= MAX_RECENT_FILES) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        try {
          const stats = fs.statSync(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            isDirectory: false,
            size: stats.size,
            extension: ext || undefined,
            mtime: stats.mtimeMs,
          });
        } catch {
          // skip files we can't stat
        }

        if (files.length >= MAX_RECENT_FILES) return;
      }
    }
  }

  walk(projectPath, 0);

  // Sort by modification time descending (newest first)
  files.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  return {
    entries: files.slice(0, limit),
    totalCount: files.length,
  };
}
