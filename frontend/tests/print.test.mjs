import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutReceipts, reorderPrintItems, swapPrintPositions, DEFAULT_PRINT_SETTINGS } from '../src/utils/printLayout.ts';
import { cropPixels, renderPrintImage } from '../src/utils/printImage.ts';
const photo = (id, width = 400, height = 800, crop = null, rotation = 0) => ({ id, kind: 'photo', name: '가상 사진', source: 'ocr', original: 'original', output: 'output', width, height, crop, rotation });
const ids = items => items.map(item => item.id);

test('사진·빈 영역 앞뒤 이동은 자르기·원본 참조와 입력 목록을 유지한다', () => {
  const first = photo('1', 400, 800, { x: .1, y: .1, width: .6, height: .7 });
  const list = [first, { id: '2', kind: 'blank', size: 2 }, photo('3'), photo('4')];
  assert.deepEqual(ids(reorderPrintItems(list, '1', '3', true)), ['2', '3', '1', '4']);
  assert.deepEqual(ids(reorderPrintItems(list, '4', '2', false)), ['1', '4', '2', '3']);
  assert.deepEqual(ids(reorderPrintItems(list, '2', '3', true)), ['1', '3', '2', '4']);
  assert.deepEqual(ids(reorderPrintItems(list, '3', '2', false)), ['1', '3', '2', '4']);
  assert.equal(reorderPrintItems(list, '1', '1', true), list);
  assert.equal(reorderPrintItems(list, 'missing', '2', false), list);
  assert.equal(reorderPrintItems(list, '1', 'missing', true), list);
  assert.equal(reorderPrintItems(list, '1', '3', true)[2], first);
  assert.deepEqual(ids(list), ['1', '2', '3', '4']);
});

test('빈 목록은 출력 페이지가 없고 기본 폭은 두 열이다', () => {
  assert.deepEqual(layoutReceipts([], DEFAULT_PRINT_SETTINGS).pages, []);
  assert.equal(layoutReceipts([], DEFAULT_PRINT_SETTINGS).columns, 2);
});

test('80mm와 95mm 폭에서 짧은 영수증 두 장을 첫 줄에 나란히 배치한다', () => {
  for (const width of [80, 95]) {
    const { pages, columns } = layoutReceipts([photo('a', 400, 480), photo('b', 400, 460)], { ...DEFAULT_PRINT_SETTINGS, width });
    assert.equal(columns, 2);
    assert.equal(pages.length, 1);
    const [left, right] = pages[0];
    assert.equal(left.y, right.y);
    assert.ok(left.x + left.width < right.x);
  }
});

test('폭·여백·간격·캡션·자르기·회전 조합에서 용지 초과나 겹침이 없다', () => {
  const items = [photo('long', 100, 6000), photo('wide', 2000, 250), photo('crop', 400, 800, { x: .2, y: .3, width: .6, height: .5 }), photo('rotate', 400, 800, null, 90), ...Array.from({ length: 5 }, (_, i) => ({ id: `blank-${i}`, kind: 'blank', size: i + 1 })), ...Array.from({ length: 20 }, (_, i) => photo(`p-${i}`, 300 + i * 11, 350 + i * 67))];
  for (const width of [30, 58, 80, 95, 190]) for (const margin of [5, 10, 30]) for (const gap of [0, 6, 20]) for (const caption of [false, true]) {
    const { pages } = layoutReceipts(items, { ...DEFAULT_PRINT_SETTINGS, width, margin, gap, caption });
    assert.equal(pages.flat().length, items.length);
    assert.ok(pages.length > 1);
    assert.ok(pages.every(page => page.length));
    for (const page of pages) for (const a of page) {
      assert.ok(a.width > 0 && a.height > 0);
      assert.ok(a.x >= margin / 2 - .001 && a.y >= margin - .001);
      assert.ok(a.x + a.width <= 210 - margin / 2 + .001);
      assert.ok(a.y + a.height <= 297 - margin + .001);
      for (const b of page) if (a !== b) assert.ok(a.x + a.width <= b.x + .001 || b.x + b.width <= a.x + .001 || a.y + a.height <= b.y + .001 || b.y + b.height <= a.y + .001);
    }
  }
});

