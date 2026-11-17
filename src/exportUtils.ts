import { AspectRatio } from './types';
import { getSlideCanvasDimensions } from './sankeyMath';

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildStandaloneSvgString(svgElement: SVGSVGElement): string {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Remove interactive selection outline attributes if any
  clone.querySelectorAll('[data-selection-ring="true"]').forEach((el) => el.remove());

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    text { font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
    .sankey-title { font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
    .sankey-value { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  `;
  clone.insertBefore(styleEl, clone.firstChild);

  const serializer = new XMLSerializer();
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
}

export function exportSankeyToSvg(svgElement: SVGSVGElement, title: string): void {
  const svgString = buildStandaloneSvgString(svgElement);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const safeName = (title || 'sankey-diagram')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  triggerDownload(blob, `${safeName || 'sankey-diagram'}.svg`);
}

export async function exportSankeyToPng(
  svgElement: SVGSVGElement,
  aspectRatio: AspectRatio,
  title: string
): Promise<void> {
  const { width, height } = getSlideCanvasDimensions(aspectRatio);
  const scale = 3; // Crisp 3x slide resolution (2880x1620 for 16:9)

  const svgString = buildStandaloneSvgString(svgElement);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to rasterize SVG diagram.'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG encoding failed.'));
      }, 'image/png');
    });

    const safeName = (title || 'sankey-diagram')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    triggerDownload(pngBlob, `${safeName || 'sankey-diagram'}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
