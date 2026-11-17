export interface FlowRow {
  id: string;
  source: string;
  target: string;
  value: number;
}

export type AspectRatio = '16:9' | '4:3';

export type ChartType = 'sankey' | 'chord';

export type LinkColorMode = 'source' | 'target' | 'neutral';

export type NumberFormat = 'raw' | 'usd' | 'inr' | 'compact' | 'percent';

export type NodeAlign = 'justify' | 'left' | 'right' | 'center';

export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

export interface SankeyStyleConfig {
  nodeWidth: number;
  nodePadding: number;
  ribbonOpacity: number;
  fontSize: number;
  linkColorMode: LinkColorMode;
  nodeAlign: NodeAlign;
  showValues: boolean;
  numberFormat: NumberFormat;
  showHeader: boolean;
  title: string;
  subtitle: string;
  chordRingThickness: number;
  chordPadAngle: number;
  chordDirected: boolean;
}

export interface ComputedSankeyNode {
  name: string;
  index: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  value: number;
  depth: number;
  height: number;
  layer: number;
  color: string;
  isRightmost: boolean;
}

export interface ComputedSankeyLink {
  index: number;
  sourceName: string;
  targetName: string;
  source: ComputedSankeyNode;
  target: ComputedSankeyNode;
  value: number;
  width: number;
  y0: number;
  y1: number;
  color: string;
}

export interface ComputedChordGroup {
  index: number;
  name: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  value: number;
  color: string;
  labelX: number;
  labelY: number;
  isLeftSide: boolean;
}

export interface ComputedChordRibbon {
  index: number;
  sourceName: string;
  targetName: string;
  sourceIndex: number;
  targetIndex: number;
  sourceStartAngle: number;
  sourceEndAngle: number;
  targetStartAngle: number;
  targetEndAngle: number;
  sourceValue: number;
  targetValue: number;
  color: string;
}

export interface DataDiagnostic {
  type: 'cycle' | 'self-loop' | 'invalid-value' | 'empty';
  message: string;
  offendingRowIds: string[];
  cyclePath?: string[];
}

export interface SankeyLayoutResult {
  nodes: ComputedSankeyNode[];
  links: ComputedSankeyLink[];
  totalRootInflow: number;
  canvasWidth: number;
  canvasHeight: number;
  diagnostic: DataDiagnostic | null;
}

export interface ChordLayoutResult {
  groups: ComputedChordGroup[];
  ribbons: ComputedChordRibbon[];
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
  totalFlow: number;
  canvasWidth: number;
  canvasHeight: number;
  diagnostic: DataDiagnostic | null;
}

export interface SampleDataset {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  numberFormat: NumberFormat;
  recommendedChartType?: ChartType;
  rows: Omit<FlowRow, 'id'>[];
}

export interface SankeyDocumentState {
  chartType: ChartType;
  rows: FlowRow[];
  aspectRatio: AspectRatio;
  activePaletteId: string;
  customPaletteColors: Record<string, string[]>;
  nodeColorOverrides: Record<string, string>;
  style: SankeyStyleConfig;
}
