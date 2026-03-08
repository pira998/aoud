import React from 'react';
import { motion } from 'framer-motion';
import { TextHoverEffect } from './ui/TextHoverEffect';
import { Sparkles } from 'lucide-react';

interface WelcomeScreenProps {
  onQuickAction: (text: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onQuickAction }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        {/* Main Text with Hover Effect */}
        <div className="h-32 flex items-center justify-center mb-8">
          <TextHoverEffect text="Aoud Code" />
        </div>

        {/* Minimal Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center space-y-4"
        >
          <p className="text-muted-foreground text-lg flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Start coding with AI</span>
          </p>

          {/* Keyboard Shortcuts */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex items-center justify-center gap-3 text-sm text-muted-foreground/70"
          >
            <kbd className="px-2 py-1 bg-secondary/50 rounded border border-border/50 font-mono text-xs">
              /
            </kbd>
            <span>commands</span>
            <span className="text-muted-foreground/40">•</span>
            <kbd className="px-2 py-1 bg-secondary/50 rounded border border-border/50 font-mono text-xs">
              ↑↓
            </kbd>
            <span>history</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
};
