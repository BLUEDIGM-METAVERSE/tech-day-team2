import type { ReceiptData } from '../types/receipt';
import { ACCOUNTS, PAYMENTS, type Section } from '../constants/accounts';
interface Props { data: ReceiptData; section: Section; onChange: (data: Partial<ReceiptData>) => void }
// 상세 행 하나의 입력 칸들. 확인 중인 행과 목록의 행이 같은 모양을 쓴다.
export function ExpenseRowFields({ data, section, onChange }: Props) {
  return <>
    <td><input aria-label="일자" type="date" value={data.date ?? ''} onChange={e => onChange({date: e.target.value || null})}/></td>
    <td><select aria-label="계정과목" value={data.account ?? ''} onChange={e => onChange({account: e.target.value})}><option value="">선택</option>{ACCOUNTS[section].map(a => <option key={a} value={a}>{a}</option>)}</select></td>
    <td><input aria-label="비용 상세내역" placeholder="사용 목적 등" value={data.description ?? ''} onChange={e => onChange({description: e.target.value})}/></td>
    <td><input aria-label="거래처" value={data.merchant ?? ''} onChange={e => onChange({merchant: e.target.value || null})}/></td>
    <td><input aria-label="금액" type="number" min="1" step="1" value={data.amount ?? ''} onChange={e => onChange({amount: e.target.value === '' ? null : Number(e.target.value)})}/></td>
    <td>{section === 'project'
      ? <input aria-label="프로젝트번호" placeholder="직접 입력" value={data.project ?? ''} onChange={e => onChange({project: e.target.value})}/>
      : <select aria-label="결제수단" value={data.payment ?? ''} onChange={e => onChange({payment: e.target.value})}><option value="">선택</option>{PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}</select>}</td>
  </>;
}
