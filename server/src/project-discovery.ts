import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProjectInfo } from '../../shared/types.js';
import { log } from './logger.js';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const ACTIVE_PROJECT_FILE = path.join(os.homedir(), '.aoud', 'active-project.txt');

/**
 * Decode an encoded project directory name back to a real filesystem path.
 *
 * Claude Code SDK encodes paths by replacing BOTH '/' and '_' with '-'.
 * e.g. "/Users/foo/new_idea" → "-Users-foo-new-idea"
 *
 * This is lossy — '-' in the encoded name could have been '/', '_', or '-' originally.
 * Strategy: greedy left-to-right reconstruction, at each step trying all underscore
 * variations of the candidate segment to find a match on disk.
 */
export function decodeProjectPath(encoded: string): string {
  // Windows paths: "C--Users-foo-bar" (drive letter + -- for :\)
  // Unix paths:    "-Users-foo-bar"   (leading - for /)
  const windowsDriveMatch = encoded.match(/^([A-Za-z])--(.*)/);

  let parts: string[];
  let currentPath: string;
  let i = 0;

  if (windowsDriveMatch) {
    // Windows: start from drive root, e.g. C:\
    currentPath = `${windowsDriveMatch[1].toUpperCase()}:\\`;
    parts = windowsDriveMatch[2].split('-');
  } else if (encoded.startsWith('-')) {
    // Unix: start from /
    currentPath = '/';
    parts = encoded.slice(1).split('-');
  } else {
    return encoded;
  }

  while (i < parts.length) {
    let found = false;

    // Try LONGEST match first (to prefer "test_demo" over "test/" + "demo")
    // Cap at 8 parts per segment to limit variant explosion (2^7 = 128 max)
    const maxLen = Math.min(parts.length - i, 8);
    for (let len = maxLen; len >= 1; len--) {
      const segmentParts = parts.slice(i, i + len);

      // Generate all possible variations: each internal '-' could be '-' or '_'
      const variants = generateVariants(segmentParts);

      for (const variant of variants) {
        const candidate = path.join(currentPath, variant);
        if (fs.existsSync(candidate)) {
          currentPath = candidate;
          i += len;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      // No valid path found, fall back to joining remaining parts as-is
      const remaining = parts.slice(i).join('-');
      currentPath = path.join(currentPath, remaining);
      break;
    }
  }

  return currentPath;
}

/**
 * Generate all possible original names from a set of dash-separated parts.
 * Each internal join could be '-' or '_'.
 * e.g. ['new', 'idea'] → ['new-idea', 'new_idea']
 * e.g. ['a', 'b', 'c'] → ['a-b-c', 'a_b-c', 'a-b_c', 'a_b_c']
 *
 * For efficiency, limit to max 10 parts (2^9 = 512 combos max).
 * Single part → just return it as-is (no joining needed).
 */
function generateVariants(parts: string[]): string[] {
  if (parts.length === 1) return [parts[0]];

  // For very long segments, fall back to just '-' and '_' versions
  if (parts.length > 10) {
    return [
      parts.join('-'),
      parts.join('_'),
    ];
  }

  const separators = ['-', '_'];
  const results: string[] = [];
  const joinCount = parts.length - 1;
  const totalCombos = 1 << joinCount; // 2^joinCount

  for (let mask = 0; mask < totalCombos; mask++) {
    let result = parts[0];
    for (let j = 0; j < joinCount; j++) {
      const sep = (mask >> j) & 1 ? '_' : '-';
      result += sep + parts[j + 1];
    }
    results.push(result);
  }

  return results;
}

/**
 * Discover all projects from ~/.claude/projects/ directory.
 * This reads from the same location Claude Code SDK stores project data.
 */
export function discoverProjects(): ProjectInfo[] {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectDir = path.join(CLAUDE_PROJECTS_DIR, entry.name);

      try {
        const dirStats = fs.statSync(projectDir);

        // Count session files
        const sessionFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

        // Find most recent session file for last accessed time
        let lastAccessed = dirStats.mtime.toISOString();
        for (const sessionFile of sessionFiles) {
          try {
            const fileStat = fs.statSync(path.join(projectDir, sessionFile));
            if (fileStat.mtime > new Date(lastAccessed)) {
              lastAccessed = fileStat.mtime.toISOString();
            }
          } catch { /* skip */ }
        }

        // Decode the encoded directory name to a real path
        const realPath = decodeProjectPath(entry.name);
        const projectName = path.basename(realPath);

        projects.push({
          id: entry.name,  // Use the encoded directory name as ID
          name: projectName,
          path: realPath,
          lastAccessed,
          sessionCount: sessionFiles.length,
        });
      } catch (err) {
        log.warn('ProjectDiscovery', `Error reading project dir ${entry.name}:`, err);
      }
    }

    // Sort by last accessed (most recent first)
    projects.sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());

    return projects;
  } catch (error) {
    log.error('ProjectDiscovery', 'Error discovering projects:', error);
    return [];
  }
}

/**
 * Get the active project ID (stored in a simple file).
 */
export function getActiveProjectId(): string | undefined {
  try {
    if (fs.existsSync(ACTIVE_PROJECT_FILE)) {
      return fs.readFileSync(ACTIVE_PROJECT_FILE, 'utf-8').trim() || undefined;
    }
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Set the active project ID.
 */
export function setActiveProjectId(projectId: string): void {
  try {
    const dir = path.dirname(ACTIVE_PROJECT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ACTIVE_PROJECT_FILE, projectId);
  } catch (error) {
    log.error('ProjectDiscovery', 'Error saving active project:', error);
  }
}

/**
 * Find a project by its real filesystem path.
 */
export function findProjectByPath(projectPath: string): ProjectInfo | undefined {
  const projects = discoverProjects();
  const resolved = path.resolve(projectPath);
  return projects.find(p => p.path === resolved);
}
