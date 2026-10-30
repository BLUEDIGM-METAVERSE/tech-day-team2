import { useState } from 'react';
import type { ReceiptResult } from '../types/receipt';
import { receiptTsv } from '../utils/excel';
interface Props { result: ReceiptResult | null; onChange: (result: ReceiptResult) => void }
export function ResultPanel({ result, onChange }: Props) {
  const [copyStatus, setCopyStatus] = useState('');
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  function update(data: Partial<ReceiptResult['data']>) {
    if (result) onChange({...result, data:{...result.data,...data}});
    setCopyStatus(''); setManualCopy(null);
  }
  async function copy(template: boolean) {
    if (!result) return;
    const text = receiptTsv(result, template);
    try { await navigator.clipboard.writeText(text); setCopyStatus(template ? '양식용 행을 복사했습니다. 해당 행 B열에 붙여넣으세요.' : '6개 열을 복사했습니다. 빈 엑셀 셀에 붙여넣으세요.'); setManualCopy(null); }
    catch { setManualCopy(text); setCopyStatus('자동 복사가 지원되지 않습니다. 아래 내용을 선택해 복사하세요.'); }
  }
  const project = result?.data.section === 'project';
  const valid = result && result.data.date && result.data.merchant?.trim() && result.data.amount !== null && Number.isInteger(result.data.amount) && result.data.amount > 0;
  return <section className="card result-card"><h2>지출결의서 미리보기</h2><p className="hint">원본 양식의 상세 행 순서로 확인·수정한 뒤 엑셀에 복사하세요.</p>
    {!result ? <div className="empty">영수증을 선택하고 샘플 결과를 불러오세요.</div> : <>
      <div className="result-toolbar"><label>경비 구분 <select value={project ? 'project' : 'dept'} onChange={e => update({section:e.target.value as 'dept'|'project'})}><option value="dept">부서경비</option><option value="project">프로젝트경비</option></select></label><span className="badge">사용 엔진: {result.engine}</span></div>
      {result.warnings.map(w => <p className="notice" key={w}>{w}</p>)}
      <div className="table-wrap"><table className={'expense-sheet '+(project ? 'project' : 'dept')}><thead>
        <tr className="excel-columns"><th></th><th>A</th><th>B:C</th><th>D:F</th><th>G:O</th><th>P:R</th><th>S:U</th><th>V:X</th></tr>
        <tr><th className="row-number">{project ? 45 : 21}</th><th>NO</th><th>일자</th><th>계정과목</th><th>비용 상세내역 (전체)</th><th>거래처</th><th>금액</th><th>{project ? '프로젝트번호' : '결제수단'}</th></tr>
      </thead><tbody><tr><th className="row-number">{project ? 46 : 22}</th><td className="entry-no">1</td>
        <td><input aria-label="일자" type="date" value={result.data.date ?? ''} onChange={e => update({date:e.target.value || null})} /></td>
        <td><input aria-label="계정과목" placeholder="직접 입력" value={result.data.account ?? ''} onChange={e => update({account:e.target.value})}/></td>
        <td><input aria-label="비용 상세내역" placeholder="사용 목적 등" value={result.data.description ?? ''} onChange={e => update({description:e.target.value})}/></td>
        <td><input aria-label="거래처" value={result.data.merchant ?? ''} onChange={e => update({merchant:e.target.value || null})}/></td>
        <td><input aria-label="금액" type="number" min="1" step="1" value={result.data.amount ?? ''} onChange={e => update({amount:e.target.value === '' ? null : Number(e.target.value)})}/></td>
        <td><input aria-label={project ? '프로젝트번호' : '결제수단'} placeholder="직접 입력" value={(project ? result.data.project : result.data.payment) ?? ''} onChange={e => update(project ? {project:e.target.value} : {payment:e.target.value})}/></td>
      </tr></tbody><tfoot><tr><th colSpan={6}>{project ? '프로젝트경비' : '부서경비'} 합계</th><td>{(result.data.amount ?? 0).toLocaleString('ko-KR')}원</td><td/></tr></tfoot></table></div>
      {!valid && <p role="alert">일자·거래처를 입력하고, 금액은 0보다 큰 원 단위 정수인지 확인해 주세요.</p>}
      <div className="copy-actions"><button className="primary" disabled={!valid} onClick={() => copy(false)}>엑셀용 복사 (6열)</button><button disabled={!valid} onClick={() => copy(true)}>원본 양식용 복사 (B~X)</button></div>
      <p className="hint">6열 복사: 일자 → 계정과목 → 비용 상세내역 → 거래처 → 금액 → {project ? '프로젝트번호' : '결제수단'}. 머리글·합계는 복사하지 않습니다.</p>
      <p className="hint">원본 양식용: {project ? '46~60' : '22~36'}행 중 빈 행의 B열에서 붙여넣으세요. 병합 상태에 따라 붙여넣기가 제한될 수 있으므로 시트 사본에서 먼저 확인하세요. 계정과목·결제수단·프로젝트번호는 원본 목록을 확인해 직접 입력합니다.</p>
      <p role="status">{copyStatus}</p>{manualCopy !== null && <textarea aria-label="수동 복사용 데이터" readOnly value={manualCopy} onFocus={e => e.target.select()}/>}
    </>}
  </section>;
}
