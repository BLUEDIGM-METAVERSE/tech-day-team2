import { useEffect, useRef, useState } from 'react';
import type { ExpenseRow, ReceiptData } from '../types/receipt';
import type { Section } from '../constants/accounts';
import { isRowValid, rowsHtml, rowsTsv, sectionOf } from '../utils/excel';
import { copyTextAndHtml } from '../utils/clipboard';
import { ExpenseRowFields } from './ExpenseRowFields';
import { SheetHead } from './SheetHead';
interface Props {
  rows: ExpenseRow[];
  onChange: (id: string, data: Partial<ReceiptData>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}
// 원본 양식의 상세 행 범위. 붙여넣기 안내용이며 시트 자동 쓰기 규칙이 아니다.
const SECTIONS: { key: Section; label: string; first: number; last: number }[] = [
  { key: 'dept', label: '부서경비', first: 22, last: 36 },
  { key: 'project', label: '프로젝트경비', first: 46, last: 60 },
];
// 목록에 추가한 영수증을 경비 구분별로 모아 보여주고 한 번에 복사한다.
export function ExpenseList({ rows, onChange, onRemove, onMove }: Props) {
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // 복사 결과는 하단 토스트로 3초간 보여준다.
  function toast(text: string, error = false) {
    window.clearTimeout(timer.current); setStatus({ text, error });
    timer.current = window.setTimeout(() => setStatus(null), 3000);
  }
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function reset() { setManual(null); }
  async function copy(list: ExpenseRow[], label: string, template: boolean) {
    // 화면의 표 전체가 아니라 목록에 추가된 상세 행만 클립보드에 넣는다.
    const data = list.map(row => row.data);
    const count = data.length;
    const text = rowsTsv(data, template);
    try {
      // 텍스트와 함께 병합 폭·서식을 가진 HTML 표를 넣어 시트의 병합 셀과 서식이 유지되게 한다.
      await copyTextAndHtml(text, rowsHtml(data, template)); setManual(null);
      toast(template ? label + ' ' + count + '행을 복사했습니다. 양식의 첫 빈 행 B열에 Ctrl+V로 붙여넣으세요.' : label + ' ' + count + '행을 복사했습니다. 빈 엑셀 셀에 붙여넣으세요.');
    } catch { setManual(text); toast('자동 복사가 지원되지 않습니다. 아래 내용을 선택해 복사하세요.', true); }
  }
  return <section className="card list-card"><h2>지출결의서 목록</h2><p className="hint">복사에는 경비 구분별로 추가한 영수증 행만 포함됩니다. 추가 시 일자가 빠른 순으로 들어가며 ▲▼로 순서를 바꿀 수 있습니다. 새로고침하면 사라집니다.</p>
    {rows.length === 0 ? <div className="empty">아직 추가한 영수증이 없습니다. 위에서 확인한 결과를 목록에 추가하세요.</div> : SECTIONS.map(s => {
      const list = rows.filter(r => sectionOf(r.data) === s.key);
      if (list.length === 0) return null;
      const capacity = s.last - s.first + 1;
      const allValid = list.every(r => isRowValid(r.data));
      const total = list.reduce((sum, r) => sum + (r.data.amount ?? 0), 0);
      return <div key={s.key} className="section-block">
        <h3>{s.label} <span className="count">{list.length}건</span></h3>
        {list.length > capacity && <p className="notice">양식의 {s.label} 상세 행은 {capacity}개입니다. 초과분은 붙여넣기 전에 확인하세요.</p>}
        <div className="table-wrap"><table className={'expense-sheet ' + s.key}><SheetHead section={s.key} actions/><tbody>
          {list.map((r, i) => <tr key={r.id} className={isRowValid(r.data) ? '' : 'row-invalid'}>
            <th className="row-number">{s.first + i}</th><td className="entry-no">{i + 1}</td>
            <ExpenseRowFields data={r.data} section={s.key} onChange={d => onChange(r.id, d)}/>
            <td className="row-actions">
              <button type="button" aria-label={s.label + ' ' + (i + 1) + '번 행 위로'} disabled={i === 0} onClick={() => { onMove(r.id, -1); reset(); }}>▲</button>
              <button type="button" aria-label={s.label + ' ' + (i + 1) + '번 행 아래로'} disabled={i === list.length - 1} onClick={() => { onMove(r.id, 1); reset(); }}>▼</button>
              <button type="button" aria-label={s.label + ' ' + (i + 1) + '번 행 삭제'} onClick={() => { onRemove(r.id); reset(); }}>삭제</button>
            </td>
          </tr>)}
        </tbody><tfoot><tr><th colSpan={6}>{s.label} 합계</th><td>{total.toLocaleString('ko-KR')}원</td><td colSpan={2}/></tr></tfoot></table></div>
        {!allValid && <p role="alert">빨간 행의 일자·거래처·금액을 확인해 주세요. 금액은 0보다 큰 원 단위 정수여야 합니다.</p>}
        <div className="copy-actions">
          {/* <button disabled={!allValid} onClick={() => copy(list, s.label, false)}>엑셀용 복사 (6열)</button> */}
          <button disabled={!allValid} onClick={() => copy(list, s.label, true)}>{s.key === 'dept' ? '부서경비 내역 복사' : '프로젝트 경비 내역 복사'}</button>
          <span className="hint">'복사'를 눌러서 '지출결의서 B열'에 붙여넣어주세요.</span>
        </div>
      </div>;
    })}
    {manual !== null && <textarea aria-label="수동 복사용 데이터" readOnly value={manual} onFocus={e => e.target.select()}/>}
    <div role="status" aria-live="polite" className={'toast' + (status ? ' show' : '') + (status?.error ? ' error' : '')}>{status?.text}</div>
  </section>;
}
