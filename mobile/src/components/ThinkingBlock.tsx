import React, { useState } from 'react';

interface ThinkingBlockProps {
  thinking: string;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ thinking }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="thinking-block">
      <div className="thinking-block__header" onClick={() => setIsOpen(!isOpen)}>
        <span className={`thinking-block__chevron ${isOpen ? 'thinking-block__chevron--open' : ''}`}>
          {'\u25B6'}
        </span>
        <span className="thinking-block__label">Thinking...</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {thinking.length} chars
        </span>
      </div>
      {isOpen && (
        <div className="thinking-block__content">
          {thinking}
        </div>
      )}
    </div>
  );
};