test('긴 사진은 전체를 한 장 안으로 축소하고 자르기·회전을 높이에 반영한다', () => {
  const original = layoutReceipts([photo('a')], DEFAULT_PRINT_SETTINGS).pages[0][0];
  const crop = layoutReceipts([photo('a', 400, 800, { x: 0, y: 0, width: 1, height: .5 })], DEFAULT_PRINT_SETTINGS).pages[0][0];
  const rotated = layoutReceipts([photo('a', 400, 800, null, 90)], DEFAULT_PRINT_SETTINGS).pages[0][0];
  assert.ok(crop.height < original.height && rotated.height < crop.height);
  const result = layoutReceipts([photo('a', 100, 6000)], DEFAULT_PRINT_SETTINGS);
  assert.equal(result.scaledCount, 1);
  assert.equal(result.pages[0][0].height, 277);
  assert.ok(result.pages[0][0].width < 80);
});

test('자르기 좌표는 픽셀 범위 안에 있고 잘못된 영역은 거부한다', () => {
  assert.deepEqual(cropPixels(400, 800, null), { x: 0, y: 0, width: 400, height: 800 });
  assert.deepEqual(cropPixels(400, 800, { x: .25, y: .25, width: .5, height: .5 }), { x: 100, y: 200, width: 200, height: 400 });
  assert.throws(() => cropPixels(400, 800, { x: .8, y: 0, width: .5, height: 1 }));
  assert.throws(() => cropPixels(400, 800, { x: NaN, y: 0, width: 1, height: 1 }));
});

test('출력 자르기·회전은 원본에서 별도 Canvas를 만들며 원본을 덮어쓰지 않는다', async t => {
  const previousDocument = globalThis.document, previousImage = globalThis.Image;
  const calls = [], canvas = { width: 0, height: 0, getContext: () => ({ translate: (...args) => calls.push(['translate', ...args]), rotate: angle => calls.push(['rotate', angle]), drawImage: (...args) => calls.push(['draw', ...args]) }), toDataURL: () => 'data:image/png;base64,output' };
  globalThis.document = { createElement: () => canvas };
  globalThis.Image = class { naturalWidth = 400; naturalHeight = 800; set src(value) { this.source = value; queueMicrotask(() => this.onload()); } };
  t.after(() => { globalThis.document = previousDocument; globalThis.Image = previousImage; });
  assert.equal(await renderPrintImage('original', { x: .25, y: .25, width: .5, height: .5 }, 90), 'data:image/png;base64,output');
  assert.equal(canvas.width, 400); assert.equal(canvas.height, 200);
  assert.deepEqual(calls.find(call => call[0] === 'draw').slice(2), [100, 200, 200, 400, -100, -200, 200, 400]);
  assert.equal(await renderPrintImage('original', null, 0), 'original');
});

test('직접 지정한 좌표에서 영수증을 세로로 놓고 다른 영수증 위치를 유지한다', () => {
  const items = [photo('a', 400, 480), photo('b', 400, 460)];
  const positions = new Map([
    ['a', { page: 0, x: 20, y: 10 }],
    ['b', { page: 0, x: 20, y: 120 }],
  ]);
  const { pages } = layoutReceipts(items, DEFAULT_PRINT_SETTINGS, positions);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].map(({ x, y }) => [x, y]), [[20, 10], [20, 120]]);
  assert.ok(pages[0][0].y + pages[0][0].height < pages[0][1].y);
});

test('용지 바깥 좌표를 보정하고 크기가 바뀌어도 항목을 겹치거나 누락시키지 않는다', () => {
  const items = [photo('a', 400, 480), photo('b', 400, 460)];
  const positions = new Map([
    ['a', { page: 0, x: -20, y: -10 }],
    ['b', { page: 0, x: 5, y: 10 }],
  ]);
  const { pages } = layoutReceipts(items, { ...DEFAULT_PRINT_SETTINGS, width: 190 }, positions);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map(page => page.map(({ item }) => item.id)), [['a'], ['b']]);
  assert.equal(pages[0][0].x, 5);
  assert.equal(pages[0][0].y, 10);
});

test('크기가 다른 빈 영역은 둘 다 들어갈 때만 위치를 맞바꾼다', () => {
  const items = [{ id: 's', kind: 'blank', size: 2 }, { id: 'm', kind: 'blank', size: 3 }];
  const { pages } = layoutReceipts(items, DEFAULT_PRINT_SETTINGS);
  const [left, right] = pages[0];
  assert.deepEqual(swapPrintPositions(pages, 's', 'm', DEFAULT_PRINT_SETTINGS), {
    source: { page: 0, x: right.x, y: right.y },
    target: { page: 0, x: left.x, y: left.y },
  });
  const obstacle = { ...left, item: { id: 'obstacle', kind: 'blank', size: 1 }, y: left.y + left.height + 6, height: 10 };
  assert.equal(swapPrintPositions([[left, right, obstacle]], 's', 'm', DEFAULT_PRINT_SETTINGS), null);
});
