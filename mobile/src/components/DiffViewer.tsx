import React, { useState, useMemo } from 'react';
import { computeUnifiedDiff, type DiffHunk, type DiffLine } from '../lib/unifiedDiff';

interface DiffViewerProps {
  diff: {
    file: string;
    oldContent: string;
    newContent: string;
    additions: number;
    deletions: number;
  };
  maxHunks?: number;
  contextLines?: number;
}

/**
 * GitHub-style unified diff viewer with dual line numbers,
 * hunk headers, context lines, and expand separators.
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({
  diff,
  maxHunks = 10,
  contextLines = 3,
}) => {
  const [showAllHunks, setShowAllHunks] = useState(false);

  const isNewFile = !diff.oldContent || diff.oldContent.length === 0;

  const result = useMemo(() => {
    if (isNewFile) return null;
    return computeUnifiedDiff(diff.oldContent, diff.newContent, contextLines);
  }, [diff.oldContent, diff.newContent, contextLines, isNewFile]);

  // New file: show all lines as additions without hunk headers
  if (isNewFile) {
    const lines = diff.newContent.split('\n');
    return (
      <div className="diff-viewer">
        <div className="diff-viewer__header">
          <span className="diff-viewer__file">{diff.file}</span>
          <div className="diff-viewer__stats">
            <span className="diff-viewer__additions">+{lines.length}</span>
          </div>
        </div>
        <div className="diff-viewer__content">
          {lines.map((line, idx) => (
            <div key={idx} className="diff-viewer__line diff-viewer__line--added">
              <span className="diff-viewer__line-num-old"></span>
              <span className="diff-viewer__line-num-new">{idx + 1}</span>
              <span className="diff-viewer__line-prefix">+</span>
              <span className="diff-viewer__line-content">{line}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No changes
  if (!result || result.hunks.length === 0) {
    return (
      <div className="diff-viewer">
        <div className="diff-viewer__header">
          <span className="diff-viewer__file">{diff.file}</span>
          <div className="diff-viewer__stats">
            <span className="diff-viewer__no-changes">No changes</span>
          </div>
        </div>
      </div>
    );
  }

  const displayHunks = showAllHunks ? result.hunks : result.hunks.slice(0, maxHunks);
  const hiddenHunkCount = result.hunks.length - maxHunks;

  return (
    <div className="diff-viewer">
      {/* File Header */}
      <div className="diff-viewer__header">
        <span className="diff-viewer__file">{diff.file}</span>
        <div className="diff-viewer__stats">
          <span className="diff-viewer__additions">+{diff.additions}</span>
          <span className="diff-viewer__deletions">-{diff.deletions}</span>
        </div>
      </div>

      {/* Diff Content */}
      <div className="diff-viewer__content">
        {displayHunks.map((hunk, hunkIdx) => (
          <React.Fragment key={hunkIdx}>
            {/* Expand separator between hunks */}
            {hunkIdx > 0 && (
              <HunkSeparator
                prevHunk={displayHunks[hunkIdx - 1]}
                currentHunk={hunk}
              />
            )}

            {/* Hunk header */}
            <div className="diff-viewer__hunk-header">
              {hunk.header}
            </div>

            {/* Hunk lines */}
            {hunk.lines.map((line, lineIdx) => (
              <DiffLineRow key={`${hunkIdx}-${lineIdx}`} line={line} />
            ))}
          </React.Fragment>
        ))}

        {/* Show more hunks button */}
        {!showAllHunks && hiddenHunkCount > 0 && (
          <button
            onClick={() => setShowAllHunks(true)}
            className="diff-viewer__show-more"
          >
            Show {hiddenHunkCount} more hunk{hiddenHunkCount !== 1 ? 's' : ''}...
          </button>
        )}
      </div>
    </div>
  );
};

/** Single diff line with dual line numbers */
const DiffLineRow: React.FC<{ line: DiffLine }> = ({ line }) => {
  const lineClass = `diff-viewer__line diff-viewer__line--${line.type}`;
  const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

  return (
    <div className={lineClass}>
      <span className="diff-viewer__line-num-old">
        {line.oldLineNum ?? ''}
      </span>
      <span className="diff-viewer__line-num-new">
        {line.newLineNum ?? ''}
      </span>
      <span className="diff-viewer__line-prefix">{prefix}</span>
      <span className="diff-viewer__line-content">{line.content}</span>
    </div>
  );
};

/** Separator between non-adjacent hunks showing hidden line count */
const HunkSeparator: React.FC<{
  prevHunk: DiffHunk;
  currentHunk: DiffHunk;
}> = ({ prevHunk, currentHunk }) => {
  const prevEnd = prevHunk.oldStart + prevHunk.oldLines;
  const hiddenLines = currentHunk.oldStart - prevEnd;

  if (hiddenLines <= 0) return null;

  return (
    <div className="diff-viewer__expand-separator">
      &#x22EE; {hiddenLines} hidden line{hiddenLines !== 1 ? 's' : ''} &#x22EE;
    </div>
  );
};

export default DiffViewer;
