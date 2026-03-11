import React from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface Task {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  timestamp: string;
}

interface TaskListProps {
  tasks: Task[];
}

export const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="border border-border rounded-lg bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-secondary/50 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-semibold text-sm text-foreground">Tasks</span>
          <span className="text-xs text-muted-foreground">
            ({tasks.filter(t => t.status === 'completed').length}/{tasks.length} complete)
          </span>
        </div>
      </div>

      {/* Task List */}
      <div className="divide-y divide-border">
        {tasks.map((task, index) => (
          <div
            key={task.id}
            className="px-4 py-3 hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {task.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : task.status === 'in_progress' ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/50" />
                )}
              </div>

              {/* Task Content */}
              <div className="flex-1 min-w-0">
                {/* Task Number and Subject */}
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground text-sm font-mono">
                    #{index + 1}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      task.status === 'completed'
                        ? 'line-through text-muted-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {task.subject}
                  </span>
                </div>

                {/* Active Form (for in-progress tasks) */}
                {task.status === 'in_progress' && task.activeForm && (
                  <div className="mt-1 text-xs text-blue-400 flex items-center gap-1">
                    <span>→</span>
                    <span>{task.activeForm}</span>
                  </div>
                )}

                {/* Description (if available and not completed) */}
                {task.description && task.status !== 'completed' && (
                  <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {task.description}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
