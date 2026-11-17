export interface FlowRow {
  id: string;
  source: string;
  target: string;
  value: number;
}

export type AspectRatio = '16:9' | '4:3';

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

export interface SampleDataset {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  numberFormat: NumberFormat;
  rows: Omit<FlowRow, 'id'>[];
}
