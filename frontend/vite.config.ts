import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        bypass(req, res) {
          // QR 중계를 위해 Vite를 LAN에 열어도 Gemini 업로드는 로컬 PC만 사용한다.
          const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
          // OCR은 바이너리 이미지, 폰 중계는 text/plain으로 전송한다.
          const ocrImage = ['image/jpeg', 'image/png', 'image/webp'].includes(req.headers['content-type'] ?? '');
          if (ocrImage && !local) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: { code: 'OCR_LOCAL_ONLY', message: 'Gemini OCR은 이 PC에서만 사용할 수 있습니다.' } }));
            return req.url ?? '/';
          }
        },
      },
    },
  },
});
