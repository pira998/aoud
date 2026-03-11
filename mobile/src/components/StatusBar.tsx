import React, { useState, useRef, useEffect } from 'react';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { StopCircle, Cpu, Shield, ChevronDown, Check, MessageSquare, TerminalSquare } from 'lucide-react';
import type { PermissionMode, ModelInfo } from '../../../shared/types';
import type { InputMode } from '../types';
import { useUIStore } from '../store/uiStore';

interface StatusBarProps {
  isConnected: boolean;
  isAuthenticated: boolean;
  isProcessing: boolean;
  permissionMode: string;
  costInfo?: {
    totalCostUSD: number;
    inputTokens: number;
    outputTokens: number;
    numTurns: number;
  };
  onInterrupt?: () => void;
  currentModel?: string;
  availableModels?: ModelInfo[];
  onChangeModel?: (model: string) => void;
  onSetMode?: (mode: PermissionMode) => void;
}

// Fallback models if server doesn't provide any
const FALLBACK_MODELS = [
  { id: 'sonnet', name: 'Sonnet', description: 'Fast daily coding', alias: 'sonnet' },
  { id: 'opus', name: 'Opus', description: 'Complex reasoning', alias: 'opus' },
  { id: 'haiku', name: 'Haiku', description: 'Quick & efficient', alias: 'haiku' },
];

const MODES: { id: PermissionMode; label: string; description: string }[] = [
  { id: 'default', label: 'Normal', description: 'Standard approvals' },
  { id: 'plan', label: 'Plan', description: 'Analyze only, no edits' },
  { id: 'acceptEdits', label: 'Auto-Edit', description: 'Auto-accept file edits' },
];

const INPUT_MODES: { id: InputMode; label: string; description: string }[] = [
  { id: 'claude', label: 'Claude', description: 'AI assistant' },
  { id: 'terminal', label: 'Terminal', description: 'Direct shell' },
];

