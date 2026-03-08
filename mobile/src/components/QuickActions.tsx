import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Shield, ChevronDown, Check, MessageSquare, TerminalSquare } from 'lucide-react';
import type { PermissionMode, ModelInfo } from '../../../shared/types';
import type { InputMode } from '../types';
import { useUIStore } from '../store/uiStore';
import './QuickActions.css';

interface QuickActionsProps {
  currentModel: string;
  permissionMode: PermissionMode;
  availableModels?: ModelInfo[];
  onChangeModel: (model: string) => void;
  onSetMode: (mode: PermissionMode) => void;
  isProcessing: boolean;
}

const INPUT_MODES: { id: InputMode; label: string; description: string }[] = [
  { id: 'claude', label: 'Claude', description: 'AI assistant' },
  { id: 'terminal', label: 'Terminal', description: 'Direct shell' },
];

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

export const QuickActions: React.FC<QuickActionsProps> = ({
  currentModel,
  permissionMode,
  availableModels,
  onChangeModel,
  onSetMode,
  isProcessing,
}) => {
  const [expandedGroup, setExpandedGroup] = useState<'model' | 'mode' | 'input' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
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

  // Clear toast after timeout
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const activeInputMode = INPUT_MODES.find(m => m.id === inputMode) || INPUT_MODES[0];

  const toggleGroup = (group: 'model' | 'mode' | 'input') => {
    setExpandedGroup(prev => prev === group ? null : group);
  };

  const handleModelSelect = (modelId: string) => {
    if (activeModel.id === modelId || activeModel.alias === modelId) {
      setExpandedGroup(null);
      return;
    }
    onChangeModel(modelId);
    setExpandedGroup(null);
    const model = models.find(m => m.id === modelId || m.alias === modelId);
    const label = model?.name || modelId;
    showToast(`Model → ${label}`);
  };

  const handleModeSelect = (modeId: PermissionMode) => {
    if (modeId === permissionMode) {
      setExpandedGroup(null);
      return;
    }
    onSetMode(modeId);
    setExpandedGroup(null);
    const label = MODES.find(m => m.id === modeId)?.label || modeId;
    showToast(`Mode → ${label}`);
  };

  const handleInputModeSelect = (modeId: InputMode) => {
    if (modeId === inputMode) {
      setExpandedGroup(null);
      return;
    }
    setInputMode(modeId);
    setExpandedGroup(null);
    const label = INPUT_MODES.find(m => m.id === modeId)?.label || modeId;
    showToast(`Input → ${label}`);
  };

  return (
    <div className="qa">
      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="qa__toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="qa__toast-icon" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="qa__bar">
        {/* Model Selector */}
        <button
          className={`qa__trigger ${expandedGroup === 'model' ? 'qa__trigger--active' : ''}`}
          onClick={() => toggleGroup('model')}
          disabled={isProcessing}
        >
          <Cpu className="qa__trigger-icon" />
          <span className="qa__trigger-label">{activeModel.name}</span>
          <ChevronDown className={`qa__trigger-chevron ${expandedGroup === 'model' ? 'qa__trigger-chevron--open' : ''}`} />
        </button>

        {/* Mode Selector */}
        <button
          className={`qa__trigger ${expandedGroup === 'mode' ? 'qa__trigger--active' : ''} qa__trigger--mode-${permissionMode}`}
          onClick={() => toggleGroup('mode')}
          disabled={isProcessing}
        >
          <Shield className="qa__trigger-icon" />
          <span className="qa__trigger-label">{activeMode.label}</span>
          <ChevronDown className={`qa__trigger-chevron ${expandedGroup === 'mode' ? 'qa__trigger-chevron--open' : ''}`} />
        </button>

        {/* Input Mode Selector */}
        <button
          className={`qa__trigger ${expandedGroup === 'input' ? 'qa__trigger--active' : ''} ${inputMode === 'terminal' ? 'qa__trigger--terminal' : ''}`}
          onClick={() => toggleGroup('input')}
        >
          {inputMode === 'terminal' ? (
            <TerminalSquare className="qa__trigger-icon" />
          ) : (
            <MessageSquare className="qa__trigger-icon" />
          )}
          <span className="qa__trigger-label">{activeInputMode.label}</span>
          <ChevronDown className={`qa__trigger-chevron ${expandedGroup === 'input' ? 'qa__trigger-chevron--open' : ''}`} />
        </button>
      </div>

      {/* Expandable Panels */}
      <AnimatePresence>
        {expandedGroup === 'model' && (
          <motion.div
            className="qa__panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="qa__options">
              {models.map(model => {
                // Check if this is the active model (must match both ID and context window)
                const isActive = (
                  (activeModel.alias && model.alias && activeModel.alias === model.alias) ||
                  (activeModel.id === model.id && activeModel.contextWindow === model.contextWindow)
                );

                return (
                  <button
                    key={`${model.id}-${model.contextWindow || 'default'}`}
                    className={`qa__option ${isActive ? 'qa__option--active' : ''}`}
                    onClick={() => handleModelSelect(model.alias || model.id)}
                    disabled={isProcessing}
                  >
                    <span className="qa__option-label">{model.name}</span>
                    <span className="qa__option-desc">
                      {model.description}
                      {model.contextWindow && ` • ${model.contextWindow >= 1000000 ? '1M' : '200K'}`}
                    </span>
                    {isActive && <Check className="qa__option-check" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {expandedGroup === 'mode' && (
          <motion.div
            className="qa__panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="qa__options">
              {MODES.map(mode => (
                <button
                  key={mode.id}
                  className={`qa__option ${permissionMode === mode.id ? 'qa__option--active' : ''} qa__option--mode-${mode.id}`}
                  onClick={() => handleModeSelect(mode.id)}
                  disabled={isProcessing}
                >
                  <span className="qa__option-label">{mode.label}</span>
                  <span className="qa__option-desc">{mode.description}</span>
                  {permissionMode === mode.id && <Check className="qa__option-check" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {expandedGroup === 'input' && (
          <motion.div
            className="qa__panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="qa__options">
              {INPUT_MODES.map(mode => (
                <button
                  key={mode.id}
                  className={`qa__option ${inputMode === mode.id ? 'qa__option--active' : ''} ${mode.id === 'terminal' ? 'qa__option--terminal' : ''}`}
                  onClick={() => handleInputModeSelect(mode.id)}
                >
                  <span className="qa__option-label">{mode.label}</span>
                  <span className="qa__option-desc">{mode.description}</span>
                  {inputMode === mode.id && <Check className="qa__option-check" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
