import type { CropRect } from '../types/print';

export function loadPrintImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('출력할 사진을 읽지 못했습니다. 다시 추가해 주세요.'));
    image.src = src;
  });
}
export function cropPixels(width: number, height: number, crop: CropRect | null) {
  const r = crop ?? { x: 0, y: 0, width: 1, height: 1 };
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001) {
    throw new Error('잘라낼 영역을 다시 선택해 주세요.');
  }
  const x = Math.min(width - 1, Math.floor(width * r.x));
  const y = Math.min(height - 1, Math.floor(height * r.y));
  return { x, y, width: Math.max(1, Math.min(width - x, Math.ceil(width * r.width))), height: Math.max(1, Math.min(height - y, Math.ceil(height * r.height))) };
}
export async function renderPrintImage(src: string, crop: CropRect | null, rotation: number): Promise<string> {
  if (!crop && rotation % 360 === 0) return src;
  const image = await loadPrintImage(src);
  const r = cropPixels(image.naturalWidth, image.naturalHeight, crop);
  const sideways = rotation % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? r.height : r.width;
  canvas.height = sideways ? r.width : r.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서 사진을 편집할 수 없습니다.');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(image, r.x, r.y, r.width, r.height, -r.width / 2, -r.height / 2, r.width, r.height);
  const result = canvas.toDataURL('image/png');
  if (!result.startsWith('data:image/png;')) throw new Error('출력 사진을 만들지 못했습니다.');
  return result;
}
