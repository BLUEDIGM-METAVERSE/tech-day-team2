import type { ReceiptData, ReceiptResult } from '../types/receipt';
import { ACCOUNTS, type Section } from '../constants/accounts';
import { isRowValid } from '../utils/excel';
import { ExpenseRowFields } from './ExpenseRowFields';
import { SheetHead } from './SheetHead';
interface Props { draft: ReceiptResult | null; nextNo: number; onChange: (result: ReceiptResult) => void; onAdd: () => void; onDiscard: () => void }
// 방금 추출한 결과 한 건을 확인·수정한 뒤 목록에 추가하는 카드.
export function ResultPanel({ draft, nextNo, onChange, onAdd, onDiscard }: Props) {
  function update(data: Partial<ReceiptData>) { if (draft) onChange({...draft, data: {...draft.data, ...data}}); }
  // 경비 구분을 바꾸면 새 목록에 없는 계정과목은 비운다.
  function changeSection(section: Section) {
    const account = draft?.data.account && ACCOUNTS[section].includes(draft.data.account) ? draft.data.account : '';
    update({section, account});
  }
  const section: Section = draft?.data.section === 'project' ? 'project' : 'dept';
  const valid = !!draft && isRowValid(draft.data);
  return <section className="card result-card"><h2>추출 결과 확인</h2><p className="hint">결과를 확인·수정한 뒤 목록에 추가하세요. 추가하면 다음 영수증을 바로 선택할 수 있습니다.</p>
    {!draft ? <div className="empty">영수증을 선택하고 결과를 불러오세요.</div> : <>
      <div className="result-toolbar"><label>경비 구분 <select value={section} onChange={e => changeSection(e.target.value as Section)}><option value="dept">부서경비</option><option value="project">프로젝트경비</option></select></label><span className="badge">사용 엔진: {draft.engine}</span></div>
      {draft.warnings.map(w => <p className="notice" key={w}>{w}</p>)}
      <div className="table-wrap"><table className={'expense-sheet ' + section}><SheetHead section={section}/><tbody>
        <tr><th className="row-number">{(section === 'project' ? 46 : 22) + nextNo - 1}</th><td className="entry-no">{nextNo}</td><ExpenseRowFields data={draft.data} section={section} onChange={update}/></tr>
      </tbody></table></div>
      {!valid && <p role="alert">일자·거래처를 입력하고, 금액은 0보다 큰 원 단위 정수인지 확인해 주세요.</p>}
      <div className="copy-actions"><button className="primary" disabled={!valid} onClick={onAdd}>목록에 추가</button><button onClick={onDiscard}>버리기</button></div>
      <p className="hint">계정과목·결제수단은 목록에서 선택하고, 프로젝트번호는 원본 목록을 확인해 직접 입력합니다. 목록에 넣은 뒤에도 수정할 수 있습니다.</p>
    </>}
  </section>;
}
