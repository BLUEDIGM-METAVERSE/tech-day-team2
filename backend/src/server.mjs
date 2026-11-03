import { createApp } from './app.mjs';

createApp().listen(3001, '127.0.0.1', () => console.info('개발용 API: http://127.0.0.1:3001'));
