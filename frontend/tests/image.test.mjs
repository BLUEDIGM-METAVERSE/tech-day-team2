import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resizeImage } from '../src/utils/image.ts';

function setup(width=3200,height=1600,{context=true,drawError=false,url='data:image/png;base64,sample'}={}) {
  let closed=0;
  const canvas={width:0,height:0,getContext:()=>context ? {drawImage(){if(drawError) throw Error('draw failed');}} : null,toDataURL:()=>url};
  globalThis.createImageBitmap=async()=>({width,height,close(){closed++;}});
  globalThis.document={createElement:()=>canvas};
  return {canvas,closed:()=>closed};
}
const file=(type='image/png',size=10)=>({type,size});
for (const type of ['image/jpeg','image/png','image/webp']) {
  test(`지원 형식 ${type}`,async()=>{const env=setup(); assert.match(await resizeImage(file(type)),/^data:image\/png/);assert.equal(env.closed(),1);});
}
for (const [w,h,ew,eh] of [[3200,1600,1600,800],[1000,4000,400,1600],[2400,2400,1600,1600],[320,200,320,200]]) {
  test(`비율 유지 ${w}x${h}`,async()=>{const e=setup(w,h);await resizeImage(file());assert.equal(e.canvas.width,ew);assert.equal(e.canvas.height,eh);});
}
test('미지원 형식은 디코딩 전 차단',async()=>{setup();globalThis.createImageBitmap=()=>{throw Error('should not decode');};await assert.rejects(resizeImage(file('text/plain')),/지원하지 않는/);});
test('빈 파일 차단',async()=>{setup();await assert.rejects(resizeImage(file('image/png',0)),/빈 파일/);});
test('손상 이미지 안내',async()=>{setup();globalThis.createImageBitmap=async()=>{throw Error('decode');};await assert.rejects(resizeImage(file()),/손상/);});
test('canvas 실패에도 자원 해제',async()=>{const e=setup(100,100,{context:false});await assert.rejects(resizeImage(file()),/브라우저/);assert.equal(e.closed(),1);});
test('그리기 실패에도 자원 해제',async()=>{const e=setup(100,100,{drawError:true});await assert.rejects(resizeImage(file()),/draw failed/);assert.equal(e.closed(),1);});
test('잘못된 변환 결과 차단 및 자원 해제',async()=>{const e=setup(100,100,{url:'data:,'});await assert.rejects(resizeImage(file()),/변환/);assert.equal(e.closed(),1);});
test('0 크기 이미지 차단 및 자원 해제',async()=>{const e=setup(0,100);await assert.rejects(resizeImage(file()),/크기/);assert.equal(e.closed(),1);});
