export interface Point { x: number; y: number }
export interface MaskRegion { start: Point; end: Point }

export function drawReceipt(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  regions: readonly MaskRegion[],
) {
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) throw new Error('미리보기 이미지를 준비하지 못했습니다.');

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  context.fillStyle = '#000';
  for (const { start, end } of regions) {
    // 축소된 화면에서 선택한 부분의 경계 픽셀까지 가린다.
    const left = Math.floor(Math.min(start.x, end.x) * width);
    const top = Math.floor(Math.min(start.y, end.y) * height);
    const right = Math.ceil(Math.max(start.x, end.x) * width);
    const bottom = Math.ceil(Math.max(start.y, end.y) * height);
    context.fillRect(left, top, right - left, bottom - top);
  }
}

export function exportReceipt(image: HTMLImageElement, regions: readonly MaskRegion[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  drawReceipt(canvas, image, regions);
  const encoded = canvas.toDataURL('image/png');
  if (!encoded.startsWith('data:image/png;base64,')) throw new Error('전송용 이미지를 만들지 못했습니다.');
  return encoded;
}
