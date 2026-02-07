import { useState } from 'react';
import { Check, X, MessageSquare, FileCode, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import * as Diff from 'diff';
import type { PendingApproval, DiffMessage } from '../hooks/useWebSocket';

interface ApprovalPanelProps {
  pendingApprovals: PendingApproval[];
  onApprove: (requestId: string, reason?: string) => void;
  onReject: (requestId: string, reason?: string) => void;
}

export function ApprovalPanel({ pendingApprovals, onApprove, onReject }: ApprovalPanelProps) {
  if (pendingApprovals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Check className="h-12 w-12 text-green-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">All clear!</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          No pending approvals. Actions requiring your review will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="text-sm text-muted-foreground mb-2">
        {pendingApprovals.length} action{pendingApprovals.length > 1 ? 's' : ''} awaiting approval
      </div>
      {pendingApprovals.map((approval) => (
        <ApprovalCard
          key={approval.requestId}
          approval={approval}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}

function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  approval: PendingApproval;
  onApprove: (requestId: string, reason?: string) => void;
  onReject: (requestId: string, reason?: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');

  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'Edit':
      case 'Write':
        return <FileCode className="h-4 w-4" />;
      case 'Bash':
        return <Terminal className="h-4 w-4" />;
      default:
        return <FileCode className="h-4 w-4" />;
    }
  };

  const getToolDescription = () => {
    if (approval.description) return approval.description;

    const input = approval.input as Record<string, unknown>;
    switch (approval.tool) {
      case 'Edit':
        return `Edit ${input.file_path}`;
      case 'Write':
        return `Write to ${input.file_path}`;
      case 'Bash':
        return `Run: ${input.command}`;
      default:
        return `Use ${approval.tool}`;
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
            {getToolIcon(approval.tool)}
          </div>
          <div>
            <div className="font-medium text-sm">{approval.tool}</div>
            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
              {getToolDescription()}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Diff View for Edit operations */}
          {approval.diff && <DiffViewer diff={approval.diff} />}

          {/* Content Preview for Write operations */}
          {approval.tool === 'Write' && (
            <WriteContentViewer
              filePath={(approval.input as { file_path: string }).file_path}
              content={(approval.input as { content: string }).content}
            />
          )}

          {/* Bash Command */}
          {approval.tool === 'Bash' && (
            <div className="p-4 bg-secondary/50">
              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                $ {(approval.input as { command: string }).command}
              </pre>
            </div>
          )}

          {/* Comment Input */}
          {showComment && (
            <div className="p-4 border-t border-border">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment or feedback..."
                rows={2}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 p-4 border-t border-border">
            <button
              onClick={() => onApprove(approval.requestId, comment || undefined)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 transition-colors"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>
            <button
              onClick={() => onReject(approval.requestId, comment || undefined)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 transition-colors"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
            <button
              onClick={() => setShowComment(!showComment)}
              className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffViewer({ diff }: { diff: DiffMessage }) {
  const [showFullDiff, setShowFullDiff] = useState(false);

  // Use proper diff algorithm to compare line by line
  const changes = Diff.diffLines(diff.oldContent, diff.newContent);

  // Build display lines with proper context
  const lines: Array<{ type: 'added' | 'removed' | 'context'; content: string; lineNum?: number }> = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    const changeLines = change.value.split('\n');
    // Remove the last empty line if the change ends with \n
    if (changeLines[changeLines.length - 1] === '') {
      changeLines.pop();
    }

    if (change.added) {
      // Added lines (green)
      for (const line of changeLines) {
        lines.push({ type: 'added', content: line, lineNum: newLineNum++ });
      }
    } else if (change.removed) {
      // Removed lines (red)
      for (const line of changeLines) {
        lines.push({ type: 'removed', content: line, lineNum: oldLineNum++ });
      }
    } else {
      // Context lines (unchanged) - only show a few around changes
      for (const line of changeLines) {
        lines.push({ type: 'context', content: line, lineNum: newLineNum });
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  // Filter to only show changed lines and minimal context
  const changedLines = lines.filter(line => line.type !== 'context');
  const displayLines = showFullDiff ? changedLines : changedLines.slice(0, 20);

  return (
    <div className="bg-secondary/50">
      {/* File Header */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs truncate">{diff.file}</span>
        <div className="flex gap-2 text-xs">
          <span className="text-green-400">+{diff.additions}</span>
          <span className="text-red-400">-{diff.deletions}</span>
        </div>
      </div>

      {/* Diff Content */}
      <div className="p-2 font-mono text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
        {displayLines.map((line, index) => (
          <div
            key={index}
            className={`flex gap-2 px-2 py-0.5 ${
              line.type === 'added' ? 'bg-green-500/10 text-green-400' :
              line.type === 'removed' ? 'bg-red-500/10 text-red-400' : ''
            }`}
          >
            <span className="text-muted-foreground w-6 text-right shrink-0">
              {line.lineNum}
            </span>
            <span className="shrink-0">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="whitespace-pre">{line.content}</span>
          </div>
        ))}
        {changedLines.length > 20 && !showFullDiff && (
          <button
            onClick={() => setShowFullDiff(true)}
            className="text-primary text-xs mt-2 px-2 hover:underline"
          >
            Show {changedLines.length - 20} more lines...
          </button>
        )}
      </div>
    </div>
  );
}

function WriteContentViewer({ filePath, content }: { filePath: string; content: string }) {
  const [showFullContent, setShowFullContent] = useState(false);

  const lines = content.split('\n');
  const displayLines = showFullContent ? lines : lines.slice(0, 20);
  const hasMore = lines.length > 20;

  return (
    <div className="bg-secondary/50">
      {/* File Header */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs truncate">{filePath}</span>
        <span className="text-xs text-muted-foreground">{lines.length} lines</span>
      </div>

      {/* Content Preview */}
      <div className="p-2 font-mono text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
        {displayLines.map((line, index) => (
          <div key={index} className="flex gap-2 px-2 py-0.5">
            <span className="text-muted-foreground w-6 text-right shrink-0">
              {index + 1}
            </span>
            <span className="whitespace-pre">{line}</span>
          </div>
        ))}
        {hasMore && !showFullContent && (
          <button
            onClick={() => setShowFullContent(true)}
            className="text-primary text-xs mt-2 px-2 hover:underline"
          >
            Show {lines.length - 20} more lines...
          </button>
        )}
      </div>
    </div>
  );
}
