import { create } from 'zustand';
import type { InputMode } from '../types';

interface UIStore {
  // Input history management
  inputHistory: string[];
  historyIndex: number;

  // Collapsed states for blocks (using IDs)
  collapsedThinking: Set<string>;
  collapsedTools: Set<string>;

  // UI visibility
  showSlashMenu: boolean;
  showWelcome: boolean;

  // Input mode: 'claude' (AI prompts) or 'terminal' (direct shell commands)
  inputMode: InputMode;

  // Actions
  addToHistory: (input: string) => void;
  navigateHistoryUp: () => string | null;
  navigateHistoryDown: () => string | null;
  resetHistoryIndex: () => void;

  toggleThinkingCollapse: (id: string) => void;
  toggleToolCollapse: (id: string) => void;

  setShowSlashMenu: (show: boolean) => void;
  setShowWelcome: (show: boolean) => void;

  setInputMode: (mode: InputMode) => void;
  toggleInputMode: () => void;

  // Clear state for instance
  clearInstance: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  inputHistory: [],
  historyIndex: -1,
  collapsedThinking: new Set<string>(),
  collapsedTools: new Set<string>(),
  showSlashMenu: false,
  showWelcome: true,
  inputMode: 'claude' as InputMode,

  addToHistory: (input: string) => {
    if (!input.trim()) return;

    set((state) => {
      const newHistory = [...state.inputHistory, input];
      // Keep only last 100 entries
      const trimmedHistory = newHistory.slice(-100);
      return {
        inputHistory: trimmedHistory,
        historyIndex: -1, // Reset to end
      };
    });
  },

  navigateHistoryUp: () => {
    const { inputHistory, historyIndex } = get();
    if (inputHistory.length === 0) return null;

    const newIndex = historyIndex === -1
      ? inputHistory.length - 1
      : Math.max(0, historyIndex - 1);

    set({ historyIndex: newIndex });
    return inputHistory[newIndex];
  },

  navigateHistoryDown: () => {
    const { inputHistory, historyIndex } = get();
    if (historyIndex === -1) return null;

    const newIndex = historyIndex + 1;

    if (newIndex >= inputHistory.length) {
      set({ historyIndex: -1 });
      return '';
    }

    set({ historyIndex: newIndex });
    return inputHistory[newIndex];
  },

  resetHistoryIndex: () => set({ historyIndex: -1 }),

  toggleThinkingCollapse: (id: string) => {
    set((state) => {
      const newSet = new Set(state.collapsedThinking);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { collapsedThinking: newSet };
    });
  },

  toggleToolCollapse: (id: string) => {
    set((state) => {
      const newSet = new Set(state.collapsedTools);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { collapsedTools: newSet };
    });
  },

  setShowSlashMenu: (show: boolean) => set({ showSlashMenu: show }),

  setShowWelcome: (show: boolean) => set({ showWelcome: show }),

  setInputMode: (mode: InputMode) => set({ inputMode: mode }),
  toggleInputMode: () => set((state) => ({
    inputMode: state.inputMode === 'claude' ? 'terminal' : 'claude',
  })),

  clearInstance: () => set({
    inputHistory: [],
    historyIndex: -1,
    collapsedThinking: new Set(),
    collapsedTools: new Set(),
    showWelcome: true,
  }),
}));
