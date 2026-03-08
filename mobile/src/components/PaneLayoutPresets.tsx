import React from 'react';
import { Rows3, Plus, LayoutGrid, Columns2, Columns3, Grid2x2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { usePaneStore, type LayoutPreset } from '../store/paneStore';

const PRESET_OPTIONS: Array<{
  preset: LayoutPreset;
  label: string;
  icon: React.ReactNode;
}> = [
  { preset: '2-pane', label: '2', icon: <Columns2 className="h-3.5 w-3.5" /> },
  { preset: '3-pane', label: '3', icon: <Columns3 className="h-3.5 w-3.5" /> },
  { preset: '4-pane', label: '4', icon: <Grid2x2 className="h-3.5 w-3.5" /> },
  { preset: '6-pane', label: '6', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
];

const MAX_PANES = 6;

export const PaneLayoutPresets: React.FC = () => {
  const activePreset = usePaneStore((s) => s.activePreset);
  const applyPreset = usePaneStore((s) => s.applyPreset);
  const addPane = usePaneStore((s) => s.addPane);
  const paneCount = usePaneStore((s) => s.panes.length);
  const setViewMode = usePaneStore((s) => s.setViewMode);

  return (
    <div className="pane-presets-toolbar">
      {/* Switch back to tab view */}
      <button
        onClick={() => setViewMode('tab')}
        className="pane-preset-btn"
        title="Switch to tab view"
      >
        <Rows3 className="h-3.5 w-3.5" />
        <span>Tabs</span>
      </button>

      <div className="w-px h-4 bg-border/30 mx-1" />

      {/* Preset buttons */}
      {PRESET_OPTIONS.map(({ preset, label, icon }) => (
        <button
          key={preset}
          onClick={() => applyPreset(preset)}
          className={cn(
            'pane-preset-btn',
            activePreset === preset && 'pane-preset-btn--active'
          )}
          title={`${label}-pane layout`}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}

      <div className="w-px h-4 bg-border/30 mx-1" />

      {/* Add pane button */}
      <button
        onClick={addPane}
        disabled={paneCount >= MAX_PANES}
        className={cn(
          'pane-preset-btn',
          paneCount >= MAX_PANES && 'opacity-40 cursor-not-allowed'
        )}
        title={paneCount >= MAX_PANES ? 'Maximum 6 panes' : 'Add pane'}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {/* Pane count indicator */}
      <span className="text-[10px] text-muted-foreground ml-auto">
        {paneCount}/{MAX_PANES} panes
      </span>
    </div>
  );
};
