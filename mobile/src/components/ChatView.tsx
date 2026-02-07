import { useState, useRef, useEffect } from 'react';
import { Send, StopCircle, Bot, User, Info } from 'lucide-react';
import type { ChatMessage } from '../hooks/useWebSocket';

interface ChatViewProps {
  messages: ChatMessage[];
  streamingText: string;
  isProcessing: boolean;
  isConnected: boolean;
  onSendPrompt: (text: string, projectPath?: string) => void;
  onInterrupt: () => void;
}

export function ChatView({
  messages,
  streamingText,
  isProcessing,
  isConnected,
  onSendPrompt,
  onInterrupt,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected || isProcessing) return;

    onSendPrompt(input.trim());
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingText && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ready to code</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {isConnected
                ? 'Send a prompt to start working on your project.'
                : 'Connect to the bridge server to get started.'}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {streamingText && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="rounded-lg px-4 py-2 text-sm bg-secondary">
                <span className="whitespace-pre-wrap break-words">{streamingText}</span>
                <span className="streaming-cursor" />
              </div>
              <span className="text-xs text-muted-foreground mt-1">streaming...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border bg-card p-4 safe-area-bottom">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Type your prompt...' : 'Not connected'}
            disabled={!isConnected}
            rows={1}
            className="flex-1 resize-none px-4 py-3 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          {isProcessing ? (
            <button
              type="button"
              onClick={onInterrupt}
              className="px-4 py-3 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              <StopCircle className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!isConnected || !input.trim()}
              className="px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-5 w-5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-secondary'
            : isSystem
            ? 'bg-muted'
            : 'bg-primary'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : isSystem ? (
          <Info className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div
          className={`rounded-lg px-4 py-2 text-sm max-w-[85%] ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : isSystem
              ? 'bg-muted text-muted-foreground italic'
              : 'bg-secondary'
          }`}
        >
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        </div>
        <span className="text-xs text-muted-foreground mt-1 block">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
