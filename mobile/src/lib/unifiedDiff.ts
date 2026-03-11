import * as Diff from 'diff';

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface UnifiedDiffResult {
  hunks: DiffHunk[];
  totalAdditions: number;
  totalDeletions: number;
}

/**
 * Compute a GitHub-style unified diff using Diff.structuredPatch().
 * Returns hunks with interleaved context, removed, and added lines,
 * each annotated with proper old/new line numbers.
 */
export function computeUnifiedDiff(
  oldContent: string,
  newContent: string,
  contextLines: number = 3
): UnifiedDiffResult {
  const patch = Diff.structuredPatch(
    'old',
    'new',
    oldContent,
    newContent,
    undefined,
    undefined,
    { context: contextLines }
  );

  let totalAdditions = 0;
  let totalDeletions = 0;
  const hunks: DiffHunk[] = [];

  for (const hunk of patch.hunks) {
    const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    const lines: DiffLine[] = [];
    let oldLineNum = hunk.oldStart;
    let newLineNum = hunk.newStart;

    for (const rawLine of hunk.lines) {
      const prefix = rawLine[0];
      const content = rawLine.substring(1);

      // Skip "\ No newline at end of file" markers
      if (prefix === '\\') {
        continue;
      }

      if (prefix === '+') {
        lines.push({
          type: 'added',
          content,
          newLineNum: newLineNum++,
        });
        totalAdditions++;
      } else if (prefix === '-') {
        lines.push({
          type: 'removed',
          content,
          oldLineNum: oldLineNum++,
        });
        totalDeletions++;
      } else {
        // Context line (prefix is ' ')
        lines.push({
          type: 'context',
          content,
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
        });
      }
    }

    hunks.push({
      header,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines,
    });
  }

  return { hunks, totalAdditions, totalDeletions };
}
