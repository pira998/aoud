import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Bug, Lightbulb, CheckSquare, Layers, Wrench } from 'lucide-react';
import type { TicketType, TicketPriority } from '../../../../shared/ticket-types';

interface CreateTicketProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    body?: string;
    ticketType?: TicketType;
    priority?: TicketPriority;
  }) => void;
}

const TYPES: { id: TicketType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'task', label: 'Task', icon: CheckSquare, color: 'text-blue-400' },
  { id: 'bug', label: 'Bug', icon: Bug, color: 'text-red-400' },
  { id: 'feature', label: 'Feature', icon: Lightbulb, color: 'text-yellow-400' },
  { id: 'epic', label: 'Epic', icon: Layers, color: 'text-purple-400' },
  { id: 'chore', label: 'Chore', icon: Wrench, color: 'text-gray-400' },
];

const PRIORITIES: { id: TicketPriority; label: string; color: string }[] = [
  { id: 0, label: 'Critical', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { id: 1, label: 'High', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { id: 2, label: 'Medium', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { id: 3, label: 'Low', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { id: 4, label: 'Backlog', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
];

export const CreateTicket: React.FC<CreateTicketProps> = ({ isOpen, onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('task');
  const [priority, setPriority] = useState<TicketPriority>(2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onCreate({
      title: title.trim(),
      body: body.trim() || undefined,
      ticketType,
      priority,
    });

    // Reset form
    setTitle('');
    setBody('');
    setTicketType('task');
    setPriority(2);
    onClose();
  };

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
            className="bg-card border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                New Ticket
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm
                    text-foreground placeholder:text-muted-foreground/50
                    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTicketType(t.id)}
                        className={`
                          inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                          border transition-all
                          ${ticketType === t.id
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                          }
                        `}
                      >
                        <Icon className={`w-3.5 h-3.5 ${ticketType === t.id ? 'text-primary' : t.color}`} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Priority selector */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      className={`
                        px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${priority === p.id
                          ? `${p.color} border-current`
                          : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                        }
                      `}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Description <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Add details, acceptance criteria, or notes..."
                  rows={3}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm
                    text-foreground placeholder:text-muted-foreground/50 resize-none
                    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-border
                    text-muted-foreground hover:bg-secondary/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg
                    bg-primary text-primary-foreground hover:bg-primary/90 transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Create Ticket
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
