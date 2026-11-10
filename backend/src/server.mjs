import { createApp } from './app.mjs';
import { mockEngine } from './ocr/engine.mjs';
import { createGeminiEngine } from './ocr/gemini.mjs';

const mode = process.env.OCR_MODE?.trim() || 'mock';
let engine = mockEngine;

if (mode === 'gemini') {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  const missing = [!apiKey && 'GEMINI_API_KEY', !model && 'GEMINI_MODEL'].filter(Boolean);
  if (missing.length) throw new Error(`서버 환경변수를 설정해 주세요. ${missing.join(', ')}`);
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error('GEMINI_MODEL에 Gemini 모델 ID를 설정해 주세요.');
  engine = createGeminiEngine({ apiKey, model });
} else if (mode !== 'mock') {
  throw new Error('OCR_MODE는 mock 또는 gemini여야 합니다.');
}

createApp({ engine }).listen(3001, '127.0.0.1', () => console.info(`개발용 API (${mode}): http://127.0.0.1:3001`));
