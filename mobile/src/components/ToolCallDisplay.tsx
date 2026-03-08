import React, { useState, useMemo } from 'react';
import { AnsiUp } from 'ansi_up';
import type { ToolCall } from '../types';
import { DiffViewer } from './DiffViewer';
import { log } from '../lib/logger';

// Tool icons by name
function getToolIcon(name: string): { icon: string; className: string } {
  const n = name.toLowerCase();
  if (n === 'bash') return { icon: '$', className: 'tool-call__icon--bash' };
  if (n === 'read') return { icon: '\u{1F4C4}', className: 'tool-call__icon--read' };
  if (n === 'edit') return { icon: '\u270F', className: 'tool-call__icon--edit' };
  if (n === 'write') return { icon: '\u{1F4DD}', className: 'tool-call__icon--write' };
  if (n === 'glob') return { icon: '\u{1F50D}', className: 'tool-call__icon--glob' };
  if (n === 'grep') return { icon: '\u{1F50E}', className: 'tool-call__icon--grep' };
  if (n === 'webfetch' || n === 'websearch') return { icon: '\u{1F310}', className: 'tool-call__icon--web' };
  if (n === 'task') return { icon: '\u{1F916}', className: 'tool-call__icon--task' };
  if (n === 'todowrite') return { icon: '\u2713', className: 'tool-call__icon--todo' };
  if (n === 'notebookedit') return { icon: '\u{1F4D3}', className: 'tool-call__icon--default' };
  return { icon: '\u2726', className: 'tool-call__icon--default' };
}

// Get tool description text
function getToolDescription(name: string): string {
  const n = name.toLowerCase();
  if (n === 'bash') return 'Execute shell command';
  if (n === 'read') return 'Read file contents';
  if (n === 'edit') return 'Edit file with string replacement';
  if (n === 'write') return 'Write new file';
  if (n === 'glob') return 'Find files by pattern';
  if (n === 'grep') return 'Search file contents';
  if (n === 'webfetch') return 'Fetch web page content';
  if (n === 'websearch') return 'Search the web';
  if (n === 'task') return 'Launch specialized agent';
  if (n === 'todowrite') return 'Create task list';
  if (n === 'notebookedit') return 'Edit Jupyter notebook';
  return 'Tool execution';
}

// Generate summary text for tool input
function getToolSummary(name: string, input: Record<string, unknown>): string {
  const n = name.toLowerCase();
  if (n === 'bash') return String(input.command || '').slice(0, 80);
  if (n === 'read') return String(input.file_path || '').split('/').pop() || '';
  if (n === 'edit') return String(input.file_path || '').split('/').pop() || '';
  if (n === 'write') return String(input.file_path || '').split('/').pop() || '';
  if (n === 'glob') return String(input.pattern || '');
  if (n === 'grep') return String(input.pattern || '');
  if (n === 'websearch') return String(input.query || '');
  if (n === 'webfetch') return String(input.url || '').slice(0, 60);
  if (n === 'task') return String(input.description || '');
  if (n === 'todowrite') return `${((input.todos as unknown[]) || []).length} items`;
  return '';
}

