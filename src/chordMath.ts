import { chord, chordDirected, ChordGroup, Chord } from 'd3-chord';
import type PptxGenJS from 'pptxgenjs';
import { getSlideCanvasDimensions } from './sankeyMath';
import {
  AspectRatio,
  ChordLayoutResult,
  ComputedChordGroup,
  ComputedChordRibbon,
  DataDiagnostic,
  FlowRow,
  SankeyStyleConfig,
} from './types';

const PX_PER_INCH = 72;

function toInches(px: number): number {
  return px / PX_PER_INCH;
}

export function validateChordData(rows: FlowRow[]): DataDiagnostic | null {
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

  return null;
}

export function computeChordLayout(
  rows: FlowRow[],
  aspectRatio: AspectRatio,
  style: SankeyStyleConfig,
  paletteColors: string[],
  nodeColorOverrides: Record<string, string>
): ChordLayoutResult {
  const { width: canvasWidth, height: canvasHeight } = getSlideCanvasDimensions(aspectRatio);
  const diagnostic = validateChordData(rows);

  const topMargin = style.showHeader ? 86 : 28;
  const bottomMargin = 28;
  const availH = canvasHeight - topMargin - bottomMargin;
  const outerRadius = Math.max(88, Math.floor(availH / 2 - 40));
  const innerRadius = Math.max(40, outerRadius - style.chordRingThickness);
  const centerX = canvasWidth / 2;
  const centerY = topMargin + availH / 2;

  if (diagnostic) {
    return {
      groups: [],
      ribbons: [],
      centerX,
      centerY,
      innerRadius,
      outerRadius,
      totalFlow: 0,
      canvasWidth,
      canvasHeight,
      diagnostic,
    };
  }

  const validRows = rows.filter(
    (r) => r.source.trim() && r.target.trim() && Number.isFinite(r.value) && r.value > 0
  );

  // Build ordered node list
  const nodeNames: string[] = [];
  const nameToIndex = new Map<string, number>();
  const ensureNode = (name: string): number => {
    const existing = nameToIndex.get(name);
    if (existing !== undefined) return existing;
    const idx = nodeNames.length;
    nameToIndex.set(name, idx);
    nodeNames.push(name);
    return idx;
  };

  for (const r of validRows) {
    ensureNode(r.source.trim());
    ensureNode(r.target.trim());
  }

  const n = nodeNames.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  let totalFlow = 0;

  for (const r of validRows) {
    const si = nameToIndex.get(r.source.trim())!;
    const ti = nameToIndex.get(r.target.trim())!;
    matrix[si][ti] += r.value;
    totalFlow += r.value;
  }

  const padRad = (Math.max(0, Math.min(15, style.chordPadAngle)) * Math.PI) / 180;
  const layoutFn = (style.chordDirected ? chordDirected() : chord()).padAngle(padRad);
  const chordData = layoutFn(matrix);

  const safePalette = paletteColors.length > 0 ? paletteColors : ['#003f5c', '#2f4b7c', '#665191'];
  const labelRadius = outerRadius + 13;

  const groups: ComputedChordGroup[] = chordData.groups.map((g: ChordGroup) => {
    const name = nodeNames[g.index];
    const midAngle = (g.startAngle + g.endAngle) / 2;
    const sinM = Math.sin(midAngle);
    const cosM = Math.cos(midAngle);
    const color = nodeColorOverrides[name] || safePalette[g.index % safePalette.length];

    return {
      index: g.index,
      name,
      startAngle: g.startAngle,
      endAngle: g.endAngle,
      midAngle,
      value: g.value,
      color,
      labelX: centerX + labelRadius * sinM,
      labelY: centerY - labelRadius * cosM,
      isLeftSide: sinM < -0.001,
    };
  });

  const groupByIndex = new Map<number, ComputedChordGroup>();
  for (const g of groups) {
    groupByIndex.set(g.index, g);
  }

  const ribbons: ComputedChordRibbon[] = chordData.map((c: Chord, idx: number) => {
    const srcGroup = groupByIndex.get(c.source.index)!;
    const tgtGroup = groupByIndex.get(c.target.index)!;

    let color = '#94a3b8';
    if (style.linkColorMode === 'source') {
      color = srcGroup.color;
    } else if (style.linkColorMode === 'target') {
      color = tgtGroup.color;
    }

    return {
      index: idx,
      sourceName: srcGroup.name,
      targetName: tgtGroup.name,
      sourceIndex: c.source.index,
      targetIndex: c.target.index,
      sourceStartAngle: c.source.startAngle,
      sourceEndAngle: c.source.endAngle,
      targetStartAngle: c.target.startAngle,
      targetEndAngle: c.target.endAngle,
      sourceValue: c.source.value,
      targetValue: c.target.value,
      color,
    };
  });

  return {
    groups,
    ribbons,
    centerX,
    centerY,
    innerRadius,
    outerRadius,
    totalFlow,
    canvasWidth,
    canvasHeight,
    diagnostic: null,
  };
}

