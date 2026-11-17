import React, { useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { buildChordGroupSvgPath, buildChordRibbonSvgPath } from '../chordMath';
import { buildRibbonSvgPath, formatSankeyValue } from '../sankeyMath';
import {
  AspectRatio,
  ChartType,
  ChordLayoutResult,
  ComputedChordGroup,
  ComputedChordRibbon,
  ComputedSankeyLink,
  ComputedSankeyNode,
  SankeyLayoutResult,
  SankeyStyleConfig,
} from '../types';

interface SlidePreviewCanvasProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  chartType: ChartType;
  sankeyLayout: SankeyLayoutResult;
  chordLayout: ChordLayoutResult;
  aspectRatio: AspectRatio;
  style: SankeyStyleConfig;
  selectedNodeName: string | null;
  nodeColorOverrides: Record<string, string>;
  onSelectNode: (nodeName: string | null) => void;
  onSetNodeColor: (nodeName: string, hex: string) => void;
  onClearNodeColor: (nodeName: string) => void;
  onUpdateStyle: (patch: Partial<SankeyStyleConfig>) => void;
}

export const SlidePreviewCanvas: React.FC<SlidePreviewCanvasProps> = ({
  svgRef,
  chartType,
  sankeyLayout,
  chordLayout,
  aspectRatio,
  style,
  selectedNodeName,
  nodeColorOverrides,
  onSelectNode,
  onSetNodeColor,
  onClearNodeColor,
  onUpdateStyle,
}) => {
  const [hoveredSankeyLinkIdx, setHoveredSankeyLinkIdx] = useState<number | null>(null);
  const [hoveredChordRibbonIdx, setHoveredChordRibbonIdx] = useState<number | null>(null);
  const [hoveredNodeName, setHoveredNodeName] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);

  const activeDiagnostic =
    chartType === 'sankey' ? sankeyLayout.diagnostic : chordLayout.diagnostic;
  const canvasWidth =
    chartType === 'sankey' ? sankeyLayout.canvasWidth : chordLayout.canvasWidth;
  const canvasHeight =
    chartType === 'sankey' ? sankeyLayout.canvasHeight : chordLayout.canvasHeight;
  const totalDenominator =
    chartType === 'sankey' ? sankeyLayout.totalRootInflow : chordLayout.totalFlow;

  const selectedNodeEntry: { name: string; color: string } | null =
    chartType === 'sankey'
      ? sankeyLayout.nodes.find((n) => n.name === selectedNodeName) || null
      : chordLayout.groups.find((g) => g.name === selectedNodeName) || null;

  const hoveredSankeyLink: ComputedSankeyLink | null =
    chartType === 'sankey' && hoveredSankeyLinkIdx !== null
      ? sankeyLayout.links.find((l) => l.index === hoveredSankeyLinkIdx) || null
      : null;

  const hoveredChordRibbon: ComputedChordRibbon | null =
    chartType === 'chord' && hoveredChordRibbonIdx !== null
      ? chordLayout.ribbons.find((r) => r.index === hoveredChordRibbonIdx) || null
      : null;

  const hoveredNode: { name: string; color: string; value: number } | null =
    hoveredNodeName !== null
      ? chartType === 'sankey'
        ? sankeyLayout.nodes.find((n) => n.name === hoveredNodeName) || null
        : chordLayout.groups.find((g) => g.name === hoveredNodeName) || null
      : null;

  const sankeyLinkOpacity = (link: ComputedSankeyLink): number => {
    const base = style.ribbonOpacity / 100;
    if (hoveredSankeyLinkIdx === null && hoveredNodeName === null) {
      return base;
    }
    const isMatch =
      hoveredSankeyLinkIdx !== null
        ? link.index === hoveredSankeyLinkIdx
        : link.sourceName === hoveredNodeName || link.targetName === hoveredNodeName;
    return isMatch ? Math.min(0.92, base + 0.25) : Math.max(0.12, base * 0.35);
  };

  const chordRibbonOpacity = (ribbon: ComputedChordRibbon): number => {
    const base = style.ribbonOpacity / 100;
    if (hoveredChordRibbonIdx === null && hoveredNodeName === null) {
      return base;
    }
    const isMatch =
      hoveredChordRibbonIdx !== null
        ? ribbon.index === hoveredChordRibbonIdx
        : ribbon.sourceName === hoveredNodeName || ribbon.targetName === hoveredNodeName;
    return isMatch ? Math.min(0.92, base + 0.25) : Math.max(0.1, base * 0.28);
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center p-6 lg:p-10">
      {/* Slide Frame */}
      <div
        className={`relative w-full overflow-hidden rounded-lg bg-white transition-all duration-200 ${
          aspectRatio === '16:9' ? 'max-w-[1040px] aspect-video' : 'max-w-[780px] aspect-[4/3]'
        }`}
        style={{
          boxShadow:
            '0 18px 48px -12px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.08)',
        }}
      >
        {activeDiagnostic ? (
          <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-base font-semibold text-slate-900">
              {activeDiagnostic.type === 'cycle'
                ? 'Circular Flow Loop Detected'
                : activeDiagnostic.type === 'self-loop'
                ? 'Self-Loop Detected'
                : 'Diagram Cannot Render'}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              {activeDiagnostic.message}
            </p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            className="h-full w-full select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onSelectNode(null);
              }
            }}
          >
            {/* White Slide Background */}
            <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="#FFFFFF" />

            {/* Slide Title & Subtitle */}
            {style.showHeader && (
              <g
                className="cursor-text"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingHeader(true);
                }}
              >
                <rect x={40} y={16} width={canvasWidth - 80} height={62} fill="transparent" />
                {style.title.trim() && (
                  <text
                    x={43.2}
                    y={43}
                    className="sankey-title"
                    fontSize={20}
                    fontWeight={700}
                    fill="#0F172A"
                    letterSpacing="-0.015em"
                  >
                    {style.title}
                  </text>
                )}
                {style.subtitle.trim() && (
                  <text x={43.2} y={64} fontSize={11.5} fontWeight={400} fill="#64748B">
                    {style.subtitle}
                  </text>
                )}
              </g>
            )}

            {chartType === 'sankey' ? (
              <>
                {/* Sankey Ribbons */}
                <g>
                  {sankeyLayout.links.map((link: ComputedSankeyLink) => (
                    <path
                      key={`link-${link.index}-${link.sourceName}-${link.targetName}`}
                      d={buildRibbonSvgPath(link)}
                      fill={link.color}
                      fillOpacity={sankeyLinkOpacity(link)}
                      className="transition-opacity duration-150"
                      onMouseEnter={() => setHoveredSankeyLinkIdx(link.index)}
                      onMouseLeave={() => setHoveredSankeyLinkIdx(null)}
                    />
                  ))}
                </g>

                {/* Sankey Nodes */}
                <g>
                  {sankeyLayout.nodes.map((node: ComputedSankeyNode) => {
                    const isSelected = node.name === selectedNodeName;
                    const w = Math.max(node.x1 - node.x0, 2);
                    const h = Math.max(node.y1 - node.y0, 2);
                    return (
                      <g
                        key={`node-${node.name}`}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(isSelected ? null : node.name);
                        }}
                        onMouseEnter={() => setHoveredNodeName(node.name)}
                        onMouseLeave={() => setHoveredNodeName(null)}
                      >
                        <rect x={node.x0} y={node.y0} width={w} height={h} rx={1} fill={node.color} />
                        {isSelected && (
                          <rect
                            data-selection-ring="true"
                            x={node.x0 - 2.5}
                            y={node.y0 - 2.5}
                            width={w + 5}
                            height={h + 5}
                            rx={2}
                            fill="none"
                            stroke="#0F172A"
                            strokeWidth={1.75}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Sankey Labels */}
                <g className="pointer-events-none">
                  {sankeyLayout.nodes.map((node: ComputedSankeyNode) => {
                    const centerY = (node.y0 + node.y1) / 2;
                    const labelX = node.isRightmost ? node.x0 - 8 : node.x1 + 8;
                    const textAnchor = node.isRightmost ? 'end' : 'start';
                    const formattedVal = formatSankeyValue(
                      node.value,
                      style.numberFormat,
                      sankeyLayout.totalRootInflow
                    );

                    return (
                      <g key={`label-${node.name}`}>
                        <text
                          x={labelX}
                          y={style.showValues ? centerY - 2 : centerY + 3.5}
                          textAnchor={textAnchor}
                          fontSize={style.fontSize}
                          fontWeight={600}
                          fill="#0F172A"
                        >
                          {node.name}
                        </text>
                        {style.showValues && (
                          <text
                            x={labelX}
                            y={centerY + style.fontSize * 0.95}
                            textAnchor={textAnchor}
                            fontSize={Math.max(8, style.fontSize - 1.5)}
                            fontWeight={500}
                            fill="#475569"
                            className="sankey-value"
                          >
                            {formattedVal}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </>
            ) : (
              <>
                {/* Chord Ribbons */}
                <g>
                  {chordLayout.ribbons.map((ribbon: ComputedChordRibbon) => (
                    <path
                      key={`chord-ribbon-${ribbon.index}-${ribbon.sourceName}-${ribbon.targetName}`}
                      d={buildChordRibbonSvgPath(
                        ribbon,
                        chordLayout.innerRadius,
                        chordLayout.centerX,
                        chordLayout.centerY
                      )}
                      fill={ribbon.color}
                      fillOpacity={chordRibbonOpacity(ribbon)}
                      className="transition-opacity duration-150"
                      onMouseEnter={() => setHoveredChordRibbonIdx(ribbon.index)}
                      onMouseLeave={() => setHoveredChordRibbonIdx(null)}
                    />
                  ))}
                </g>

                {/* Chord Outer Group Arcs */}
                <g>
                  {chordLayout.groups.map((group: ComputedChordGroup) => {
                    const isSelected = group.name === selectedNodeName;
                    const d = buildChordGroupSvgPath(
                      group,
                      chordLayout.innerRadius,
                      chordLayout.outerRadius,
                      chordLayout.centerX,
                      chordLayout.centerY
                    );
                    return (
                      <g
                        key={`chord-group-${group.name}`}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(isSelected ? null : group.name);
                        }}
                        onMouseEnter={() => setHoveredNodeName(group.name)}
                        onMouseLeave={() => setHoveredNodeName(null)}
                      >
                        <path d={d} fill={group.color} />
                        {isSelected && (
                          <path
                            data-selection-ring="true"
                            d={buildChordGroupSvgPath(
                              group,
                              chordLayout.innerRadius - 2,
                              chordLayout.outerRadius + 2.5,
                              chordLayout.centerX,
                              chordLayout.centerY
                            )}
                            fill="none"
                            stroke="#0F172A"
                            strokeWidth={1.75}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Chord Radial Labels */}
                <g className="pointer-events-none">
                  {chordLayout.groups.map((group: ComputedChordGroup) => {
                    const textAnchor = group.isLeftSide ? 'end' : 'start';
                    const formattedVal = formatSankeyValue(
                      group.value,
                      style.numberFormat,
                      chordLayout.totalFlow
                    );

                    return (
                      <g key={`chord-label-${group.name}`}>
                        <text
                          x={group.labelX}
                          y={style.showValues ? group.labelY - 2 : group.labelY + 3.5}
                          textAnchor={textAnchor}
                          fontSize={style.fontSize}
                          fontWeight={600}
                          fill="#0F172A"
                        >
                          {group.name}
                        </text>
                        {style.showValues && (
                          <text
                            x={group.labelX}
                            y={group.labelY + style.fontSize * 0.95}
                            textAnchor={textAnchor}
                            fontSize={Math.max(8, style.fontSize - 1.5)}
                            fontWeight={500}
                            fill="#475569"
                            className="sankey-value"
                          >
                            {formattedVal}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </>
            )}
          </svg>
        )}

        {/* Inline Slide Header Editor Overlay */}
        {editingHeader && style.showHeader && (
          <div
            className="absolute left-6 right-6 top-3 z-20 rounded-lg border border-slate-300 bg-white/95 p-3 shadow-lg backdrop-blur-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600">
                Edit Slide Header
              </span>
              <button
                type="button"
                onClick={() => setEditingHeader(false)}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Done
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                autoFocus
                value={style.title}
                onChange={(e) => onUpdateStyle({ title: e.target.value })}
                placeholder="Slide Title"
                className="w-full rounded border border-slate-200 px-2.5 py-1.5 font-display text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
              />
              <input
                type="text"
                value={style.subtitle}
                onChange={(e) => onUpdateStyle({ subtitle: e.target.value })}
                placeholder="Slide Subtitle"
                className="w-full rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 outline-none focus:border-slate-400"
              />
            </div>
          </div>
        )}

        {/* Click-Node Floating Colour Popover */}
        {selectedNodeEntry && (
          <div
            className="absolute bottom-3 left-3 z-20 flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <label className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded border border-black/15">
              <input
                type="color"
                value={selectedNodeEntry.color}
                onChange={(e) => onSetNodeColor(selectedNodeEntry.name, e.target.value)}
                aria-label={`Override color for ${selectedNodeEntry.name}`}
                className="absolute inset-0 h-10 w-10 -translate-x-2 -translate-y-2 cursor-pointer opacity-0"
              />
              <span
                className="block h-full w-full"
                style={{ backgroundColor: selectedNodeEntry.color }}
              />
            </label>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900">{selectedNodeEntry.name}</div>
              <div className="font-mono text-[11px] uppercase text-slate-500">
                {selectedNodeEntry.color}
              </div>
            </div>
            {nodeColorOverrides[selectedNodeEntry.name] && (
              <button
                type="button"
                onClick={() => onClearNodeColor(selectedNodeEntry.name)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectNode(null)}
              aria-label="Close node color editor"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Subtle Hover Inspection Bar */}
        {(hoveredSankeyLink || hoveredChordRibbon || hoveredNode) && !selectedNodeEntry && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm tabular-nums">
            {hoveredSankeyLink ? (
              <>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: hoveredSankeyLink.color }}
                />
                <span className="font-medium">
                  {hoveredSankeyLink.sourceName} &rarr; {hoveredSankeyLink.targetName}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatSankeyValue(
                    hoveredSankeyLink.value,
                    style.numberFormat,
                    totalDenominator
                  )}
                </span>
                {style.numberFormat !== 'percent' && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500">
                      {((hoveredSankeyLink.value / Math.max(totalDenominator, 1)) * 100).toFixed(1)}%
                    </span>
                  </>
                )}
              </>
            ) : hoveredChordRibbon ? (
              <>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: hoveredChordRibbon.color }}
                />
                <span className="font-medium">
                  {hoveredChordRibbon.sourceName} &rarr; {hoveredChordRibbon.targetName}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatSankeyValue(
                    hoveredChordRibbon.sourceValue,
                    style.numberFormat,
                    totalDenominator
                  )}
                </span>
                {!style.chordDirected && hoveredChordRibbon.targetValue > 0 && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-slate-500">
                      return:{' '}
                      <span className="font-mono text-slate-800">
                        {formatSankeyValue(
                          hoveredChordRibbon.targetValue,
                          style.numberFormat,
                          totalDenominator
                        )}
                      </span>
                    </span>
                  </>
                )}
              </>
            ) : hoveredNode ? (
              <>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: hoveredNode.color }}
                />
                <span className="font-medium">{hoveredNode.name}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatSankeyValue(hoveredNode.value, style.numberFormat, totalDenominator)}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-[11px] text-slate-500">Click to recolour</span>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Quiet Canvas Caption */}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
        <span>
          {aspectRatio === '16:9' ? '16:9 Widescreen (13.33" × 7.5")' : '4:3 Standard (10.0" × 7.5")'}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {chartType === 'sankey' ? 'Sankey Flow' : 'Chord Matrix'}
        </span>
        <span aria-hidden="true">·</span>
        <span>Click slide title to edit or click any node to recolour</span>
      </div>
    </div>
  );
};
