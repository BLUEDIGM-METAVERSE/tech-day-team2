import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportReceipt } from '../src/utils/masking.ts';

test('전송용 PNG는 선택한 영역을 불투명하게 덮은 뒤 인코딩한다', t => {
  const steps = [];
  const image = { naturalWidth: 400, naturalHeight: 800 };
  const context = {
    clearRect() {},
    drawImage(source, x, y, width, height) { steps.push(['image', source, x, y, width, height]); },
    fillRect(...bounds) { steps.push(['mask', this.fillStyle, ...bounds]); },
  };
  const canvas = {
    getContext: () => context,
    toDataURL(type) {
      steps.push(['encode', type]);
      return 'data:image/png;base64,masked';
    },
  };
  const previous = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  t.after(() => { globalThis.document = previous; });
  assert.equal(exportReceipt(image, [
    { start: { x: 0.75, y: 0.5 }, end: { x: 0.251, y: 0.251 } },
    { start: { x: 0, y: 0 }, end: { x: 0.05, y: 0.1 } },
  ]), 'data:image/png;base64,masked');
  assert.deepEqual(steps, [
    ['image', image, 0, 0, 400, 800],
    ['mask', '#000', 100, 200, 200, 200],
    ['mask', '#000', 0, 0, 20, 80],
    ['encode', 'image/png'],
  ]);
  canvas.toDataURL = () => 'data:,';
  assert.throws(() => exportReceipt(image, []), /전송용 이미지/);
});
