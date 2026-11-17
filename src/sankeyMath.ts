import {
  sankey,
  sankeyCenter,
  sankeyJustify,
  sankeyLeft,
  sankeyRight,
  SankeyGraph,
  SankeyLink,
  SankeyNode,
} from 'd3-sankey';
import {
  AspectRatio,
  ComputedSankeyLink,
  ComputedSankeyNode,
  DataDiagnostic,
  FlowRow,
  NodeAlign,
  NumberFormat,
  SankeyLayoutResult,
  SankeyStyleConfig,
} from './types';

interface RawNode {
  name: string;
}

interface RawLink {
  source: number;
  target: number;
  value: number;
}

export function getSlideCanvasDimensions(aspectRatio: AspectRatio): {
  width: number;
  height: number;
  inchesWidth: number;
  inchesHeight: number;
} {
  // 72 user units per inch -> 1:1 coordinate parity with PowerPoint inches
  if (aspectRatio === '4:3') {
    return {
      width: 720,
      height: 540,
      inchesWidth: 10.0,
      inchesHeight: 7.5,
    };
  }
  return {
    width: 960,
    height: 540,
    inchesWidth: 13.3333,
    inchesHeight: 7.5,
  };
}

export function validateFlowData(rows: FlowRow[]): DataDiagnostic | null {
  if (rows.length === 0) {
    return {
      type: 'empty',
      message: 'Add at least one flow row with a Source, Target, and positive Value.',
      offendingRowIds: [],
    };
  }

  const invalidRows = rows.filter(
    (r) => !r.source.trim() || !r.target.trim() || !Number.isFinite(r.value) || r.value <= 0
  );
  if (invalidRows.length > 0 && invalidRows.length === rows.length) {
    return {
      type: 'invalid-value',
      message: 'Every row needs a Source, Target, and a numeric Value greater than zero.',
      offendingRowIds: invalidRows.map((r) => r.id),
    };
  }

  const activeRows = rows.filter(
    (r) => r.source.trim() && r.target.trim() && Number.isFinite(r.value) && r.value > 0
  );

  // Detect self-loops first (e.g. A -> A)
  const selfLoops = activeRows.filter(
    (r) => r.source.trim().toLowerCase() === r.target.trim().toLowerCase()
  );
  if (selfLoops.length > 0) {
    const first = selfLoops[0];
    return {
      type: 'self-loop',
      message: `Self-loop detected on "${first.source.trim()}". Source and Target must be different nodes.`,
      offendingRowIds: selfLoops.map((r) => r.id),
      cyclePath: [first.source.trim(), first.target.trim()],
    };
  }

  // Detect directed cycles via DFS with 3-state coloring (0 = unvisited, 1 = visiting, 2 = visited)
  const adj = new Map<string, Array<{ target: string; rowId: string }>>();
  const edgeToRowIds = new Map<string, string[]>();

  for (const row of activeRows) {
    const src = row.source.trim();
    const tgt = row.target.trim();
    if (!adj.has(src)) adj.set(src, []);
    adj.get(src)!.push({ target: tgt, rowId: row.id });

    const edgeKey = `${src}\u0000${tgt}`;
    if (!edgeToRowIds.has(edgeKey)) edgeToRowIds.set(edgeKey, []);
    edgeToRowIds.get(edgeKey)!.push(row.id);
  }

  const state = new Map<string, number>();
  const stack: string[] = [];

  for (const startNode of adj.keys()) {
    if (state.get(startNode) === 2) continue;

    const cycleNodes = dfsFindCycle(startNode, adj, state, stack);
    if (cycleNodes) {
      const offendingRowIds: string[] = [];
      for (let i = 0; i < cycleNodes.length - 1; i++) {
        const key = `${cycleNodes[i]}\u0000${cycleNodes[i + 1]}`;
        const ids = edgeToRowIds.get(key) || [];
        for (const id of ids) {
          if (!offendingRowIds.includes(id)) {
            offendingRowIds.push(id);
          }
        }
      }
      return {
        type: 'cycle',
        message: `Circular loop detected: ${cycleNodes.join(' → ')}. Remove or reverse a highlighted row to restore a valid DAG.`,
        offendingRowIds,
        cyclePath: cycleNodes,
      };
    }
  }

  return null;
}

