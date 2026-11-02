// 텍스트와 HTML을 함께 클립보드에 넣는다. 실패하면 예외를 던져 호출 쪽에서 수동 복사 대안을 보여준다.
// 1) 비동기 Clipboard API: https·localhost에서만 동작한다.
// 2) copy 이벤트 + execCommand: http(LAN 주소, 폰)에서도 동작하며 두 형식을 모두 실을 수 있다.
export async function copyTextAndHtml(text: string, html: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return;
    } catch { /* 아래 구형 방식으로 재시도 */ }
  }
  if (!execCopy(text, html)) throw new Error('clipboard unavailable');
}

function execCopy(text: string, html: string): boolean {
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData('text/html', html);
  };
  // execCommand('copy')는 선택 영역이 있어야 동작하는 브라우저가 있어 임시 textarea를 선택한다.
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.appendChild(area); area.select();
  document.addEventListener('copy', onCopy);
  try { return document.execCommand('copy'); }
  catch { return false; }
  finally { document.removeEventListener('copy', onCopy); area.remove(); }
}
