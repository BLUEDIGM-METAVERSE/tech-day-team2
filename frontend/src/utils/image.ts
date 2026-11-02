// type·quality를 주면 그 형식으로 내보낸다. 폰→PC 전송처럼 용량이 중요한 곳은 JPEG를 쓴다.
export async function resizeImage(file: File, type: 'image/png' | 'image/jpeg' = 'image/png', quality = 0.85): Promise<string> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('지원하지 않는 형식입니다. JPG·PNG·WebP 이미지를 선택해 주세요.');
  if (file.size === 0) throw new Error('빈 파일입니다. 다른 이미지를 선택해 주세요.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('이미지가 손상되었거나 읽을 수 없습니다. 다른 이미지를 선택해 주세요.'); }
  try {
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('이미지 크기를 확인할 수 없습니다.');
    const ratio = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width*ratio)); canvas.height = Math.max(1,Math.round(bitmap.height*ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서 이미지를 처리할 수 없습니다.');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const preview = canvas.toDataURL(type, quality);
    if (!preview.startsWith(`data:${type};`)) throw new Error('이미지 변환에 실패했습니다. 다른 이미지를 선택해 주세요.');
    return preview;
  } finally { bitmap.close(); }
}