function dfsFindCycle(
  node: string,
  adj: Map<string, Array<{ target: string; rowId: string }>>,
  state: Map<string, number>,
  stack: string[]
): string[] | null {
  state.set(node, 1);
  stack.push(node);

  const neighbors = adj.get(node) || [];
  for (const edge of neighbors) {
    const nextState = state.get(edge.target) || 0;
    if (nextState === 1) {
      const cycleStartIdx = stack.indexOf(edge.target);
      return [...stack.slice(cycleStartIdx), edge.target];
    }
    if (nextState === 0) {
      const found = dfsFindCycle(edge.target, adj, state, stack);
      if (found) return found;
    }
  }

  stack.pop();
  state.set(node, 2);
  return null;
}

function getAlignFn(align: NodeAlign) {
  switch (align) {
    case 'left':
      return sankeyLeft;
    case 'right':
      return sankeyRight;
    case 'center':
      return sankeyCenter;
    case 'justify':
    default:
      return sankeyJustify;
  }
}

export function computeSankeyLayout(
  rows: FlowRow[],
  aspectRatio: AspectRatio,
  style: SankeyStyleConfig,
  paletteColors: string[],
  nodeColorOverrides: Record<string, string>
): SankeyLayoutResult {
  const { width: canvasWidth, height: canvasHeight } = getSlideCanvasDimensions(aspectRatio);
  const diagnostic = validateFlowData(rows);

  if (diagnostic) {
    return {
      nodes: [],
      links: [],
      totalRootInflow: 0,
      canvasWidth,
      canvasHeight,
      diagnostic,
    };
  }

  const validRows = rows.filter(
    (r) => r.source.trim() && r.target.trim() && Number.isFinite(r.value) && r.value > 0
  );

  // Build unique node registry preserving first-seen order
  const nodeIndexMap = new Map<string, number>();
  const rawNodes: RawNode[] = [];
  const getOrCreateNodeIdx = (name: string): number => {
    const existing = nodeIndexMap.get(name);
    if (existing !== undefined) return existing;
    const idx = rawNodes.length;
    nodeIndexMap.set(name, idx);
    rawNodes.push({ name });
    return idx;
  };

  // Combine identical (source, target) rows for cleaner ribbon geometry
  const aggregatedEdges = new Map<string, { source: string; target: string; value: number }>();
  for (const row of validRows) {
    const src = row.source.trim();
    const tgt = row.target.trim();
    const key = `${src}\u0000${tgt}`;
    const prev = aggregatedEdges.get(key);
    if (prev) {
      prev.value += row.value;
    } else {
      aggregatedEdges.set(key, { source: src, target: tgt, value: row.value });
    }
  }

  const rawLinks: RawLink[] = [];
  for (const edge of aggregatedEdges.values()) {
    const sIdx = getOrCreateNodeIdx(edge.source);
    const tIdx = getOrCreateNodeIdx(edge.target);
    rawLinks.push({ source: sIdx, target: tIdx, value: edge.value });
  }

  // Exact PowerPoint-aligned plot margins (1 inch = 72 user units)
  const marginLeft = 43.2; // 0.6"
  const marginRight = 43.2; // 0.6"
  const marginTop = style.showHeader ? 88 : 40; // ~1.22" when title visible, ~0.55" without
  const marginBottom = 36; // 0.5"

  const layoutGenerator = sankey<RawNode, RawLink>()
    .nodeWidth(style.nodeWidth)
    .nodePadding(style.nodePadding)
    .nodeAlign(getAlignFn(style.nodeAlign))
    .extent([
      [marginLeft, marginTop],
      [canvasWidth - marginRight, canvasHeight - marginBottom],
    ]);

  const graph: SankeyGraph<RawNode, RawLink> = layoutGenerator({
    nodes: rawNodes.map((n) => ({ ...n })),
    links: rawLinks.map((l) => ({ ...l })),
  });

  const safePalette = paletteColors.length > 0 ? paletteColors : ['#003f5c', '#2f4b7c', '#665191'];
  const plotRightEdge = canvasWidth - marginRight;

  // Compute total root inflow (sum of values of nodes with no incoming links)
  let totalRootInflow = 0;
  for (const n of graph.nodes) {
    if (!n.targetLinks || n.targetLinks.length === 0) {
      totalRootInflow += n.value || 0;
    }
  }
  if (totalRootInflow <= 0) {
    totalRootInflow = Math.max(...graph.nodes.map((n) => n.value || 0), 1);
  }

  // Sort nodes visually (layer / x0, then y0) for deterministic palette assignment
  const sortedNodesForColor = [...graph.nodes].sort((a, b) => {
    const dx = (a.x0 ?? 0) - (b.x0 ?? 0);
    if (Math.abs(dx) > 1) return dx;
    return (a.y0 ?? 0) - (b.y0 ?? 0);
  });

  const assignedColors = new Map<number, string>();
  sortedNodesForColor.forEach((n, orderIdx) => {
    const idx = n.index ?? orderIdx;
    const override = nodeColorOverrides[n.name];
    assignedColors.set(idx, override || safePalette[orderIdx % safePalette.length]);
  });

  const computedNodes: ComputedSankeyNode[] = graph.nodes.map((n, idx) => {
    const nodeIdx = n.index ?? idx;
    const x0 = n.x0 ?? marginLeft;
    const x1 = n.x1 ?? x0 + style.nodeWidth;
    const y0 = n.y0 ?? marginTop;
    const y1 = n.y1 ?? y0 + 10;
    const hasOutgoing = Boolean(n.sourceLinks && n.sourceLinks.length > 0);
    // Place label on the left if terminal node or close to the right margin
    const isRightmost = !hasOutgoing || x1 >= plotRightEdge - 84;

    return {
      name: n.name,
      index: nodeIdx,
      x0,
      x1,
      y0,
      y1,
      value: n.value ?? 0,
      depth: n.depth ?? 0,
      height: n.height ?? 0,
      layer: (n as SankeyNode<RawNode, RawLink> & { layer?: number }).layer ?? n.depth ?? 0,
      color: assignedColors.get(nodeIdx) || safePalette[0],
      isRightmost,
    };
  });

  const nodeByIdx = new Map<number, ComputedSankeyNode>();
  for (const cn of computedNodes) {
    nodeByIdx.set(cn.index, cn);
  }

  const computedLinks: ComputedSankeyLink[] = graph.links.map((l, idx) => {
    const srcRaw = l.source as SankeyNode<RawNode, RawLink>;
    const tgtRaw = l.target as SankeyNode<RawNode, RawLink>;
    const srcNode = nodeByIdx.get(srcRaw.index ?? 0)!;
    const tgtNode = nodeByIdx.get(tgtRaw.index ?? 0)!;

    let linkColor = '#94a3b8';
    if (style.linkColorMode === 'source') {
      linkColor = srcNode.color;
    } else if (style.linkColorMode === 'target') {
      linkColor = tgtNode.color;
    }

    return {
      index: l.index ?? idx,
      sourceName: srcNode.name,
      targetName: tgtNode.name,
      source: srcNode,
      target: tgtNode,
      value: l.value,
      width: Math.max(l.width ?? 1, 0.75),
      y0: l.y0 ?? 0,
      y1: l.y1 ?? 0,
      color: linkColor,
    };
  });

  return {
    nodes: computedNodes,
    links: computedLinks,
    totalRootInflow,
    canvasWidth,
    canvasHeight,
    diagnostic: null,
  };
}

