import React, { useState, useMemo } from 'react';
import './TokenUsageBar.css';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TokenUsageBarProps {
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  turnCount: number;
  currentModel?: string;  // NEW: Current model ID to determine context window
}

export const TokenUsageBar: React.FC<TokenUsageBarProps> = ({
  totalCost,
  totalTokens,
  inputTokens,
  outputTokens,
  cacheCreationTokens,
  cacheReadTokens,
  turnCount,
  currentModel,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // Determine context window size based on current model
  // IMPORTANT: This useMemo must be called BEFORE any early return (React Hooks Rules)
  const contextLimit = useMemo(() => {
    if (!currentModel) return 200000;
    // Check if model is 1M variant (looks for '1m', '1M', or 'sonnet-1m', 'opus-1m' patterns)
    const modelLower = currentModel.toLowerCase();
    if (modelLower.includes('-1m') || modelLower.includes('(1m)')) {
      return 1000000;
    }
    return 200000;
  }, [currentModel]);

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  const formatPercent = (part: number, total: number) => {
    if (total === 0) return '0%';
    return `${((part / total) * 100).toFixed(1)}%`;
  };

  // Early return AFTER all hooks
  if (turnCount === 0) return null;

  // Determine context window label for display
  const contextLabel = contextLimit === 1000000 ? '1M' : '200K';
  const usedPercent = (totalTokens / contextLimit) * 100;
  const freeTokens = Math.max(0, contextLimit - totalTokens);

  return (
    <div className="px-4 py-2 border-t border-border/50 bg-card/60 backdrop-blur-lg">
      <div className="max-w-4xl mx-auto">
        <motion.button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between gap-3 text-xs hover:opacity-80 transition-opacity"
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
        >
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              Session: <span className="text-orange-400">${totalCost.toFixed(4)}</span>
            </Badge>
            <Badge variant="secondary" className="font-mono">
              {formatTokens(totalTokens)} tokens
            </Badge>
            {/* <Badge variant="outline" className="font-mono">
              {contextLabel} context
            </Badge>
            <Badge variant="outline" className="font-mono">
              {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
            </Badge> */}
          </div>
          <motion.div
            animate={{ rotate: showDetails ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3 text-xs">
                {/* Context Usage */}
                <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="font-semibold mb-2 text-primary">📊 Context Usage</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Used / Total:</span>
                      <span className="font-mono">{formatTokens(totalTokens)} / {formatTokens(contextLimit)} ({usedPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Free space:</span>
                      <span className="font-mono">{formatTokens(freeTokens)} ({formatPercent(freeTokens, contextLimit)})</span>
                    </div>
                  </div>
                </div>

                {/* Token Breakdown */}
                <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="font-semibold mb-2 text-primary">💬 Token Breakdown</div>
                  <div className="space-y-1.5">
                    {inputTokens + outputTokens > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Input:</span>
                          <span className="font-mono text-blue-400">{formatTokens(inputTokens)} ({formatPercent(inputTokens, totalTokens)})</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Output:</span>
                          <span className="font-mono text-green-400">{formatTokens(outputTokens)} ({formatPercent(outputTokens, totalTokens)})</span>
                        </div>
                      </>
                    )}
                    {cacheCreationTokens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cache Write:</span>
                        <span className="font-mono text-cyan-400">{formatTokens(cacheCreationTokens)} ({formatPercent(cacheCreationTokens, totalTokens)})</span>
                      </div>
                    )}
                    {cacheReadTokens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cache Read:</span>
                        <span className="font-mono text-purple-400">{formatTokens(cacheReadTokens)} ({formatPercent(cacheReadTokens, totalTokens)})</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cost Analysis */}
                <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="font-semibold mb-2 text-primary">💰 Cost Analysis</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total cost:</span>
                      <span className="font-mono text-orange-400">${totalCost.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg per turn:</span>
                      <span className="font-mono">${(totalCost / turnCount).toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Turns:</span>
                      <span className="font-mono">{turnCount}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground italic p-2 bg-secondary/20 rounded border border-border/30">
                  💡 Tip: Use /context command for full session details
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
