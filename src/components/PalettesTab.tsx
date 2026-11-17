import React, { useState } from 'react';
import { Check, Plus, RotateCcw, X } from 'lucide-react';
import { EXECUTIVE_PALETTES, normalizeHex } from '../palettes';
import { ComputedSankeyNode } from '../types';

interface PalettesTabProps {
  activePaletteId: string;
  activeColors: string[];
  nodes: ComputedSankeyNode[];
  selectedNodeName: string | null;
  nodeColorOverrides: Record<string, string>;
  onSelectPalette: (paletteId: string) => void;
  onUpdateSwatch: (index: number, hex: string) => void;
  onAddSwatch: () => void;
  onRemoveSwatch: (index: number) => void;
  onResetPalette: () => void;
  onSelectNode: (nodeName: string | null) => void;
  onSetNodeColor: (nodeName: string, hex: string) => void;
  onClearNodeColor: (nodeName: string) => void;
  onClearAllNodeColors: () => void;
}

export const PalettesTab: React.FC<PalettesTabProps> = ({
  activePaletteId,
  activeColors,
  nodes,
  selectedNodeName,
  nodeColorOverrides,
  onSelectPalette,
  onUpdateSwatch,
  onAddSwatch,
  onRemoveSwatch,
  onResetPalette,
  onSelectNode,
  onSetNodeColor,
  onClearNodeColor,
  onClearAllNodeColors,
}) => {
  const [hexDrafts, setHexDrafts] = useState<Record<number, string>>({});
  const overrideEntries = Object.entries(nodeColorOverrides);
  const selectedNode = nodes.find((n) => n.name === selectedNodeName) || null;

  return (
    <div className="flex flex-col gap-6">
      {/* Executive Palettes List */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs font-semibold text-slate-900">
            Executive Colour Palettes
          </h3>
          <span className="text-[11px] text-slate-500 tabular-nums">
            {EXECUTIVE_PALETTES.length} presets
          </span>
        </div>

        <div className="space-y-2">
          {EXECUTIVE_PALETTES.map((palette) => {
            const isActive = palette.id === activePaletteId;
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() => onSelectPalette(palette.id)}
                className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                  isActive
                    ? 'border-slate-900 bg-slate-50/80 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-900 truncate">
                    {palette.name}
                  </span>
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-slate-900" />}
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {palette.colors.map((hex, i) => (
                    <span
                      key={`${palette.id}-${i}`}
                      className="h-4 rounded-[3px] border border-black/10"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <hr className="border-slate-200" />

      {/* Custom Active Palette Editor */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xs font-semibold text-slate-900">
            Active Palette Swatches
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetPalette}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900 whitespace-nowrap"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <button
              type="button"
              onClick={onAddSwatch}
              disabled={activeColors.length >= 12}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {activeColors.map((color, idx) => {
            const draft = hexDrafts[idx] ?? color;
            return (
              <div
                key={`swatch-${idx}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
              >
                <label className="relative flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded border border-black/10">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHexDrafts((prev) => {
                        const next = { ...prev };
                        delete next[idx];
                        return next;
                      });
                      onUpdateSwatch(idx, val);
                    }}
                    aria-label={`Pick color ${idx + 1}`}
                    className="absolute inset-0 h-10 w-10 -translate-x-2 -translate-y-2 cursor-pointer opacity-0"
                  />
                  <span className="h-full w-full" style={{ backgroundColor: color }} />
                </label>

                <input
                  type="text"
                  value={draft}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHexDrafts((prev) => ({ ...prev, [idx]: val }));
                    const normalized = normalizeHex(val);
                    if (normalized) {
                      onUpdateSwatch(idx, normalized);
                    }
                  }}
                  onBlur={() => {
                    setHexDrafts((prev) => {
                      const next = { ...prev };
                      delete next[idx];
                      return next;
                    });
                  }}
                  aria-label={`Hex code ${idx + 1}`}
                  className="min-w-0 flex-1 font-mono text-xs uppercase text-slate-800 outline-none"
                />

                {activeColors.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onRemoveSwatch(idx)}
                    aria-label={`Remove swatch ${idx + 1}`}
                    className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <hr className="border-slate-200" />

      {/* Individual Node Color Overrides */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xs font-semibold text-slate-900">
            Node Colour Override
          </h3>
          {overrideEntries.length > 0 && (
            <button
              type="button"
              onClick={onClearAllNodeColors}
              className="text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900 whitespace-nowrap"
            >
              Clear All ({overrideEntries.length})
            </button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          Click any node bar in the slide preview, or select a node below to assign a custom colour.
        </p>

        <div className="space-y-2">
          <select
            value={selectedNodeName || ''}
            onChange={(e) => onSelectNode(e.target.value || null)}
            aria-label="Select node to override color"
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-slate-400"
          >
            <option value="">Select a node...</option>
            {nodes.map((n) => (
              <option key={n.name} value={n.name}>
                {n.name}
              </option>
            ))}
          </select>

          {selectedNode && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <label className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded border border-black/15">
                  <input
                    type="color"
                    value={selectedNode.color}
                    onChange={(e) => onSetNodeColor(selectedNode.name, e.target.value)}
                    aria-label={`Color for ${selectedNode.name}`}
                    className="absolute inset-0 h-10 w-10 -translate-x-2 -translate-y-2 cursor-pointer opacity-0"
                  />
                  <span className="block h-full w-full" style={{ backgroundColor: selectedNode.color }} />
                </label>
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-slate-900">
                    {selectedNode.name}
                  </div>
                  <div className="font-mono text-[11px] uppercase text-slate-500">
                    {selectedNode.color}
                  </div>
                </div>
              </div>

              {nodeColorOverrides[selectedNode.name] && (
                <button
                  type="button"
                  onClick={() => onClearNodeColor(selectedNode.name)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                >
                  Revert
                </button>
              )}
            </div>
          )}

          {overrideEntries.length > 0 && (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {overrideEntries.map(([name, hex]) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onSelectNode(name)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/10"
                      style={{ backgroundColor: hex }}
                    />
                    <span className="truncate font-medium text-slate-800">{name}</span>
                    <span className="font-mono text-[11px] uppercase text-slate-400">{hex}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onClearNodeColor(name)}
                    aria-label={`Reset color for ${name}`}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