export const StatusBar: React.FC<StatusBarProps> = ({
  isConnected,
  isAuthenticated,
  isProcessing,
  permissionMode,
  costInfo,
  onInterrupt,
  currentModel = 'sonnet',
  availableModels,
  onChangeModel,
  onSetMode,
}) => {
  const [expandedDropdown, setExpandedDropdown] = useState<'model' | 'mode' | 'input' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputMode = useUIStore((s) => s.inputMode);
  const setInputMode = useUIStore((s) => s.setInputMode);

  // Use availableModels from server, fallback to hardcoded
  const models = availableModels && availableModels.length > 0 ? availableModels : FALLBACK_MODELS;

  // Find active model by matching ID or alias
  const activeModel = models.find(m =>
    m.id === currentModel ||
    m.alias === currentModel ||
    m.id.includes(currentModel) ||
    currentModel.includes(m.id)
  ) || models[0];

  const activeMode = MODES.find(m => m.id === permissionMode) || MODES[0];
  const activeInputMode = INPUT_MODES.find(m => m.id === inputMode) || INPUT_MODES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExpandedDropdown(null);
      }
    };

    if (expandedDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [expandedDropdown]);

  const formatCost = (usd: number) => {
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(3)}`;
  };

  const formatTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  const connectionStatusText = isAuthenticated
    ? 'Connected'
    : isConnected
    ? 'Connecting...'
    : 'Disconnected';

  const toggleDropdown = (dropdown: 'model' | 'mode' | 'input') => {
    setExpandedDropdown(prev => prev === dropdown ? null : dropdown);
  };

  const handleModelSelect = (modelId: string) => {
    // Check if this model is already selected (compare alias or ID)
    if (activeModel.id === modelId || activeModel.alias === modelId) {
      setExpandedDropdown(null);
      return;
    }
    if (onChangeModel) {
      onChangeModel(modelId);
    }
    setExpandedDropdown(null);
  };

  const handleModeSelect = (modeId: PermissionMode) => {
    if (onSetMode && modeId !== permissionMode) {
      onSetMode(modeId);
    }
    setExpandedDropdown(null);
  };

  const handleInputModeSelect = (modeId: InputMode) => {
    if (modeId !== inputMode) {
      setInputMode(modeId);
    }
    setExpandedDropdown(null);
  };

  return (
    <div className="px-4 py-2 border-t border-border/50 bg-card/60 backdrop-blur-lg">
      <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto text-xs">
        {/* Left side - Connection and Dropdowns */}
        <div className="flex items-center gap-2 relative" ref={dropdownRef}>
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isAuthenticated ? 'bg-green-500' : isConnected ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            title={connectionStatusText}
          />

          {/* Model Dropdown */}
          {onChangeModel && (
            <div className="relative">
              <button
                onClick={() => toggleDropdown('model')}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/40 bg-secondary/30 hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Cpu className="h-3 w-3" />
                <span className="font-medium">{activeModel.name}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${expandedDropdown === 'model' ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {expandedDropdown === 'model' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-1 z-50 min-w-[200px] max-h-[400px] overflow-y-auto p-1 bg-popover border border-border rounded-md shadow-lg"
                  >
                    {models.map(model => {
                      // Check if this is the active model (must match both ID and context window)
                      const isActive = (
                        (activeModel.alias && model.alias && activeModel.alias === model.alias) ||
                        (activeModel.id === model.id && activeModel.contextWindow === model.contextWindow)
                      );

                      return (
                        <button
                          key={`${model.id}-${model.contextWindow || 'default'}`}
                          onClick={() => handleModelSelect(model.alias || model.id)}
                          disabled={isProcessing}
                          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left hover:bg-accent transition-colors ${
                            isActive ? 'bg-accent/50' : ''
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-xs">{model.name}</span>
                            <span className="text-[10px] text-muted-foreground">{model.description}</span>
                            {model.contextWindow && (
                              <span className="text-[9px] text-muted-foreground/70">
                                {model.contextWindow >= 1000000 ? '1M' : '200K'} context
                              </span>
                            )}
                          </div>
                          {isActive && <Check className="h-3 w-3 text-primary" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Mode Dropdown */}
          {onSetMode && (
            <div className="relative">
              <button
                onClick={() => toggleDropdown('mode')}
                disabled={isProcessing}
                className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-colors ${
                  permissionMode === 'plan'
                    ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500'
                    : permissionMode === 'acceptEdits'
                    ? 'border-green-500/40 bg-green-500/10 text-green-500'
                    : 'border-border/40 bg-secondary/30 hover:bg-secondary/50'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Shield className="h-3 w-3" />
                <span className="font-medium">{activeMode.label}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${expandedDropdown === 'mode' ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {expandedDropdown === 'mode' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-1 z-50 min-w-[180px] p-1 bg-popover border border-border rounded-md shadow-lg"
                  >
                    {MODES.map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => handleModeSelect(mode.id)}
                        disabled={isProcessing}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left hover:bg-accent transition-colors ${
                          permissionMode === mode.id ? 'bg-accent/50' : ''
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-xs">{mode.label}</span>
                          <span className="text-[10px] text-muted-foreground">{mode.description}</span>
                        </div>
                        {permissionMode === mode.id && <Check className="h-3 w-3 text-primary" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Input Mode Dropdown */}
          <div className="relative">
            <button
              onClick={() => toggleDropdown('input')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-colors ${
                inputMode === 'terminal'
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-500'
                  : 'border-border/40 bg-secondary/30 hover:bg-secondary/50'
              }`}
            >
              {inputMode === 'terminal' ? (
                <TerminalSquare className="h-3 w-3" />
              ) : (
                <MessageSquare className="h-3 w-3" />
              )}
              <span className="font-medium">{activeInputMode.label}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${expandedDropdown === 'input' ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {expandedDropdown === 'input' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 mb-1 z-50 min-w-[160px] p-1 bg-popover border border-border rounded-md shadow-lg"
                >
                  {INPUT_MODES.map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => handleInputModeSelect(mode.id)}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left hover:bg-accent transition-colors ${
                        inputMode === mode.id ? 'bg-accent/50' : ''
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-xs">{mode.label}</span>
                        <span className="text-[10px] text-muted-foreground">{mode.description}</span>
                      </div>
                      {inputMode === mode.id && <Check className="h-3 w-3 text-primary" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isProcessing && onInterrupt && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onInterrupt}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              <StopCircle className="h-3 w-3" />
              Stop
            </motion.button>
          )}
        </div>

        {/* Right side - Stats */}
        {costInfo && costInfo.numTurns > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 font-mono">
              <span className="text-blue-400">↑{formatTokens(costInfo.inputTokens)}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-green-400">↓{formatTokens(costInfo.outputTokens)}</span>
            </Badge>

            <Badge variant="secondary" className="font-mono text-orange-400">
              {formatCost(costInfo.totalCostUSD)}
            </Badge>

            <Badge variant="outline" className="font-mono">
              Turn {costInfo.numTurns}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
};