interface CubicSegment {
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  x: number;
  y: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return {
    x: cx + r * Math.sin(angle),
    y: cy - r * Math.cos(angle),
  };
}

/**
 * Approximates a circular arc (0 rad at 12 o'clock, increasing clockwise)
 * with cubic Bezier segments <= 90 degrees each. Works identically for SVG & PowerPoint custGeom.
 */
function approximateArcBeziers(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): CubicSegment[] {
  const totalDelta = endAngle - startAngle;
  if (Math.abs(totalDelta) < 1e-6) return [];

  const steps = Math.max(1, Math.ceil(Math.abs(totalDelta) / (Math.PI / 2)));
  const stepDelta = totalDelta / steps;
  const alpha = (4 / 3) * Math.tan(stepDelta / 4);

  const segments: CubicSegment[] = [];
  for (let i = 0; i < steps; i++) {
    const a0 = startAngle + i * stepDelta;
    const a1 = a0 + stepDelta;

    const p0 = polarToCartesian(cx, cy, r, a0);
    const p1 = polarToCartesian(cx, cy, r, a1);

    // Derivative of (cx + r*sin(a), cy - r*cos(a)) is (r*cos(a), r*sin(a))
    const cp1x = p0.x + alpha * r * Math.cos(a0);
    const cp1y = p0.y + alpha * r * Math.sin(a0);
    const cp2x = p1.x - alpha * r * Math.cos(a1);
    const cp2y = p1.y - alpha * r * Math.sin(a1);

    segments.push({ cp1x, cp1y, cp2x, cp2y, x: p1.x, y: p1.y });
  }

  return segments;
}

