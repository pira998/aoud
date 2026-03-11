import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// --- Types ---

export interface PaneConfig {
  paneId: string;
  sessionId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayoutPreset = '2-pane' | '3-pane' | '4-pane' | '6-pane';

// --- Layout Presets (12-column grid) ---

const LAYOUT_PRESETS: Record<LayoutPreset, Omit<PaneConfig, 'sessionId'>[]> = {
  '2-pane': [
    { paneId: 'p1', x: 0, y: 0, w: 6, h: 12 },
    { paneId: 'p2', x: 6, y: 0, w: 6, h: 12 },
  ],
  '3-pane': [
    { paneId: 'p1', x: 0, y: 0, w: 4, h: 12 },
    { paneId: 'p2', x: 4, y: 0, w: 4, h: 12 },
    { paneId: 'p3', x: 8, y: 0, w: 4, h: 12 },
  ],
  '4-pane': [
    { paneId: 'p1', x: 0, y: 0, w: 6, h: 6 },
    { paneId: 'p2', x: 6, y: 0, w: 6, h: 6 },
    { paneId: 'p3', x: 0, y: 6, w: 6, h: 6 },
    { paneId: 'p4', x: 6, y: 6, w: 6, h: 6 },
  ],
  '6-pane': [
    { paneId: 'p1', x: 0, y: 0, w: 4, h: 6 },
    { paneId: 'p2', x: 4, y: 0, w: 4, h: 6 },
    { paneId: 'p3', x: 8, y: 0, w: 4, h: 6 },
    { paneId: 'p4', x: 0, y: 6, w: 4, h: 6 },
    { paneId: 'p5', x: 4, y: 6, w: 4, h: 6 },
    { paneId: 'p6', x: 8, y: 6, w: 4, h: 6 },
  ],
};

const MAX_PANES = 6;

let paneCounter = 7; // Start after preset IDs (p1-p6)

function generatePaneId(): string {
  return `p${paneCounter++}`;
}

// --- Store Interface ---

interface PaneStore {
  // State
  viewMode: 'tab' | 'pane';
  panes: PaneConfig[];
  focusedPaneId: string | null;
  activePreset: LayoutPreset;

  // Actions
  setViewMode: (mode: 'tab' | 'pane') => void;
  toggleViewMode: () => void;
  setFocusedPane: (paneId: string) => void;

  // Pane management
  addPane: () => void;
  removePane: (paneId: string) => void;
  setPaneSession: (paneId: string, sessionId: string | null) => void;
  updateLayout: (layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void;
  swapPanes: (paneId1: string, paneId2: string) => void;

  // Presets
  applyPreset: (preset: LayoutPreset) => void;

  // Derived helper
  getFocusedSessionId: () => string | null;
}

// --- Store ---

export const usePaneStore = create<PaneStore>()(
  persist(
    (set, get) => ({
      viewMode: 'tab',
      panes: LAYOUT_PRESETS['2-pane'].map((p) => ({ ...p, sessionId: null })),
      focusedPaneId: 'p1',
      activePreset: '2-pane',

      setViewMode: (mode) => set({ viewMode: mode }),

      toggleViewMode: () =>
        set((state) => ({
          viewMode: state.viewMode === 'tab' ? 'pane' : 'tab',
        })),

      setFocusedPane: (paneId) => set({ focusedPaneId: paneId }),

      addPane: () =>
        set((state) => {
          if (state.panes.length >= MAX_PANES) return state;

          const newPaneId = generatePaneId();
          // Place new pane at the next available grid position
          const maxY = Math.max(...state.panes.map((p) => p.y + p.h), 0);
          const newPane: PaneConfig = {
            paneId: newPaneId,
            sessionId: null,
            x: 0,
            y: maxY,
            w: 6,
            h: 6,
          };
          return { panes: [...state.panes, newPane] };
        }),

      removePane: (paneId) =>
        set((state) => {
          const newPanes = state.panes.filter((p) => p.paneId !== paneId);
          if (newPanes.length === 0) return state; // Don't remove last pane
          const newFocused =
            state.focusedPaneId === paneId
              ? newPanes[0]?.paneId ?? null
              : state.focusedPaneId;
          return { panes: newPanes, focusedPaneId: newFocused };
        }),

      setPaneSession: (paneId, sessionId) =>
        set((state) => ({
          panes: state.panes.map((p) =>
            p.paneId === paneId ? { ...p, sessionId } : p
          ),
        })),

      updateLayout: (layout) =>
        set((state) => ({
          panes: state.panes.map((pane) => {
            const item = layout.find((l) => l.i === pane.paneId);
            if (!item) return pane;
            return { ...pane, x: item.x, y: item.y, w: item.w, h: item.h };
          }),
        })),

      swapPanes: (paneId1, paneId2) =>
        set((state) => {
          const idx1 = state.panes.findIndex((p) => p.paneId === paneId1);
          const idx2 = state.panes.findIndex((p) => p.paneId === paneId2);
          if (idx1 === -1 || idx2 === -1) return state;

          const newPanes = [...state.panes];
          [newPanes[idx1], newPanes[idx2]] = [newPanes[idx2], newPanes[idx1]];
          return { panes: newPanes };
        }),

      applyPreset: (preset) => {
        const presetLayout = LAYOUT_PRESETS[preset];
        const currentPanes = get().panes;

        // Preserve session assignments when switching presets
        const newPanes: PaneConfig[] = presetLayout.map((layout, i) => ({
          ...layout,
          sessionId: currentPanes[i]?.sessionId ?? null,
        }));

        set({
          panes: newPanes,
          activePreset: preset,
          focusedPaneId: newPanes[0]?.paneId ?? null,
        });
      },

      getFocusedSessionId: () => {
        const state = get();
        const pane = state.panes.find((p) => p.paneId === state.focusedPaneId);
        return pane?.sessionId ?? null;
      },
    }),
    {
      name: 'aoud-pane-layout',
      version: 2, // Bump to reset corrupted h values from v1
      // Only persist layout-related state, not transient focus
      partialize: (state) => ({
        viewMode: state.viewMode,
        panes: state.panes,
        activePreset: state.activePreset,
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          // v1 stored corrupted h values fed back from react-grid-layout.
          // Reset panes to the default 2-pane preset to fix them.
          const state = persistedState as Record<string, unknown>;
          return {
            ...state,
            panes: LAYOUT_PRESETS['2-pane'].map((p) => ({ ...p, sessionId: null })),
            activePreset: '2-pane' as LayoutPreset,
          };
        }
        return persistedState as Record<string, unknown>;
      },
    }
  )
);