/**
 * Generates a closed cubic Bezier ribbon SVG path matching d3-sankey and PowerPoint custGeom geometry 1:1.
 */
export function buildRibbonSvgPath(link: ComputedSankeyLink): string {
  const x0 = link.source.x1;
  const x1 = link.target.x0;
  const halfW = link.width / 2;
  const y0Top = link.y0 - halfW;
  const y0Bot = link.y0 + halfW;
  const y1Top = link.y1 - halfW;
  const y1Bot = link.y1 + halfW;
  const midX = (x0 + x1) / 2;

  return [
    `M ${x0.toFixed(2)},${y0Top.toFixed(2)}`,
    `C ${midX.toFixed(2)},${y0Top.toFixed(2)} ${midX.toFixed(2)},${y1Top.toFixed(2)} ${x1.toFixed(2)},${y1Top.toFixed(2)}`,
    `L ${x1.toFixed(2)},${y1Bot.toFixed(2)}`,
    `C ${midX.toFixed(2)},${y1Bot.toFixed(2)} ${midX.toFixed(2)},${y0Bot.toFixed(2)} ${x0.toFixed(2)},${y0Bot.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function formatSankeyValue(
  value: number,
  format: NumberFormat,
  totalRootInflow: number
): string {
  switch (format) {
    case 'usd': {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: value % 1 === 0 ? 0 : 2,
      }).format(value);
    }
    case 'inr': {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: value % 1 === 0 ? 0 : 2,
      }).format(value);
    }
    case 'compact': {
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    }
    case 'percent': {
      const denom = totalRootInflow > 0 ? totalRootInflow : 1;
      const pct = (value / denom) * 100;
      return `${pct.toFixed(1)}%`;
    }
    case 'raw':
    default: {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
      }).format(value);
    }
  }
}