// Format tool input for display
function formatToolInput(name: string, input: Record<string, unknown>): string {
  const n = name.toLowerCase();
  if (n === 'bash') return String(input.command || '');
  if (n === 'edit') {
    const fp = String(input.file_path || '');
    const old_s = String(input.old_string || '');
    const new_s = String(input.new_string || '');
    return `File: ${fp}\n\n- ${old_s}\n+ ${new_s}`;
  }
  if (n === 'read') return `File: ${input.file_path}`;
  if (n === 'write') return `File: ${input.file_path}\nContent: ${String(input.content || '').slice(0, 200)}...`;
  if (n === 'glob') return `Pattern: ${input.pattern}${input.path ? `\nPath: ${input.path}` : ''}`;
  if (n === 'grep') return `Pattern: ${input.pattern}${input.path ? `\nPath: ${input.path}` : ''}`;
  if (n === 'websearch') return `Query: ${input.query}`;
  if (n === 'webfetch') return `URL: ${input.url}\nPrompt: ${input.prompt}`;
  if (n === 'task') return `Agent: ${input.subagent_type}\nPrompt: ${String(input.prompt || '').slice(0, 200)}`;
  return JSON.stringify(input, null, 2);
}

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!toolCall) return null;

  log.debug('ToolCallDisplay', 'Rendering tool call:', {
    toolName: toolCall.toolName,
    status: toolCall.status,
    input: toolCall.input,
    output: toolCall.output,
    elapsedMs: toolCall.elapsedMs,
  });

  const { icon, className: iconClass } = getToolIcon(toolCall.toolName);
  const summary = getToolSummary(toolCall.toolName, toolCall.input);
  const inputDisplay = formatToolInput(toolCall.toolName, toolCall.input);

  const statusClass = `tool-call__status--${toolCall.status}`;
  const statusText = toolCall.status === 'running' ? 'running' : toolCall.status === 'done' ? 'done' : 'error';

  return (
    <div className={`tool-call ${toolCall.status === 'running' ? 'tool-call--running' : ''} ${toolCall.status === 'error' ? 'tool-call--error' : ''}`}>
      <div className="tool-call__header" onClick={() => setIsOpen(!isOpen)}>
        <span className={`tool-call__icon ${iconClass}`}>{icon}</span>
        <span className="tool-call__name">{toolCall.toolName}</span>
        <span className="tool-call__description">{getToolDescription(toolCall.toolName)}</span>
        {summary && <span className="tool-call__summary">{summary}</span>}
        {toolCall.status === 'running' && <span className="tool-call__spinner" />}
        <span className={`tool-call__status ${statusClass}`}>{statusText}</span>
        {toolCall.elapsedMs != null && (
          <span className="tool-call__elapsed">{toolCall.elapsedMs}ms</span>
        )}
        <span className={`tool-call__chevron ${isOpen ? 'tool-call__chevron--open' : ''}`}>
          {'\u25B6'}
        </span>
      </div>
      {isOpen && (
        <div className="tool-call__body">
          <div className="tool-call__input">
            <div className="tool-call__input-label">INPUT</div>
            <div className="tool-call__input-content">
              {toolCall.toolName.toLowerCase() === 'edit' ? (
                <DiffViewer diff={{
                  file: String(toolCall.input.file_path || ''),
                  oldContent: String(toolCall.input.old_string || ''),
                  newContent: String(toolCall.input.new_string || ''),
                  additions: String(toolCall.input.new_string || '').split('\n').length,
                  deletions: String(toolCall.input.old_string || '').split('\n').length,
                }} />
              ) : toolCall.toolName.toLowerCase() === 'write' ? (
                <DiffViewer diff={{
                  file: String(toolCall.input.file_path || ''),
                  oldContent: '',
                  newContent: String(toolCall.input.content || ''),
                  additions: String(toolCall.input.content || '').split('\n').length,
                  deletions: 0,
                }} />
              ) : (
                <pre>{inputDisplay}</pre>
              )}
            </div>
          </div>
          {(toolCall.status === 'done' || toolCall.status === 'error') && (
            <ToolOutput output={toolCall.output} toolName={toolCall.toolName} />
          )}
        </div>
      )}
    </div>
  );
};

// Render tool output with ANSI color support (Ghostty-themed)
const ToolOutput: React.FC<{ output?: string; toolName: string }> = ({ output, toolName }) => {
  const isBashLike = ['bash', 'terminal'].includes(toolName.toLowerCase());

  const renderedOutput = useMemo(() => {
    if (!output) return '(no output)';
    if (!isBashLike) return null; // non-bash tools render as plain text

    const ansiUp = new AnsiUp();
    ansiUp.use_classes = true;
    ansiUp.escape_html = true;
    return ansiUp.ansi_to_html(output);
  }, [output, isBashLike]);

  return (
    <div className="tool-call__output">
      <div className="tool-call__output-label">OUTPUT</div>
      <div className="tool-call__output-content">
        {isBashLike && renderedOutput ? (
          <pre
            style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: renderedOutput }}
          />
        ) : (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {output || '(no output)'}
          </pre>
        )}
      </div>
    </div>
  );
};

// DiffDisplay removed - now using shared DiffViewer component with unified diff format
