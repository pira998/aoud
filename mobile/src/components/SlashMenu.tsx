import React, { useEffect, useRef } from 'react';
import type { SlashCommand } from '../../../shared/types';

interface SlashMenuProps {
  commands: SlashCommand[];
  filter: string;
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
}

export const SlashMenu: React.FC<SlashMenuProps> = ({ commands, filter, activeIndex, onSelect }) => {
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className="slash-menu" ref={listRef}>
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          className={`slash-menu__item ${i === activeIndex ? 'slash-menu__item--active' : ''}`}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => {}}
        >
          <span className="slash-menu__item-name">/{cmd.name}</span>
          <span className="slash-menu__item-desc">{cmd.description}</span>
          {cmd.argumentHint && (
            <span className="slash-menu__item-hint">{cmd.argumentHint}</span>
          )}
        </div>
      ))}
    </div>
  );
};
