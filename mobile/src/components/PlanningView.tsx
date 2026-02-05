import React, { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Play, Pause } from 'lucide-react';
import type { PermissionMode } from '../hooks/useWebSocket';

interface PlanningViewProps {
  thinkingText: string;
  permissionMode: PermissionMode;
  isProcessing: boolean;
  onSetMode: (mode: PermissionMode) => void;
  onExitPlanMode: () => void;
}

export function PlanningView({
  thinkingText,
  permissionMode,
  isProcessing,
  onSetMode,
  onExitPlanMode,
}: PlanningViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const isPlanMode = permissionMode === 'plan';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-750"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-gray-200">
            {isPlanMode ? 'Planning Mode' : 'Thinking'}
          </span>
          {isProcessing && thinkingText && (
            <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full animate-pulse">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {thinkingText && (
            <span className="text-xs text-gray-400">
              {thinkingText.length} chars
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="px-3 py-2 border-t border-gray-700 bg-gray-850">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Mode:</span>
          <div className="flex gap-1">
            <button
              onClick={() => onSetMode('default')}
              className={`px-3 py-1 text-xs rounded ${
                permissionMode === 'default'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Default
            </button>
            <button
              onClick={() => onSetMode('plan')}
              className={`px-3 py-1 text-xs rounded ${
                permissionMode === 'plan'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Plan
            </button>
            <button
              onClick={() => onSetMode('acceptEdits')}
              className={`px-3 py-1 text-xs rounded ${
                permissionMode === 'acceptEdits'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Auto-Accept
            </button>
          </div>
        </div>
      </div>

      {/* Thinking Content */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          {thinkingText ? (
            <div className="p-3 max-h-64 overflow-y-auto">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                {thinkingText}
                {isProcessing && (
                  <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />
                )}
              </pre>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              {isPlanMode
                ? 'Send a prompt to see the plan...'
                : 'No thinking content yet. Enable extended thinking to see model reasoning.'}
            </div>
          )}
        </div>
      )}

      {/* Exit Plan Mode Button */}
      {isPlanMode && thinkingText && !isProcessing && (
        <div className="p-3 border-t border-gray-700 bg-gray-850">
          <button
            onClick={onExitPlanMode}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Execute Plan
          </button>
        </div>
      )}

      {/* Stop Button when processing in plan mode */}
      {isPlanMode && isProcessing && (
        <div className="p-3 border-t border-gray-700 bg-gray-850">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Pause className="w-4 h-4 animate-pulse" />
            Planning in progress...
          </div>
        </div>
      )}
    </div>
  );
}
