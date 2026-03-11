import React, { useState } from 'react';

interface TodoPanelProps {
  tasks: Array<{
    id: string;
    subject: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm?: string;
  }>;
}

export const TodoPanel: React.FC<TodoPanelProps> = ({ tasks }) => {
  const [isOpen, setIsOpen] = useState(true);
  const todos = tasks; // Map tasks to todos for compatibility

  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const total = todos.length;

  return (
    <div className="todo-panel">
      <div className="todo-panel__header" onClick={() => setIsOpen(!isOpen)}>
        <span>{'\u25B6'}</span>
        <span>Tasks</span>
        <span className="todo-panel__count">
          {completed}/{total} completed{inProgress > 0 ? ` \u2022 ${inProgress} in progress` : ''}
        </span>
      </div>
      {isOpen && (
        <div className="todo-panel__items">
          {todos.map((todo, i) => (
            <div key={i} className="todo-item">
              <span className={`todo-item__icon todo-item__icon--${todo.status}`}>
                {todo.status === 'completed' ? '\u2713' : todo.status === 'in_progress' ? '\u25CF' : '\u25CB'}
              </span>
              <span className={`todo-item__text todo-item__text--${todo.status}`}>
                {todo.status === 'in_progress' ? todo.activeForm : todo.subject}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
