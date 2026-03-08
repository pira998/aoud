import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SlashMenu } from './SlashMenu';
import { useUIStore } from '../store/uiStore';
import type { SlashCommand } from '../../../shared/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageSquare, TerminalSquare, Square } from 'lucide-react';

interface MessageInputProps {
  onSubmit: (text: string) => void;
  isProcessing: boolean;
  slashCommands: SlashCommand[];
  onClearTerminal?: () => void;
  onExecuteSlashCommand?: (command: string, args?: string) => void;
  // Terminal mode props
  onTerminalCommand?: (command: string) => void;
  isTerminalRunning?: boolean;
  onTerminalInterrupt?: () => void;
  // Spotlight search
  onSpotlightOpen?: () => void;
  // External text insertion (e.g., from spotlight file select)
  insertText?: string | null;
  onInsertTextConsumed?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSubmit,
  isProcessing,
  slashCommands,
  onClearTerminal,
  onExecuteSlashCommand,
  onTerminalCommand,
  isTerminalRunning,
  onTerminalInterrupt,
  onSpotlightOpen,
  insertText,
  onInsertTextConsumed,
}) => {
  const [input, setInput] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use UI store for input history and input mode
  const addToHistory = useUIStore((s) => s.addToHistory);
  const navigateHistoryUp = useUIStore((s) => s.navigateHistoryUp);
  const navigateHistoryDown = useUIStore((s) => s.navigateHistoryDown);
  const resetHistoryIndex = useUIStore((s) => s.resetHistoryIndex);
  const inputMode = useUIStore((s) => s.inputMode);
  const toggleInputMode = useUIStore((s) => s.toggleInputMode);

  const isTerminalMode = inputMode === 'terminal';
  const isBusy = isProcessing || isTerminalRunning;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Re-focus after processing completes
  useEffect(() => {
    if (!isBusy) {
      textareaRef.current?.focus();
    }
  }, [isBusy]);

  // Handle external text insertion (e.g., file reference from spotlight)
  useEffect(() => {
    if (insertText && onInsertTextConsumed) {
      setInput(prev => prev + insertText);
      onInsertTextConsumed();
      textareaRef.current?.focus();
    }
  }, [insertText, onInsertTextConsumed]);

  const filteredCommands = slashCommands.filter((cmd) =>
    cmd.name.toLowerCase().includes(slashFilter.toLowerCase())
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    resetHistoryIndex();

    // Detect @ symbol to open spotlight search (only in Claude mode)
    if (!isTerminalMode && val.endsWith('@') && onSpotlightOpen) {
      // Remove the @ from input and open spotlight
      setInput(val.slice(0, -1));
      onSpotlightOpen();
      return;
    }

    // Detect slash commands (only in Claude mode)
    if (!isTerminalMode && val.startsWith('/') && !val.includes(' ')) {
      setShowSlashMenu(true);
      setSlashFilter(val.slice(1));
      setSlashActiveIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [resetHistoryIndex, isTerminalMode, onSpotlightOpen]);

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    setShowSlashMenu(false);

    // Handle client-side commands
    if (cmd.name === 'clear') {
      if (onClearTerminal) {
        onClearTerminal();
      }
      setInput('');
      return;
    }

    // Built-in server commands - use execute_slash_command message
    const builtinServerCommands = ['help', 'status', 'cost'];
    if (builtinServerCommands.includes(cmd.name)) {
      if (onExecuteSlashCommand) {
        setInput('');
        addToHistory(`/${cmd.name}`);
        onExecuteSlashCommand(cmd.name);
      }
      return;
    }

    // SDK commands like /commit, /review-pr - send as regular prompts
    // Claude recognizes these and executes them via the Skill tool
    setInput('');
    addToHistory(`/${cmd.name}`);
    onSubmit(`/${cmd.name}`);
  }, [onClearTerminal, onExecuteSlashCommand, addToHistory, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Slash menu navigation
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActiveIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (filteredCommands[slashActiveIndex]) {
          handleSlashSelect(filteredCommands[slashActiveIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (filteredCommands[slashActiveIndex]) {
          setInput(`/${filteredCommands[slashActiveIndex].name} `);
          setShowSlashMenu(false);
        }
        return;
      }
    }

    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isBusy) {
        const trimmed = input.trim();
        addToHistory(trimmed);

        if (isTerminalMode && onTerminalCommand) {
          onTerminalCommand(trimmed);
        } else if (trimmed.startsWith('$ ') && onTerminalCommand) {
          // Inline prefix shortcut: "$ command" in Claude mode runs as terminal
          onTerminalCommand(trimmed.slice(2).trim());
        } else {
          onSubmit(trimmed);
        }
        setInput('');
      }
      return;
    }

    // Input history navigation
    if (e.key === 'ArrowUp' && input === '' && !showSlashMenu) {
      e.preventDefault();
      const historyItem = navigateHistoryUp();
      if (historyItem) {
        setInput(historyItem);
      }
      return;
    }

    if (e.key === 'ArrowDown' && !showSlashMenu) {
      e.preventDefault();
      const historyItem = navigateHistoryDown();
      if (historyItem !== null) {
        setInput(historyItem);
      }
      return;
    }

    // Escape to clear
    if (e.key === 'Escape') {
      setInput('');
      setShowSlashMenu(false);
    }
  }, [
    showSlashMenu,
    filteredCommands,
    slashActiveIndex,
    input,
    isBusy,
    isTerminalMode,
    handleSlashSelect,
    addToHistory,
    navigateHistoryUp,
    navigateHistoryDown,
    onSubmit,
    onTerminalCommand,
  ]);

  const placeholder = isTerminalRunning
    ? 'Command running...'
    : isProcessing
    ? 'Waiting for response...'
    : isTerminalMode
    ? 'Type a command... (e.g. ls -la, git status)'
    : 'Type your message... (/ for commands)';

  return (
    <div className="relative px-4 py-3 border-t border-border/50 bg-card/60 backdrop-blur-lg">
      {showSlashMenu && (
        <SlashMenu
          commands={filteredCommands}
          filter={slashFilter}
          activeIndex={slashActiveIndex}
          onSelect={handleSlashSelect}
        />
      )}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end gap-2 max-w-4xl mx-auto"
      >
        <div className="flex-1 relative">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/30 border backdrop-blur-xl transition-all focus-within:shadow-lg focus-within:scale-[1.01] ${
            isTerminalMode
              ? 'border-cyan-500/30 focus-within:ring-2 focus-within:ring-cyan-500/20 focus-within:border-cyan-500/40'
              : 'border-border/50 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40'
          }`}>
            {/* Mode Toggle Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleInputMode}
              className={`flex-shrink-0 p-1 rounded-lg transition-colors ${
                isTerminalMode
                  ? 'text-cyan-400 hover:bg-cyan-500/10'
                  : 'text-muted-foreground hover:bg-primary/10'
              }`}
              title={isTerminalMode ? 'Switch to Claude mode' : 'Switch to Terminal mode'}
            >
              <AnimatePresence mode="wait">
                {isTerminalMode ? (
                  <motion.div
                    key="terminal"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <TerminalSquare className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="claude"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Terminal mode prefix indicator */}
            {isTerminalMode && (
              <span className="text-cyan-400 font-mono text-sm font-bold flex-shrink-0">$</span>
            )}

            <textarea
              ref={textareaRef}
              className={`flex-1 bg-transparent border-none outline-none placeholder:text-muted-foreground resize-none text-sm ${
                isTerminalMode ? 'font-mono text-cyan-100' : 'font-sans text-foreground'
              }`}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isProcessing}
              rows={1}
              spellCheck={false}
              autoComplete="off"
              style={{
                minHeight: '24px',
                maxHeight: '200px',
              }}
            />
          </div>
        </div>

        {/* Send / Stop Button */}
        {isTerminalRunning && onTerminalInterrupt ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-3 rounded-xl bg-red-500/80 text-white font-medium text-sm transition-all flex items-center gap-2 shadow-lg hover:shadow-xl hover:bg-red-500"
            onClick={onTerminalInterrupt}
          >
            <Square className="h-4 w-4 fill-current" />
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`px-4 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl ${
              isTerminalMode
                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                : 'bg-primary text-primary-foreground'
            }`}
            onClick={() => {
              if (input.trim() && !isBusy) {
                const trimmed = input.trim();
                addToHistory(trimmed);
                if (isTerminalMode && onTerminalCommand) {
                  onTerminalCommand(trimmed);
                } else if (trimmed.startsWith('$ ') && onTerminalCommand) {
                  onTerminalCommand(trimmed.slice(2).trim());
                } else {
                  onSubmit(trimmed);
                }
                setInput('');
              }
            }}
            disabled={!input.trim() || isBusy}
          >
            {isProcessing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Send className="h-4 w-4" />
              </motion.div>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </motion.button>
        )}
      </motion.div>
    </div>
  );
};
