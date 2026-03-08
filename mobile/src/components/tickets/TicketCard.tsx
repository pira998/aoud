import React from 'react';
import { motion } from 'framer-motion';
import {
  Bug, Lightbulb, CheckSquare, Layers, Wrench,
  ArrowRight, Link2, GitBranch, Clock,
  AlertCircle, ArrowUp, Minus, ArrowDown, Archive
} from 'lucide-react';
import type { Ticket, TicketPriority, TicketType } from '../../../../shared/ticket-types';

interface TicketCardProps {
  ticket: Ticket;
  isBlocked?: boolean;
  blockers?: string[];
  onSelect: (ticketId: string) => void;
  onStart?: (ticketId: string) => void;
  onClose?: (ticketId: string) => void;
  compact?: boolean;
}

const PRIORITY_CONFIG: Record<TicketPriority, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  0: { icon: AlertCircle, label: 'Critical', color: 'text-red-400', bgColor: 'bg-red-500/15' },
  1: { icon: ArrowUp, label: 'High', color: 'text-orange-400', bgColor: 'bg-orange-500/15' },
  2: { icon: Minus, label: 'Medium', color: 'text-yellow-400', bgColor: 'bg-yellow-500/15' },
  3: { icon: ArrowDown, label: 'Low', color: 'text-blue-400', bgColor: 'bg-blue-500/15' },
  4: { icon: Archive, label: 'Backlog', color: 'text-gray-400', bgColor: 'bg-gray-500/15' },
};

const TYPE_CONFIG: Record<TicketType, { icon: React.ElementType; color: string }> = {
  bug: { icon: Bug, color: 'text-red-400' },
  feature: { icon: Lightbulb, color: 'text-yellow-400' },
  task: { icon: CheckSquare, color: 'text-blue-400' },
  epic: { icon: Layers, color: 'text-purple-400' },
  chore: { icon: Wrench, color: 'text-gray-400' },
};

const STATUS_CONFIG = {
  open: { dot: 'bg-yellow-500', label: 'Open' },
  in_progress: { dot: 'bg-blue-500 animate-pulse', label: 'In Progress' },
  closed: { dot: 'bg-green-500', label: 'Closed' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  isBlocked = false,
  blockers = [],
  onSelect,
  onStart,
  onClose,
  compact = false,
}) => {
  const priority = PRIORITY_CONFIG[ticket.priority];
  const typeConfig = TYPE_CONFIG[ticket.type];
  const status = STATUS_CONFIG[ticket.status];
  const PriorityIcon = priority.icon;
  const TypeIcon = typeConfig.icon;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(ticket.id)}
      className={`
        ticket-card relative cursor-pointer rounded-lg border transition-all
        ${ticket.status === 'closed'
          ? 'border-border/30 bg-card/30 opacity-70'
          : isBlocked
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card/70'
        }
        ${compact ? 'px-3 py-2' : 'px-4 py-3'}
      `}
    >
      {/* Top row: Priority + ID + Status dot */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${priority.bgColor} ${priority.color}`}>
            <PriorityIcon className="w-3 h-3" />
            {!compact && priority.label}
          </span>
          <code className="text-xs text-muted-foreground font-mono">{ticket.id}</code>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${status.dot}`} />
          {!compact && <span className="text-xs text-muted-foreground">{status.label}</span>}
        </div>
      </div>

      {/* Title */}
      <h3 className={`font-medium text-sm leading-snug ${ticket.status === 'closed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        {ticket.title}
      </h3>

      {/* Meta row */}
      {!compact && (
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className={`inline-flex items-center gap-1 ${typeConfig.color}`}>
            <TypeIcon className="w-3 h-3" />
            {ticket.type}
          </span>
          {ticket.deps.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {ticket.deps.length} dep{ticket.deps.length > 1 ? 's' : ''}
            </span>
          )}
          {ticket.links.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              {ticket.links.length}
            </span>
          )}
          {ticket.assignee && (
            <span className="truncate max-w-[80px]">@{ticket.assignee}</span>
          )}
          <span className="inline-flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" />
            {timeAgo(ticket.created)}
          </span>
        </div>
      )}

      {/* Blocked indicator */}
      {isBlocked && blockers.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-red-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>Blocked by: {blockers.join(', ')}</span>
        </div>
      )}

      {/* Action buttons (for ready queue) */}
      {(onStart || onClose) && !compact && (
        <div className="flex items-center gap-2 mt-2.5" onClick={(e) => e.stopPropagation()}>
          {onStart && ticket.status === 'open' && (
            <button
              onClick={() => onStart(ticket.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md
                bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
            >
              <ArrowRight className="w-3 h-3" />
              Start
            </button>
          )}
          {onClose && ticket.status === 'in_progress' && (
            <button
              onClick={() => onClose(ticket.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md
                bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
            >
              <CheckSquare className="w-3 h-3" />
              Close
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
