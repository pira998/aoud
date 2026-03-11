import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import type { Ticket, DepTreeNode } from '../../../../shared/ticket-types';

interface DepGraphProps {
  tickets: Ticket[];
  depTree: DepTreeNode | null;
  depTreeRootId: string | null;
  onRequestTree: (ticketId: string) => void;
  onSelect: (ticketId: string) => void;
}

const STATUS_COLORS = {
  open: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  in_progress: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
  closed: 'border-green-500/50 bg-green-500/10 text-green-400',
};

const STATUS_DOT = {
  open: 'bg-yellow-500',
  in_progress: 'bg-blue-500 animate-pulse',
  closed: 'bg-green-500',
};

/**
 * Render a tree node recursively as an indented tree.
 */
const TreeNode: React.FC<{
  node: DepTreeNode;
  depth: number;
  isLast: boolean;
  prefix: string;
  onSelect: (id: string) => void;
}> = ({ node, depth, isLast, prefix, onSelect }) => {
  const connector = depth === 0 ? '' : isLast ? ' \u2514\u2500 ' : ' \u251C\u2500 ';
  const childPrefix = depth === 0 ? '' : prefix + (isLast ? '    ' : ' \u2502  ');

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -5 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: depth * 0.05 }}
        onClick={() => onSelect(node.id)}
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-secondary/30 rounded transition-colors"
      >
        <code className="text-muted-foreground/40 text-xs whitespace-pre font-mono select-none">
          {prefix}{connector}
        </code>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[node.status]}`} />
        <code className="text-xs text-muted-foreground font-mono">{node.id}</code>
        <span className={`text-xs truncate ${node.status === 'closed' ? 'text-muted-foreground line-through' : 'text-foreground/80'}`}>
          {node.title}
        </span>
        {node.isCycle && (
          <span className="text-xs text-red-400 flex items-center gap-0.5 flex-shrink-0">
            <AlertTriangle className="w-3 h-3" />
            cycle
          </span>
        )}
      </motion.div>
      {node.children.map((child, i) => (
        <TreeNode
          key={child.id + '-' + i}
          node={child}
          depth={depth + 1}
          isLast={i === node.children.length - 1}
          prefix={childPrefix}
          onSelect={onSelect}
        />
      ))}
    </>
  );
};

export const DepGraph: React.FC<DepGraphProps> = ({
  tickets,
  depTree,
  depTreeRootId,
  onRequestTree,
  onSelect,
}) => {
  const [selectedRoot, setSelectedRoot] = useState<string>('');

  // Find tickets that have deps or are depended on (involved in dependency graph)
  const graphTickets = tickets.filter(t =>
    t.deps.length > 0 || tickets.some(other => other.deps.includes(t.id))
  );

  // Find root-level tickets (have deps but nothing depends on them)
  const rootTickets = graphTickets.filter(t =>
    t.deps.length > 0 && !tickets.some(other => other.deps.includes(t.id))
  );

  const handleSelectRoot = (id: string) => {
    setSelectedRoot(id);
    onRequestTree(id);
  };

  return (
    <div className="space-y-4">
      {/* Root selector */}
      <div>
        <div className="flex items-center gap-2 px-1 py-2 mb-2">
          <GitBranch className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-foreground">Dependency Graph</span>
        </div>

        {graphTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
              <GitBranch className="w-6 h-6 text-purple-500/50" />
            </div>
            <p className="text-sm text-muted-foreground">No dependency relationships</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add dependencies between tickets to see the graph
            </p>
          </div>
        ) : (
          <>
            {/* Root ticket picker */}
            <div className="mb-3">
              <label className="text-xs text-muted-foreground mb-1.5 block">Select root ticket:</label>
              <div className="flex flex-wrap gap-1.5">
                {(rootTickets.length > 0 ? rootTickets : graphTickets).map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectRoot(t.id)}
                    className={`
                      inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-all
                      ${selectedRoot === t.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                      }
                    `}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[t.status]}`} />
                    <code className="font-mono">{t.id}</code>
                  </button>
                ))}
              </div>
            </div>

            {/* Tree view */}
            {depTree && depTreeRootId === selectedRoot ? (
              <div className="rounded-lg border border-border bg-secondary/10 p-3 font-mono text-sm overflow-x-auto">
                <TreeNode
                  node={depTree}
                  depth={0}
                  isLast={true}
                  prefix=""
                  onSelect={onSelect}
                />
              </div>
            ) : selectedRoot ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin mr-2" />
                <span className="text-xs text-muted-foreground">Loading tree...</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60 text-center py-4 italic">
                Select a ticket above to view its dependency tree
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 px-1">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" /> Open
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" /> In Progress
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" /> Closed
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