export function buildChordGroupSvgPath(
  group: ComputedChordGroup,
  innerRadius: number,
  outerRadius: number,
  cx: number,
  cy: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerRadius, group.startAngle);
  const outerArcs = approximateArcBeziers(cx, cy, outerRadius, group.startAngle, group.endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, group.endAngle);
  const innerArcs = approximateArcBeziers(cx, cy, innerRadius, group.endAngle, group.startAngle);

  const parts: string[] = [`M ${outerStart.x.toFixed(2)},${outerStart.y.toFixed(2)}`];
  for (const seg of outerArcs) {
    parts.push(
      `C ${seg.cp1x.toFixed(2)},${seg.cp1y.toFixed(2)} ${seg.cp2x.toFixed(2)},${seg.cp2y.toFixed(2)} ${seg.x.toFixed(2)},${seg.y.toFixed(2)}`
    );
  }
  parts.push(`L ${innerEnd.x.toFixed(2)},${innerEnd.y.toFixed(2)}`);
  for (const seg of innerArcs) {
    parts.push(
      `C ${seg.cp1x.toFixed(2)},${seg.cp1y.toFixed(2)} ${seg.cp2x.toFixed(2)},${seg.cp2y.toFixed(2)} ${seg.x.toFixed(2)},${seg.y.toFixed(2)}`
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

export function buildChordRibbonSvgPath(
  ribbon: ComputedChordRibbon,
  innerRadius: number,
  cx: number,
  cy: number
): string {
  const s0 = polarToCartesian(cx, cy, innerRadius, ribbon.sourceStartAngle);
  const srcArcs = approximateArcBeziers(
    cx,
    cy,
    innerRadius,
    ribbon.sourceStartAngle,
    ribbon.sourceEndAngle
  );
  const t0 = polarToCartesian(cx, cy, innerRadius, ribbon.targetStartAngle);
  const tgtArcs = approximateArcBeziers(
    cx,
    cy,
    innerRadius,
    ribbon.targetStartAngle,
    ribbon.targetEndAngle
  );

  const isSameSubgroup =
    Math.abs(ribbon.sourceStartAngle - ribbon.targetStartAngle) < 1e-6 &&
    Math.abs(ribbon.sourceEndAngle - ribbon.targetEndAngle) < 1e-6;

  const parts: string[] = [`M ${s0.x.toFixed(2)},${s0.y.toFixed(2)}`];
  for (const seg of srcArcs) {
    parts.push(
      `C ${seg.cp1x.toFixed(2)},${seg.cp1y.toFixed(2)} ${seg.cp2x.toFixed(2)},${seg.cp2y.toFixed(2)} ${seg.x.toFixed(2)},${seg.y.toFixed(2)}`
    );
  }

  if (!isSameSubgroup) {
    parts.push(`Q ${cx.toFixed(2)},${cy.toFixed(2)} ${t0.x.toFixed(2)},${t0.y.toFixed(2)}`);
    for (const seg of tgtArcs) {
      parts.push(
        `C ${seg.cp1x.toFixed(2)},${seg.cp1y.toFixed(2)} ${seg.cp2x.toFixed(2)},${seg.cp2y.toFixed(2)} ${seg.x.toFixed(2)},${seg.y.toFixed(2)}`
      );
    }
  }

  parts.push(`Q ${cx.toFixed(2)},${cy.toFixed(2)} ${s0.x.toFixed(2)},${s0.y.toFixed(2)}`);
  parts.push('Z');
  return parts.join(' ');
}

type PptxPoint = NonNullable<PptxGenJS.ShapeProps['points']>[number];

export interface PptxCustomGeomBox {
  x: number;
  y: number;
  w: number;
  h: number;
  points: PptxPoint[];
}

function finalizePptxShapeFromCoords(
  rawSteps: Array<
    | { kind: 'move'; x: number; y: number }
    | { kind: 'line'; x: number; y: number }
    | { kind: 'cubic'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
    | { kind: 'quad'; cx: number; cy: number; x: number; y: number }
  >
): PptxCustomGeomBox {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const expand = (px: number, py: number) => {
    const ix = toInches(px);
    const iy = toInches(py);
    if (ix < minX) minX = ix;
    if (ix > maxX) maxX = ix;
    if (iy < minY) minY = iy;
    if (iy > maxY) maxY = iy;
  };

  for (const step of rawSteps) {
    expand(step.x, step.y);
    if (step.kind === 'cubic') {
      expand(step.cp1x, step.cp1y);
      expand(step.cp2x, step.cp2y);
    } else if (step.kind === 'quad') {
      expand(step.cx, step.cy);
    }
  }

  const w = Math.max(maxX - minX, 0.01);
  const h = Math.max(maxY - minY, 0.01);
  const localX = (px: number) => Number((toInches(px) - minX).toFixed(4));
  const localY = (py: number) => Number((toInches(py) - minY).toFixed(4));

  const points: PptxPoint[] = rawSteps.map((step) => {
    if (step.kind === 'move') {
      return { x: localX(step.x), y: localY(step.y), moveTo: true };
    }
    if (step.kind === 'line') {
      return { x: localX(step.x), y: localY(step.y) };
    }
    if (step.kind === 'cubic') {
      return {
        x: localX(step.x),
        y: localY(step.y),
        curve: {
          type: 'cubic',
          x1: localX(step.cp1x),
          y1: localY(step.cp1y),
          x2: localX(step.cp2x),
          y2: localY(step.cp2y),
        },
      };
    }
    return {
      x: localX(step.x),
      y: localY(step.y),
      curve: {
        type: 'quadratic',
        x1: localX(step.cx),
        y1: localY(step.cy),
      },
    };
  });
  points.push({ close: true });

  return {
    x: Number(minX.toFixed(4)),
    y: Number(minY.toFixed(4)),
    w: Number(w.toFixed(4)),
    h: Number(h.toFixed(4)),
    points,
  };
}

export function buildChordGroupPptxShape(
  group: ComputedChordGroup,
  innerRadius: number,
  outerRadius: number,
  cx: number,
  cy: number
): PptxCustomGeomBox {
  const outerStart = polarToCartesian(cx, cy, outerRadius, group.startAngle);
  const outerArcs = approximateArcBeziers(cx, cy, outerRadius, group.startAngle, group.endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, group.endAngle);
  const innerArcs = approximateArcBeziers(cx, cy, innerRadius, group.endAngle, group.startAngle);

  const steps: Parameters<typeof finalizePptxShapeFromCoords>[0] = [
    { kind: 'move', x: outerStart.x, y: outerStart.y },
    ...outerArcs.map((s) => ({ kind: 'cubic' as const, ...s })),
    { kind: 'line', x: innerEnd.x, y: innerEnd.y },
    ...innerArcs.map((s) => ({ kind: 'cubic' as const, ...s })),
  ];

  return finalizePptxShapeFromCoords(steps);
}

export function buildChordRibbonPptxShape(
  ribbon: ComputedChordRibbon,
  innerRadius: number,
  cx: number,
  cy: number
): PptxCustomGeomBox {
  const s0 = polarToCartesian(cx, cy, innerRadius, ribbon.sourceStartAngle);
  const srcArcs = approximateArcBeziers(
    cx,
    cy,
    innerRadius,
    ribbon.sourceStartAngle,
    ribbon.sourceEndAngle
  );
  const t0 = polarToCartesian(cx, cy, innerRadius, ribbon.targetStartAngle);
  const tgtArcs = approximateArcBeziers(
    cx,
    cy,
    innerRadius,
    ribbon.targetStartAngle,
    ribbon.targetEndAngle
  );

  const isSameSubgroup =
    Math.abs(ribbon.sourceStartAngle - ribbon.targetStartAngle) < 1e-6 &&
    Math.abs(ribbon.sourceEndAngle - ribbon.targetEndAngle) < 1e-6;

  const steps: Parameters<typeof finalizePptxShapeFromCoords>[0] = [
    { kind: 'move', x: s0.x, y: s0.y },
    ...srcArcs.map((s) => ({ kind: 'cubic' as const, ...s })),
  ];

  if (!isSameSubgroup) {
    steps.push({ kind: 'quad', cx, cy, x: t0.x, y: t0.y });
    steps.push(...tgtArcs.map((s) => ({ kind: 'cubic' as const, ...s })));
  }

  steps.push({ kind: 'quad', cx, cy, x: s0.x, y: s0.y });

  return finalizePptxShapeFromCoords(steps);
}
