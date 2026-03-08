import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Play, CheckCircle2, RotateCcw, Trash2, GitBranch,
  Link2, Clock, User, Tag, AlertCircle, ArrowUp, Minus,
  ArrowDown, Archive, Bug, Lightbulb, CheckSquare, Layers, Wrench,
} from 'lucide-react';
import type { Ticket, TicketPriority, TicketType } from '../../../../shared/ticket-types';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface TicketDetailProps {
  ticket: Ticket | null;
  isOpen: boolean;
  allTickets: Ticket[];
  onClose: () => void;
  onStart: (ticketId: string) => void;
  onCloseTicket: (ticketId: string) => void;
  onReopen: (ticketId: string) => void;
  onDelete: (ticketId: string) => void;
}

const PRIORITY_CONFIG: Record<TicketPriority, { icon: React.ElementType; label: string; color: string }> = {
  0: { icon: AlertCircle, label: 'Critical', color: 'text-red-400' },
  1: { icon: ArrowUp, label: 'High', color: 'text-orange-400' },
  2: { icon: Minus, label: 'Medium', color: 'text-yellow-400' },
  3: { icon: ArrowDown, label: 'Low', color: 'text-blue-400' },
  4: { icon: Archive, label: 'Backlog', color: 'text-gray-400' },
};

const TYPE_CONFIG: Record<TicketType, { icon: React.ElementType; label: string; color: string }> = {
  bug: { icon: Bug, label: 'Bug', color: 'text-red-400' },
  feature: { icon: Lightbulb, label: 'Feature', color: 'text-yellow-400' },
  task: { icon: CheckSquare, label: 'Task', color: 'text-blue-400' },
  epic: { icon: Layers, label: 'Epic', color: 'text-purple-400' },
  chore: { icon: Wrench, label: 'Chore', color: 'text-gray-400' },
};

const STATUS_BADGE = {
  open: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'Open' },
  in_progress: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'In Progress' },
  closed: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Closed' },
};

export const TicketDetail: React.FC<TicketDetailProps> = ({
  ticket,
  isOpen,
  allTickets,
  onClose,
  onStart,
  onCloseTicket,
  onReopen,
  onDelete,
}) => {
  if (!ticket) return null;

  const priority = PRIORITY_CONFIG[ticket.priority];
  const typeConfig = TYPE_CONFIG[ticket.type];
  const statusBadge = STATUS_BADGE[ticket.status];
  const PriorityIcon = priority.icon;
  const TypeIcon = typeConfig.icon;

  const depTickets = ticket.deps
    .map(id => allTickets.find(t => t.id === id))
    .filter(Boolean) as Ticket[];

  const linkedTickets = ticket.links
    .map(id => allTickets.find(t => t.id === id))
    .filter(Boolean) as Ticket[];

  const childTickets = allTickets.filter(t => t.parent === ticket.id);

  const blockingTickets = allTickets.filter(t => t.deps.includes(ticket.id));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="bg-card border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card/95 backdrop-blur-sm z-10">
              <div className="flex items-center gap-2 min-w-0">
                <code className="text-xs text-muted-foreground font-mono">{ticket.id}</code>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                  {statusBadge.label}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Title */}
              <h2 className="text-lg font-semibold text-foreground leading-snug">
                {ticket.title}
              </h2>

              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-secondary/50 ${priority.color}`}>
                  <PriorityIcon className="w-3 h-3" />
                  {priority.label}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-secondary/50 ${typeConfig.color}`}>
                  <TypeIcon className="w-3 h-3" />
                  {typeConfig.label}
                </span>
                {ticket.assignee && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-secondary/50 text-muted-foreground">
                    <User className="w-3 h-3" />
                    {ticket.assignee}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-secondary/50 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {new Date(ticket.created).toLocaleDateString()}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {ticket.status === 'open' && (
                  <button
                    onClick={() => onStart(ticket.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                      bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Working
                  </button>
                )}
                {ticket.status === 'in_progress' && (
                  <button
                    onClick={() => onCloseTicket(ticket.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                      bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Close
                  </button>
                )}
                {ticket.status === 'closed' && (
                  <button
                    onClick={() => onReopen(ticket.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                      bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reopen
                  </button>
                )}
                <button
                  onClick={() => { onDelete(ticket.id); onClose(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                    bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>

              {/* Body / Description */}
              {ticket.body && (
                <div className="rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Description</div>
                  <div className="text-sm text-foreground/90 prose prose-invert prose-sm max-w-none">
                    <MarkdownRenderer content={ticket.body} />
                  </div>
                </div>
              )}

              {/* Dependencies */}
              {depTickets.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                    <GitBranch className="w-3.5 h-3.5" />
                    Dependencies ({depTickets.length})
                  </div>
                  <div className="space-y-1.5">
                    {depTickets.map(dep => (
                      <div key={dep.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 text-sm">
                        <div className={`w-2 h-2 rounded-full ${dep.status === 'closed' ? 'bg-green-500' : dep.status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-500'}`} />
                        <code className="text-xs text-muted-foreground">{dep.id}</code>
                        <span className="text-foreground/80 truncate">{dep.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blocking (what this ticket blocks) */}
              {blockingTickets.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                    Blocking ({blockingTickets.length})
                  </div>
                  <div className="space-y-1.5">
                    {blockingTickets.map(bt => (
                      <div key={bt.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-500/20 text-sm">
                        <code className="text-xs text-muted-foreground">{bt.id}</code>
                        <span className="text-foreground/80 truncate">{bt.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Children */}
              {childTickets.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                    <Tag className="w-3.5 h-3.5" />
                    Children ({childTickets.length})
                  </div>
                  <div className="space-y-1.5">
                    {childTickets.map(child => (
                      <div key={child.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 text-sm">
                        <div className={`w-2 h-2 rounded-full ${child.status === 'closed' ? 'bg-green-500' : child.status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-500'}`} />
                        <code className="text-xs text-muted-foreground">{child.id}</code>
                        <span className="text-foreground/80 truncate">{child.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Links */}
              {linkedTickets.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                    <Link2 className="w-3.5 h-3.5" />
                    Linked ({linkedTickets.length})
                  </div>
                  <div className="space-y-1.5">
                    {linkedTickets.map(linked => (
                      <div key={linked.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 text-sm">
                        <div className={`w-2 h-2 rounded-full ${linked.status === 'closed' ? 'bg-green-500' : linked.status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-500'}`} />
                        <code className="text-xs text-muted-foreground">{linked.id}</code>
                        <span className="text-foreground/80 truncate">{linked.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ticket.externalRef && (
                <div className="text-xs text-muted-foreground">
                  External ref: <code>{ticket.externalRef}</code>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
