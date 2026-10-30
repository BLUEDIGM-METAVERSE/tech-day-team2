import { createServer } from 'node:http';
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.url === '/api/health') return res.end(JSON.stringify({ status: 'ok', mode: 'mock' }));
  if (req.method === 'POST' && req.url === '/api/extract') {
    req.resume();
    return res.end(JSON.stringify({ data: { date: '2026-10-29', merchant: '샘플상점', amount: 12000 }, engine: 'mock', warnings: ['개발용 가짜 결과입니다. 실제 OCR은 연결되지 않았습니다.'] }));
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' } }));
});
server.listen(3001, '127.0.0.1', () => console.info('개발용 API: http://127.0.0.1:3001'));
