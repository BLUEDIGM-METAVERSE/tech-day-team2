import type { PrintItem, PrintSettings } from '../types/print';

export const BLANK_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  width: 80, gap: 6, margin: 10, cut: true, caption: false, gray: false, blankLabel: true,
};
export function bounded(value: number, min: number, max: number, fallback = min): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function reorderPrintItems<T extends { id: string }>(items: T[], source: string, target: string, after: boolean): T[] {
  if (source === target || !items.some(item => item.id === source) || !items.some(item => item.id === target)) return items;
  const moved = items.find(item => item.id === source)!;
  const next = items.filter(item => item.id !== source);
  next.splice(next.findIndex(item => item.id === target) + (after ? 1 : 0), 0, moved);
  return next;
}
export interface PrintPlacement { item: PrintItem; x: number; y: number; width: number; height: number; scaled: boolean }
export interface PrintPosition { page: number; x: number; y: number }

export function overlapsPrintPlacement(a: PrintPlacement, b: PrintPlacement) {
  return a.x < b.x + b.width - .001 && a.x + a.width > b.x + .001
    && a.y < b.y + b.height - .001 && a.y + a.height > b.y + .001;
}

export function fitPrintPosition(position: PrintPosition, item: PrintPlacement, settings: PrintSettings): PrintPosition {
  const margin = bounded(settings.margin, 5, 30, 10);
  return {
    page: position.page,
    x: bounded(position.x, margin / 2, 210 - margin / 2 - item.width),
    y: bounded(position.y, margin, 297 - margin - item.height),
  };
}

export function swapPrintPositions(
  pages: PrintPlacement[][], sourceId: string, targetId: string, settings: PrintSettings,
) {
  const locate = (id: string) => pages.flatMap((page, index) =>
    page.filter(entry => entry.item.id === id).map(entry => ({ ...entry, page: index })))[0];
  const source = locate(sourceId), target = locate(targetId);
  if (!source || !target || sourceId === targetId) return null;

  const fits = (entry: PrintPlacement, position: PrintPosition) => {
    const fitted = fitPrintPosition(position, entry, settings);
    return Math.abs(fitted.x - position.x) <= .001 && Math.abs(fitted.y - position.y) <= .001
      && !pages[position.page].some(other => other.item.id !== sourceId && other.item.id !== targetId
        && overlapsPrintPlacement({ ...entry, ...position }, other));
  };
  const nextSource = { page: target.page, x: target.x, y: target.y };
  const nextTarget = { page: source.page, x: source.x, y: source.y };
  if (!fits(source, nextSource) || !fits(target, nextTarget)) return null;
  if (source.page === target.page
    && overlapsPrintPlacement({ ...source, ...nextSource }, { ...target, ...nextTarget })) return null;
  return { source: nextSource, target: nextTarget };
}

export function layoutReceipts(items: PrintItem[], settings: PrintSettings, positions?: ReadonlyMap<string, PrintPosition>) {
  const margin = bounded(settings.margin, 5, 30, 10);
  const sideMargin = margin / 2;
  const gap = bounded(settings.gap, 0, 20, 6);
  const availableWidth = 210 - 2 * sideMargin, availableHeight = 297 - 2 * margin;
  const width = Math.min(availableWidth, bounded(settings.width, 30, 190, 80));
  const columns = Math.max(1, Math.floor((availableWidth + gap) / (width + gap)));
  const offset = sideMargin + (availableWidth - columns * width - (columns - 1) * gap) / 2;
  const inset = 3.5; // two sides: padding 1.5mm + border .25mm
  const pages: PrintPlacement[][] = [];
  let heights: number[] = [];
  let page: PrintPlacement[] | null = null;
  let scaledCount = 0;
  for (const item of items) {
    let itemWidth = width, height: number, scaled = false;
    if (item.kind === 'blank') {
      const size = bounded(item.size, 1, 5);
      height = (availableHeight - 4 * gap) / 5 * size + gap * (size - 1);
    } else {
      let imageWidth = width - inset;
      const caption = settings.caption ? 4 : 0;
      let ratio = (item.crop?.height ?? 1) * item.height / ((item.crop?.width ?? 1) * item.width);
      if (item.rotation % 180 !== 0) ratio = 1 / ratio;
      height = imageWidth * ratio + inset + caption;
      if (height > availableHeight) {
        imageWidth = (availableHeight - inset - caption) / ratio;
        itemWidth = imageWidth + inset;
        height = availableHeight; scaled = true; scaledCount++;
      }
    }
    if (!page) { page = []; pages.push(page); heights = Array(columns).fill(0); }
    // 빈 열부터 채우고, 그다음 가장 위쪽에 들어가는 자리를 사용한다.
    let column = -1;
    for (const [index, bottom] of heights.entries()) {
      const nextY = bottom ? bottom + gap : 0;
      if (nextY + height <= availableHeight + .001 && (column < 0 || bottom < heights[column])) {
        column = index;
      }
    }
    if (column < 0) { page = []; pages.push(page); heights = Array(columns).fill(0); column = 0; }
    const y = heights[column] ? heights[column] + gap : 0;
    heights[column] = y + height;
    page.push({ item, x: offset + column * (width + gap) + (width - itemWidth) / 2, y: margin + y, width: itemWidth, height, scaled });
  }
  if (!positions?.size) return { pages, columns, scaledCount };

  const arranged: PrintPlacement[][] = [];
  const placed = new Set<string>();
  const add = (index: number, entry: PrintPlacement) => {
    const target = arranged[index] ?? (arranged[index] = []);
    if (target.some(other => overlapsPrintPlacement(entry, other))) return false;
    target.push(entry);
    return true;
  };

  // Reserve manually placed items before assigning automatic slots.
  for (const entry of pages.flat()) {
    const position = positions.get(entry.item.id);
    if (!position) continue;
    const { page, x, y } = fitPrintPosition(position, entry, settings);
    if (add(page, { ...entry, x, y })) placed.add(entry.item.id);
  }
  pages.forEach((page, index) => {
    for (const entry of page) {
      if (placed.has(entry.item.id)) continue;
      let destination = index;
      while (!add(destination, entry)) destination++;
    }
  });

  return { pages: arranged.filter(page => page?.length), columns, scaledCount };
}
