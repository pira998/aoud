import React, { useState, useRef, useEffect } from 'react';
import type { ToolCall, ApprovalRequestBlock } from '../types';
import { ToolCallDisplay } from './ToolCallDisplay';
import './AgentContainer.css';

interface AgentContainerProps {
  agentId: string;
  agentType: string;
  description: string;
  toolCalls: ToolCall[];
  approvalBlocks: ApprovalRequestBlock[];
  isActive: boolean;
  renderApprovalBlock?: (block: ApprovalRequestBlock) => React.ReactNode;
}

function getAgentIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('explore')) return '\u{1F50D}';
  if (t.includes('plan')) return '\u{1F4DD}';
  if (t.includes('bash')) return '$';
  if (t.includes('general')) return '\u{1F916}';
  return '\u{1F4E6}';
}

function getAgentTypeName(type: string): string {
  if (type === 'Explore') return 'Explore';
  if (type === 'Plan') return 'Plan';
  if (type === 'Bash') return 'Bash';
  if (type === 'general-purpose') return 'General';
  return type;
}

export const AgentContainer: React.FC<AgentContainerProps> = ({
  agentId,
  agentType,
  description,
  toolCalls,
  approvalBlocks,
  isActive,
  renderApprovalBlock,
}) => {
  // Collapsed by default — only auto-expand if there are pending approvals
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const icon = getAgentIcon(agentType);
  const typeName = getAgentTypeName(agentType);

  const completedTools = toolCalls.filter(t => t.status === 'done').length;
  const failedTools = toolCalls.filter(t => t.status === 'error').length;
  const runningTools = toolCalls.filter(t => t.status === 'running').length;
  const totalTools = toolCalls.length;
  const hasPendingApprovals = approvalBlocks.some(b => !b.resolved);

  // Auto-expand when there's a pending approval
  useEffect(() => {
    if (hasPendingApprovals && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasPendingApprovals]);

  // Measure content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [toolCalls, approvalBlocks, isExpanded]);

  // Progress percentage
  const progress = totalTools > 0 ? Math.round((completedTools / totalTools) * 100) : 0;

  // Latest tool name for compact display
  const latestTool = toolCalls.length > 0 ? toolCalls[toolCalls.length - 1] : null;
  const latestToolLabel = latestTool
    ? `${latestTool.toolName}${latestTool.status === 'running' ? '...' : ''}`
    : null;

  return (
    <div
      className={`ac ${isActive ? 'ac--active' : 'ac--done'} ${isExpanded ? 'ac--open' : ''} ${hasPendingApprovals ? 'ac--approval' : ''}`}
      data-agent-id={agentId}
    >
      {/* Compact header row */}
      <div className="ac__header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="ac__left">
          <span className="ac__icon">{icon}</span>
          <span className="ac__type">{typeName}</span>
          <span className="ac__desc">{description}</span>
        </div>
        <div className="ac__right">
          {/* Inline progress */}
          {isActive && runningTools > 0 && latestToolLabel && !isExpanded && (
            <span className="ac__current">{latestToolLabel}</span>
          )}
          {totalTools > 0 && (
            <span className="ac__count">
              {completedTools}/{totalTools}
            </span>
          )}
          {/* Mini progress bar */}
          {totalTools > 0 && !isExpanded && (
            <div className="ac__progress">
              <div
                className={`ac__progress-fill ${isActive ? 'ac__progress-fill--active' : ''}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {failedTools > 0 && (
            <span className="ac__err">{failedTools}</span>
          )}
          {isActive && <span className="ac__pulse" />}
          <span className={`ac__chevron ${isExpanded ? 'ac__chevron--open' : ''}`}>
            {'\u25B8'}
          </span>
        </div>
      </div>

      {/* Expandable content with smooth height animation */}
      <div
        className="ac__body"
        style={{
          maxHeight: isExpanded ? (contentHeight || 2000) : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="ac__inner">
          {toolCalls.length === 0 && approvalBlocks.length === 0 && (
            <div className="ac__empty">Initializing...</div>
          )}
          {/* Render tools with their approval blocks attached directly below */}
          {toolCalls.map((tc) => {
            // Find approval block that matches this tool (same tool name + running status)
            const matchingApproval = approvalBlocks.find(
              (ab) => ab.tool === tc.toolName && tc.status === 'running'
            );
            return (
              <React.Fragment key={tc.id}>
                <div className="ac__tool">
                  <ToolCallDisplay toolCall={tc} />
                </div>
                {matchingApproval && (
                  <div className="ac__tool ac__tool--approval">
                    {renderApprovalBlock ? renderApprovalBlock(matchingApproval) : (
                      <div className="ac__approval-fallback">Approval: {matchingApproval.tool}</div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {/* Render any unmatched approval blocks (fallback) */}
          {approvalBlocks
            .filter((ab) => !toolCalls.some((tc) => tc.toolName === ab.tool && tc.status === 'running'))
            .map((block) => (
              <div key={block.id} className="ac__tool ac__tool--approval">
                {renderApprovalBlock ? renderApprovalBlock(block) : (
                  <div className="ac__approval-fallback">Approval: {block.tool}</div>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
};
