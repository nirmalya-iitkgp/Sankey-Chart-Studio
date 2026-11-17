import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Download, FileCode2, Image as ImageIcon, Layers, Palette as PaletteIcon, SlidersHorizontal, Table2 } from 'lucide-react';
import { BulkPasteModal } from './components/BulkPasteModal';
import { DataInputTab } from './components/DataInputTab';
import { LayoutStylingTab } from './components/LayoutStylingTab';
import { PalettesTab } from './components/PalettesTab';
import { SlidePreviewCanvas } from './components/SlidePreviewCanvas';
import { exportSankeyToPng, exportSankeyToSvg } from './exportUtils';
import { EXECUTIVE_PALETTES, SAMPLE_DATASETS } from './palettes';
import { exportSankeyToPptx } from './pptxExporter';
import { computeSankeyLayout } from './sankeyMath';
import { AspectRatio, FlowRow, SankeyStyleConfig } from './types';

type SidebarTab = 'data' | 'palettes' | 'layout';

function createRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hydrateRows(rows: Array<Omit<FlowRow, 'id'>>): FlowRow[] {
  return rows.map((r) => ({
    ...r,
    id: createRowId(),
  }));
}

export default function App() {
  const initialSample = SAMPLE_DATASETS[0];

  const [rows, setRows] = useState<FlowRow[]>(() => hydrateRows(initialSample.rows));
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [activeTab, setActiveTab] = useState<SidebarTab>('data');
  const [activePaletteId, setActivePaletteId] = useState<string>(EXECUTIVE_PALETTES[0].id);
  const [customPaletteColors, setCustomPaletteColors] = useState<Record<string, string[]>>({});
  const [nodeColorOverrides, setNodeColorOverrides] = useState<Record<string, string>>({});
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const [style, setStyle] = useState<SankeyStyleConfig>({
    nodeWidth: 18,
    nodePadding: 20,
    ribbonOpacity: 45,
    fontSize: 12,
    linkColorMode: 'source',
    nodeAlign: 'justify',
    showValues: true,
    numberFormat: initialSample.numberFormat,
    showHeader: true,
    title: initialSample.title,
    subtitle: initialSample.subtitle,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);

  const activePalette = useMemo(
    () => EXECUTIVE_PALETTES.find((p) => p.id === activePaletteId) || EXECUTIVE_PALETTES[0],
    [activePaletteId]
  );

  const activeColors = useMemo(
    () => customPaletteColors[activePalette.id] || activePalette.colors,
    [customPaletteColors, activePalette]
  );

  const layout = useMemo(
    () => computeSankeyLayout(rows, aspectRatio, style, activeColors, nodeColorOverrides),
    [rows, aspectRatio, style, activeColors, nodeColorOverrides]
  );

  const flashStatus = useCallback((msg: string) => {
    setExportStatus(msg);
    window.setTimeout(() => {
      setExportStatus((current) => (current === msg ? null : current));
    }, 3200);
  }, []);

  const handleUpdateRow = useCallback((id: string, patch: Partial<Omit<FlowRow, 'id'>>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const handleDeleteRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleAddRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      {
        id: createRowId(),
        source: '',
        target: '',
        value: 1000,
      },
    ]);
  }, []);

  const handleApplyBulkRows = useCallback(
    (incoming: Array<Omit<FlowRow, 'id'>>, mode: 'replace' | 'append') => {
      const hydrated = hydrateRows(incoming);
      if (mode === 'replace') {
        setRows(hydrated);
        setNodeColorOverrides({});
        setSelectedNodeName(null);
      } else {
        setRows((prev) => [...prev, ...hydrated]);
      }
    },
    []
  );

  const handleLoadSample = useCallback((sampleId: string) => {
    const found = SAMPLE_DATASETS.find((s) => s.id === sampleId);
    if (!found) return;
    setRows(hydrateRows(found.rows));
    setNodeColorOverrides({});
    setSelectedNodeName(null);
    setStyle((prev) => ({
      ...prev,
      title: found.title,
      subtitle: found.subtitle,
      numberFormat: found.numberFormat,
    }));
  }, []);

  const handleUpdateSwatch = useCallback(
    (index: number, hex: string) => {
      setCustomPaletteColors((prev) => {
        const current = prev[activePalette.id] || [...activePalette.colors];
        const next = [...current];
        next[index] = hex;
        return { ...prev, [activePalette.id]: next };
      });
    },
    [activePalette]
  );

  const handleAddSwatch = useCallback(() => {
    setCustomPaletteColors((prev) => {
      const current = prev[activePalette.id] || [...activePalette.colors];
      if (current.length >= 12) return prev;
      const nextColor = current[current.length % activePalette.colors.length] || '#334155';
      return { ...prev, [activePalette.id]: [...current, nextColor] };
    });
  }, [activePalette]);

  const handleRemoveSwatch = useCallback(
    (index: number) => {
      setCustomPaletteColors((prev) => {
        const current = prev[activePalette.id] || [...activePalette.colors];
        if (current.length <= 2) return prev;
        return {
          ...prev,
          [activePalette.id]: current.filter((_, idx) => idx !== index),
        };
      });
    },
    [activePalette]
  );

  const handleResetPalette = useCallback(() => {
    setCustomPaletteColors((prev) => {
      const next = { ...prev };
      delete next[activePalette.id];
      return next;
    });
  }, [activePalette]);

  const handleSetNodeColor = useCallback((nodeName: string, hex: string) => {
    setNodeColorOverrides((prev) => ({ ...prev, [nodeName]: hex }));
  }, []);

  const handleClearNodeColor = useCallback((nodeName: string) => {
    setNodeColorOverrides((prev) => {
      const next = { ...prev };
      delete next[nodeName];
      return next;
    });
  }, []);

  const handleClearAllNodeColors = useCallback(() => {
    setNodeColorOverrides({});
  }, []);

  const handleUpdateStyle = useCallback((patch: Partial<SankeyStyleConfig>) => {
    setStyle((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleExportPptx = async () => {
    if (layout.diagnostic || layout.nodes.length === 0) {
      flashStatus('Fix data errors before exporting.');
      return;
    }
    setIsExportingPptx(true);
    try {
      await exportSankeyToPptx(layout, aspectRatio, style);
      flashStatus('Native PPTX downloaded.');
    } catch (err) {
      flashStatus(err instanceof Error ? err.message : 'PPTX export failed.');
    } finally {
      setIsExportingPptx(false);
    }
  };

  const handleExportSvg = () => {
    if (!svgRef.current || layout.diagnostic || layout.nodes.length === 0) {
      flashStatus('Fix data errors before exporting.');
      return;
    }
    exportSankeyToSvg(svgRef.current, style.title);
    flashStatus('SVG downloaded.');
  };

  const handleExportPng = async () => {
    if (!svgRef.current || layout.diagnostic || layout.nodes.length === 0) {
      flashStatus('Fix data errors before exporting.');
      return;
    }
    setIsExportingPng(true);
    try {
      await exportSankeyToPng(svgRef.current, aspectRatio, style.title);
      flashStatus('PNG downloaded.');
    } catch (err) {
      flashStatus(err instanceof Error ? err.message : 'PNG export failed.');
    } finally {
      setIsExportingPng(false);
    }
  };

  const canExport = !layout.diagnostic && layout.nodes.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F5F7] text-slate-900 lg:h-screen lg:overflow-hidden">
      {/* Top Toolbar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
        <div className="flex items-center gap-2.5 shrink-0">
          <Layers className="h-4 w-4 text-slate-900" aria-hidden="true" />
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            SankeyStudio
          </span>
        </div>

        {/* Slide Aspect Ratio Segmented Control */}
        <div
          role="group"
          aria-label="Slide aspect ratio"
          className="hidden sm:flex items-center gap-1 rounded-lg bg-slate-100 p-1"
        >
          <button
            type="button"
            onClick={() => setAspectRatio('16:9')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              aspectRatio === '16:9'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            16:9 Widescreen
          </button>
          <button
            type="button"
            onClick={() => setAspectRatio('4:3')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              aspectRatio === '4:3'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4:3 Standard
          </button>
        </div>

        {/* Export Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {exportStatus && (
            <span className="hidden xl:inline text-xs font-medium text-slate-600 mr-2 whitespace-nowrap">
              {exportStatus}
            </span>
          )}
          <button
            type="button"
            disabled={!canExport}
            onClick={handleExportSvg}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            <FileCode2 className="h-3.5 w-3.5 text-slate-500" />
            Export SVG
          </button>
          <button
            type="button"
            disabled={!canExport || isExportingPng}
            onClick={handleExportPng}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
            {isExportingPng ? 'Exporting...' : 'Export PNG'}
          </button>
          <button
            type="button"
            disabled={!canExport || isExportingPptx}
            onClick={handleExportPptx}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            {isExportingPptx ? 'Building PPTX...' : 'Download Native PPTX'}
          </button>
        </div>
      </header>

      {/* Main 2-Column Split Workspace */}
      <div className="flex flex-1 flex-col lg:flex-row lg:overflow-hidden">
        {/* Left Sidebar (380px width, scrollable) */}
        <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:w-[380px] lg:border-b-0 lg:border-r lg:overflow-hidden">
          {/* Mobile Aspect Ratio Switcher */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 sm:hidden">
            <span className="text-xs font-medium text-slate-600">Slide Aspect Ratio</span>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  aspectRatio === '16:9' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                16:9
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('4:3')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  aspectRatio === '4:3' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                4:3
              </button>
            </div>
          </div>

          {/* 3-Tab Sidebar Switcher */}
          <div
            role="tablist"
            aria-label="Editor controls"
            className="grid shrink-0 grid-cols-3 border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'data'}
              onClick={() => setActiveTab('data')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'data'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Data Input
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'palettes'}
              onClick={() => setActiveTab('palettes')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'palettes'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PaletteIcon className="h-3.5 w-3.5" />
              Palettes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'layout'}
              onClick={() => setActiveTab('layout')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'layout'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Layout
            </button>
          </div>

          {/* Scrollable Tab Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'data' && (
              <DataInputTab
                rows={rows}
                diagnostic={layout.diagnostic}
                totalRootInflow={layout.totalRootInflow}
                nodeCount={layout.nodes.length}
                numberFormat={style.numberFormat}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onAddRow={handleAddRow}
                onOpenBulkPaste={() => setIsBulkModalOpen(true)}
                onLoadSample={handleLoadSample}
              />
            )}

            {activeTab === 'palettes' && (
              <PalettesTab
                activePaletteId={activePaletteId}
                activeColors={activeColors}
                nodes={layout.nodes}
                selectedNodeName={selectedNodeName}
                nodeColorOverrides={nodeColorOverrides}
                onSelectPalette={setActivePaletteId}
                onUpdateSwatch={handleUpdateSwatch}
                onAddSwatch={handleAddSwatch}
                onRemoveSwatch={handleRemoveSwatch}
                onResetPalette={handleResetPalette}
                onSelectNode={setSelectedNodeName}
                onSetNodeColor={handleSetNodeColor}
                onClearNodeColor={handleClearNodeColor}
                onClearAllNodeColors={handleClearAllNodeColors}
              />
            )}

            {activeTab === 'layout' && (
              <LayoutStylingTab style={style} onChange={handleUpdateStyle} />
            )}
          </div>
        </aside>

        {/* Right Main Area: Live Slide Preview */}
        <main className="flex-1 overflow-auto bg-[#F4F5F7]">
          <SlidePreviewCanvas
            svgRef={svgRef}
            layout={layout}
            aspectRatio={aspectRatio}
            style={style}
            selectedNodeName={selectedNodeName}
            nodeColorOverrides={nodeColorOverrides}
            onSelectNode={setSelectedNodeName}
            onSetNodeColor={handleSetNodeColor}
            onClearNodeColor={handleClearNodeColor}
            onUpdateStyle={handleUpdateStyle}
          />
        </main>
      </div>

      {/* Bulk Paste / CSV Import Modal */}
      <BulkPasteModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onApplyRows={handleApplyBulkRows}
      />
    </div>
  );
}
