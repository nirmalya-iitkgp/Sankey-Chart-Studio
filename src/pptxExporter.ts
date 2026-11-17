import PptxGenJS from 'pptxgenjs';
import { stripHash } from './palettes';
import { formatSankeyValue, getSlideCanvasDimensions } from './sankeyMath';
import { AspectRatio, SankeyLayoutResult, SankeyStyleConfig } from './types';

const PX_PER_INCH = 72;

function toInches(px: number): number {
  return Number((px / PX_PER_INCH).toFixed(4));
}

export async function exportSankeyToPptx(
  layout: SankeyLayoutResult,
  aspectRatio: AspectRatio,
  style: SankeyStyleConfig
): Promise<void> {
  if (layout.diagnostic || layout.nodes.length === 0) {
    throw new Error('Cannot export PPTX while diagram data is empty or contains errors.');
  }

  const pptx = new PptxGenJS();
  pptx.layout = aspectRatio === '16:9' ? 'LAYOUT_WIDE' : 'LAYOUT_4x3';
  pptx.author = 'SankeyStudio';
  pptx.title = style.title || 'Sankey Flow Diagram';

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  const { inchesWidth } = getSlideCanvasDimensions(aspectRatio);

  // 1. Optional Slide Title & Subtitle as native PowerPoint text boxes
  if (style.showHeader) {
    if (style.title.trim()) {
      slide.addText(style.title.trim(), {
        x: 0.6,
        y: 0.34,
        w: inchesWidth - 1.2,
        h: 0.42,
        fontSize: 21,
        bold: true,
        fontFace: 'Arial',
        color: '0F172A',
        margin: 0,
        valign: 'top',
      });
    }

    if (style.subtitle.trim()) {
      slide.addText(style.subtitle.trim(), {
        x: 0.6,
        y: 0.74,
        w: inchesWidth - 1.2,
        h: 0.28,
        fontSize: 11,
        fontFace: 'Arial',
        color: '64748B',
        margin: 0,
        valign: 'top',
      });
    }
  }

  const ribbonTransparency = Math.max(0, Math.min(95, 100 - style.ribbonOpacity));

  // 2. Curved Ribbons as Native Freeform Shapes (custGeom)
  // Using tight per-ribbon bounding boxes with local coordinates so every ribbon
  // can be clicked, dragged, and recolored individually in PowerPoint.
  for (const link of layout.links) {
    const x0 = toInches(link.source.x1);
    const x1 = toInches(link.target.x0);
    const halfW = toInches(link.width / 2);
    const y0 = toInches(link.y0);
    const y1 = toInches(link.y1);

    const y0Top = y0 - halfW;
    const y0Bot = y0 + halfW;
    const y1Top = y1 - halfW;
    const y1Bot = y1 + halfW;
    const midX = (x0 + x1) / 2;

    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0Top, y1Top);
    const maxY = Math.max(y0Bot, y1Bot);

    const boxW = Math.max(maxX - minX, 0.01);
    const boxH = Math.max(maxY - minY, 0.01);

    const lx0 = Number((x0 - minX).toFixed(4));
    const lx1 = Number((x1 - minX).toFixed(4));
    const lMidX = Number((midX - minX).toFixed(4));
    const ly0Top = Number((y0Top - minY).toFixed(4));
    const ly0Bot = Number((y0Bot - minY).toFixed(4));
    const ly1Top = Number((y1Top - minY).toFixed(4));
    const ly1Bot = Number((y1Bot - minY).toFixed(4));

    slide.addShape('custGeom' as PptxGenJS.SHAPE_NAME, {
      x: minX,
      y: minY,
      w: boxW,
      h: boxH,
      fill: {
        color: stripHash(link.color),
        transparency: ribbonTransparency,
      },
      line: { width: 0 },
      points: [
        { x: lx0, y: ly0Top, moveTo: true },
        {
          x: lx1,
          y: ly1Top,
          curve: {
            type: 'cubic',
            x1: lMidX,
            y1: ly0Top,
            x2: lMidX,
            y2: ly1Top,
          },
        },
        { x: lx1, y: ly1Bot },
        {
          x: lx0,
          y: ly0Bot,
          curve: {
            type: 'cubic',
            x1: lMidX,
            y1: ly1Bot,
            x2: lMidX,
            y2: ly0Bot,
          },
        },
        { close: true },
      ],
    });
  }

  // 3. Nodes as Native Rectangles
  for (const node of layout.nodes) {
    const x = toInches(node.x0);
    const y = toInches(node.y0);
    const w = Math.max(toInches(node.x1 - node.x0), 0.04);
    const h = Math.max(toInches(node.y1 - node.y0), 0.04);

    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w,
      h,
      fill: { color: stripHash(node.color) },
      line: { width: 0 },
    });
  }

  // 4. Node Labels as Native Text Boxes
  const labelBoxW = 2.25;
  const labelBoxH = 0.46;
  const labelGap = 0.09;
  const nameFontPt = Math.max(8, Math.min(18, style.fontSize));
  const valueFontPt = Math.max(7.5, nameFontPt - 1.5);

  for (const node of layout.nodes) {
    const nodeX0 = toInches(node.x0);
    const nodeX1 = toInches(node.x1);
    const nodeCenterY = toInches((node.y0 + node.y1) / 2);

    const textRuns: PptxGenJS.TextProps[] = [
      {
        text: node.name,
        options: {
          bold: true,
          fontSize: nameFontPt,
          fontFace: 'Arial',
          color: '0F172A',
          breakLine: style.showValues,
        },
      },
    ];

    if (style.showValues) {
      textRuns.push({
        text: formatSankeyValue(node.value, style.numberFormat, layout.totalRootInflow),
        options: {
          bold: false,
          fontSize: valueFontPt,
          fontFace: 'Arial',
          color: '475569',
        },
      });
    }

    const labelX = node.isRightmost
      ? Math.max(0.08, nodeX0 - labelBoxW - labelGap)
      : Math.min(inchesWidth - labelBoxW - 0.08, nodeX1 + labelGap);

    const labelY = Math.max(0.1, nodeCenterY - labelBoxH / 2);

    slide.addText(textRuns, {
      x: Number(labelX.toFixed(4)),
      y: Number(labelY.toFixed(4)),
      w: labelBoxW,
      h: labelBoxH,
      align: node.isRightmost ? 'right' : 'left',
      valign: 'middle',
      margin: 0,
      wrap: true,
    });
  }

  const safeFileBase = (style.title || 'sankey-diagram')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  await pptx.writeFile({ fileName: `${safeFileBase || 'sankey-diagram'}.pptx` });
}
