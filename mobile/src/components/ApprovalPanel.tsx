import { useState } from 'react';
import { Check, X, MessageSquare, FileCode, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { DiffViewer } from './DiffViewer';
import type { PendingApproval } from '../hooks/useWebSocket';

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
          {/* Diff View for Edit operations (GitHub-style unified diff) */}
          {approval.diff && <DiffViewer diff={approval.diff} />}

          {/* Content Preview for Write operations (new files) */}
          {approval.tool === 'Write' && !approval.diff && (
            <DiffViewer diff={{
              file: (approval.input as { file_path: string }).file_path,
              oldContent: '',
              newContent: (approval.input as { content: string }).content,
              additions: (approval.input as { content: string }).content.split('\n').length,
              deletions: 0,
            }} />
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

// DiffViewer and WriteContentViewer are now handled by the shared DiffViewer component
