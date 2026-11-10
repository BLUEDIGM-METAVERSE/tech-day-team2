// ---- 영수증 OCR 원문 → 필드 추출 ----
// 원칙: 추측하지 않는다. 확신할 수 없거나 후보가 충돌하면 null과 경고를 돌려준다. 누락 금액을 0으로 대체하지 않는다.
// 경고에는 추출 원문을 넣지 않으며 파서는 직접 로그를 출력하지 않는다.

// OCR이 글자 사이를 띄워도 인식하도록 라벨을 정규식으로 바꾼다('합계' → '합\s*계').
const spaced = word => [...word].join('\\s*');
const alt = words => [...words].sort((a, b) => b.length - a.length).map(spaced).join('|');
const compact = text => text.replace(/\s+/g, '');
const HAS_WORD_OR_DIGIT = /[0-9A-Za-z가-힣]/;

// 전화·사업자·카드번호 등은 날짜나 금액으로 오인하지 않도록 라벨과 바로 뒤 번호를 지운다.
const ID_LABELS = ['전화번호', '전화', '휴대폰', '연락처', 'TEL', 'FAX', '팩스', '사업자등록번호', '사업자번호', '사업자', '등록번호',
  '카드번호', '승인번호', '가맹점번호', '거래번호', '주문번호', '영수증번호', '일련번호'];
// 번호를 지울 때만 쓰는 라벨. 상호에 들어갈 수 있는 낱말이라 거래처 값을 끊는 데는 쓰지 않는다.
const MASK_ONLY_LABELS = ['단말기번호', '단말기', '계좌번호', '계좌', '상품코드', '바코드', '코드', 'POS', '카드', 'NO', 'SN', 'H.P', 'HP', 'T'];
// '(02) 000-0000', '02 000-0000'처럼 지역번호가 띄어 있어도 한 번호로 지운다.
const ID_RE = new RegExp(`(?<![A-Za-z])(?:${alt([...ID_LABELS, ...MASK_ONLY_LABELS])})[\\s:.#)]*(?:\\(?0\\d{1,2}\\)?\\s*)?[\\d*xX(][\\d*xX()\\-./]*`, 'gi');
const maskIds = line => line.replace(ID_RE, ' ');

// ---- 날짜 ----
// 뒤쪽 검사: 숫자나 '-****'가 이어지면 번호로 보되, '-13:05', '.13:05'처럼 붙은 시각은 허용한다. OCR이 '29. 13:05'의 공백을 빠뜨리기도 한다.
const DATE_END = '(?!(?![-.]\\d{1,2}:\\d{2})[-./]?[\\d*xX])';
const LONG_DATE = new RegExp(`(?<!\\d)(?<!\\d[-./])(20\\d{2})([-./])(\\d{1,2})\\2(\\d{1,2})${DATE_END}`, 'g'); // 2026-10-29, 2026.10.29, 2026/10/29
const SHORT_DATE = new RegExp(`(?<!\\d)(?<!\\d[-./])(\\d{2})([-/])(\\d{2})\\2(\\d{2})${DATE_END}`, 'g');       // 26/10/29, 26-10-29 (20YY로 본다)
const DOTTED_DATE = new RegExp(`(?<![\\d.,])(?<!\\d[-/])(20\\d{2}|\\d{2})(\\s*\\.\\s*)(\\d{1,2})\\s*\\.\\s*(\\d{1,2})${DATE_END}`, 'g'); // 2026. 10. 29., 26.10.29
const KOREAN_DATE = /(?<!\d)(20\d{2}|\d{2})()\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;                       // 2026년 10월 29일, 26년 10월 29일
const DATE_PATTERNS = [LONG_DATE, SHORT_DATE, DOTTED_DATE, KOREAN_DATE];
// 이 낱말이 있는 줄의 날짜는 거래일이 아닐 수 있다. 다른 날짜와의 충돌 판단에는 쓰되 단독으로 채택하지 않는다.
const EXPIRY_WORDS = ['유효기간', '교환기한', '교환기간', '사용기한', '사용기간', '유통기한', '소비기한', '반품기한', '환불기한', '만료', '까지'];
// 줄 끝의 번호 라벨(다음 줄 값이 번호다), 날짜 앞의 번호 라벨, 2자리 연도 앞에 허용하는 날짜 라벨.
const ID_LINE_END_RE = new RegExp(`(?<![A-Za-z])(?:${alt(ID_LABELS)})[\\s:.#)]*$`, 'i');
const ID_PREFIX_RE = /(?:번호|코드|(?<![A-Za-z])NO)[\s:.#]*$/i;
const DATE_LABEL_RE = /(?:일시|일자|날짜|거래일|승인일|결제일|판매일|구매일|매출일|발행일|DATE)[:.\])]*$/i;
const AFTER_DATE_RE = /(?:\d\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}\.?|\d\s*일)\s*$/;

// 달력에 있는 날짜만 'YYYY-MM-DD'로 돌려준다. 2026-02-31 같은 값은 undefined.
function toIsoDate(yearText, monthText, dayText) {
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 2자리 연도는 어떤 'NN-NN-NN'도 날짜처럼 보이므로 앞에 아무것도 없거나 날짜 라벨이 있을 때만 믿는다.
// 날짜 바로 뒤의 '13-05-22'는 시각으로 본다.
function isShortDateContext(prefix, tail, first, second, third) {
  if (!HAS_WORD_OR_DIGIT.test(prefix) || DATE_LABEL_RE.test(compact(tail))) return true;
  if (!AFTER_DATE_RE.test(tail)) return false;
  return !(Number(first) < 24 && Number(second) < 60 && Number(third) < 60);
}

function findDate(lines, warnings) {
  const found = new Set();     // 지원 표기의 유효 날짜
  const confirmed = new Set(); // 그중 기한 줄이 아닌 곳에서 나온 날짜
  let previous = '';
  for (const line of lines) {
    const afterIdLabel = ID_LINE_END_RE.test(previous);
    if (line.trim()) previous = line;
    if (afterIdLabel) continue;
    const masked = maskIds(line);
    const isExpiry = EXPIRY_WORDS.some(word => compact(line).includes(word));
    for (const pattern of DATE_PATTERNS) {
      for (const match of masked.matchAll(pattern)) {
        const [, year, , month, day] = match;
        const prefix = masked.slice(0, match.index);
        const tail = prefix.slice(-40); // 라벨 판단은 날짜 바로 앞만 보면 되고, 긴 줄에서도 빠르다.
        const isShortYear = year.length === 2 && pattern !== KOREAN_DATE;
        if (isShortYear ? !isShortDateContext(prefix, tail, year, month, day) : ID_PREFIX_RE.test(tail)) continue;
        const iso = toIsoDate(year, month, day);
        if (!iso) continue;
        found.add(iso);
        if (!isExpiry) confirmed.add(iso);
      }
    }
  }
  if (found.size > 1) warnings.push('서로 다른 날짜가 여러 개 있어 날짜를 확정하지 못했습니다.');
  else if (confirmed.size === 1) return [...confirmed][0];
  else if (found.size) warnings.push('유효기간·기한으로 표시된 날짜만 있어 거래일을 확정하지 못했습니다.');
  else warnings.push('영수증에서 유효한 날짜를 찾지 못했습니다.');
  return null;
}

// ---- 금액 ----
// 라벨 우선순위: 앞 단계가 확정되면 뒤 단계는 보지 않는다. 앞 단계 라벨을 읽지 못했으면 뒤 단계로 내려가지 않는다.
const AMOUNT_TIERS = [
  ['결제금액', '결제액', '승인금액', '승인액', '이용금액', '받을금액', '청구금액', '청구액', '최종금액'],
  ['합계금액', '합계액', '합계', '합게금액', '합게액', '합게', '함계', '총액', '총금액'], // 합게·함계는 합계의 OCR 오인식 표기.
];
const FINAL_TIER = 0;
const TOTAL_TIER = 1;
const AMOUNT_RE = new RegExp(`(${alt(AMOUNT_TIERS.flat())})(?![가-힣])`, 'gi');
// 라벨 바로 앞에 와도 최종 금액으로 볼 수 있는 수식어. 그 밖의 수식어('누적', '현금', '중간', '상품')가 붙으면 믿지 않는다.
const SAFE_QUALIFIERS = new Set(['총', '최종', '실', '실제']);
// 최종 금액 라벨 앞의 결제수단. 분할 결제면 일부 금액일 수 있어 다른 결제·다른 합계가 없을 때만 믿는다.
const CARD_QUALIFIERS = new Set(['카드', '신용카드', '체크카드', '법인카드', '개인카드']);
const OTHER_PAYMENT_RE = /^\s*(?:현금|상품권|계좌이체|이체)(?:\s*결제)?[\s:]*[₩\\]?\s*[1-9]/;
// 이 낱말이 있는 줄은 금액 후보에서 통째로 뺀다. 공백을 없앤 대문자 줄과 비교한다.
const NOT_TOTAL_WORDS = ['부가세', '부가가치세', '세액', '세금', '과세', '면세', '영세', '공급', '봉사료', '받은돈', '받은금액', '거스름', '잔돈',
  '할인', '포인트', '단가', '수량', '건수', '소합계', '소합게', '잔액', '적립', '쿠폰', '미결제', 'VAT', 'TAX'];
// 합계 뒤에 나오면 최종 금액이 합계와 달라질 수 있는 낱말.
const ADJUST_WORDS = ['할인', '봉사료', '쿠폰', '포인트사용', '사용포인트'];
// 취소·환불 전표 표시. '환불은 영수증 지참' 같은 안내문까지 막지 않도록 낱말 조합만 본다.
const CANCEL_RE = /(?:승인|결제|거래|카드)취소|취소(?:승인|거래|전표|영수증|금액)|(?:환불|반품)(?:금액|전표|영수증)/;
const CANCEL_WORD_RE = /취소|환불|반품/;
// 숫자 앞뒤 문맥으로 전화번호·시각·비율·수량 조각을 걸러낸다.
const NUMBER_RE = /(?<![\dA-Za-z가-힣.,])(?<!\d[-−–—―/:])[₩\\]?\s*(\d+(?:,\d+)*(?:\.\d+)?)(?![\d%]|\s*%|[-/:.,]?\d|(?!원)[A-Za-z가-힣])/g;
const UNREADABLE_TEXT = '[판독 불가]';
const VALID_AMOUNT = /^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/;
// 값 전체가 원화 천 단위 묶음일 때만 점을 없앤다.
const DOTTED_WON_AMOUNT_RE = /^(?:[₩\\]\s*)?([1-9]\d{0,2}(?:\s*\.\s*\d{3})+)(?:\s*원)?$/;
// 천 단위 구분자가 깨진 숫자: '11, 000', '12 ,000', '12,OOO', "12'000", '12_000', '12 000'.
const BROKEN_NUMBER_RE = /\d\s*[;'`’·_]\s*[\dOoIl]|\d\s*[,.]\s*[OoIl]|\d(?:\s+[,.]\s*|[,.]\s+)\d|\d\s+\d{3}(?![\d,])/;
// 음수 표기: 앞뒤 마이너스, 삼각형, 괄호.
const NEGATIVE_RE = /[△▲▽▼]|(?<!\d\s*)[-−–—―]\s*[₩\\]?\s*\d|\d\s*[-−–—―](?!\s*\d)|\(\s*[₩\\]?\s*\d[\d,]*\s*원?\s*\)/;
// 외화 표기. amount는 원 단위만 허용한다.
const FOREIGN_RE = /[$¥€£]|(?<![A-Za-z])(?:USD|JPY|EUR|CNY|GBP)(?![A-Za-z])|(?<![가-힣])(?:달러|엔|유로|위안|파운드)(?![가-힣])/i;

// 라벨 뒤 구간을 읽는다. values: 0보다 큰 정수, zero: 0 표기 있음, unreadable: 금액을 믿을 수 없는 표기가 있음.
function readAmounts(segment) {
  const cleaned = segment.replace(/[​-‍﻿]/g, ' ').replace(/[-−–—―.=_~·─━]{2,}/g, ' ').replace(/^[\s:=]+/, '').trim();
  const dottedAmount = DOTTED_WON_AMOUNT_RE.exec(cleaned);
  const text = dottedAmount ? dottedAmount[1].replace(/[.\s]/g, '') : cleaned;
  if (text.includes(UNREADABLE_TEXT) || BROKEN_NUMBER_RE.test(text) || NEGATIVE_RE.test(text) || FOREIGN_RE.test(text)) return { values: [], zero: false, unreadable: true };
  const result = { values: [], zero: false, unreadable: false };
  for (const [, digits] of text.matchAll(NUMBER_RE)) {
    const value = Number(digits.replaceAll(',', ''));
    if (/^0+$/.test(digits)) result.zero = true;
    else if (VALID_AMOUNT.test(digits) && Number.isSafeInteger(value)) result.values.push(value);
    else result.unreadable = true;
  }
  return result;
}

// 라벨 앞에 붙은 수식어를 돌려준다. 긴 줄에서도 빠르도록 라벨 앞 일부만 본다.
const qualifierOf = before => compact(before.slice(-40).match(/[A-Za-z가-힣](?:\s*[A-Za-z가-힣])*\s*$/)?.[0] ?? '');

function findAmount(lines, warnings) {
  // values: 후보, unreadable: 깨진 값, missing: 라벨만 있고 값 없음, doubtful: 제외 낱말·수식어로 믿지 못한 라벨, byCard: 카드 수식어가 붙은 값 있음.
  const tiers = AMOUNT_TIERS.map(() => ({ values: new Set(), unreadable: false, missing: false, doubtful: false, byCard: false, firstLine: -1 }));
  let cancelled = false;
  let otherPayment = false;
  let lastAdjustLine = -1;
  lines.forEach((line, lineIndex) => {
    const masked = maskIds(line);
    if (OTHER_PAYMENT_RE.test(masked)) otherPayment = true;
    const upper = compact(masked).toUpperCase();
    const labels = [...masked.matchAll(AMOUNT_RE)];
    if (CANCEL_RE.test(upper) || (labels.length && CANCEL_WORD_RE.test(upper))) cancelled = true;
    if (ADJUST_WORDS.some(word => upper.includes(word))) {
      const adjust = readAmounts(masked.replace(/^[^\d₩\\△▲▽▼(−–—―-]*/, ''));
      if (adjust.values.length || adjust.unreadable) lastAdjustLine = lineIndex;
    }
    const excluded = NOT_TOTAL_WORDS.some(word => upper.includes(word));
    labels.forEach((label, i) => {
      const tierIndex = AMOUNT_TIERS.findIndex(words => words.includes(compact(label[1])));
      const tier = tiers[tierIndex];
      const qualifier = qualifierOf(masked.slice(0, label.index));
      const byCard = tierIndex === FINAL_TIER && CARD_QUALIFIERS.has(qualifier);
      if (excluded || (qualifier && !byCard && !SAFE_QUALIFIERS.has(qualifier.toUpperCase()))) {
        tier.doubtful = true;
        return;
      }
      const end = labels[i + 1]?.index ?? masked.length;
      const { values, zero, unreadable } = readAmounts(masked.slice(label.index + label[0].length, end));
      if (unreadable) tier.unreadable = true;
      else if (!values.length && !zero) tier.missing = true;
      for (const value of values) tier.values.add(value);
      if (values.length && tier.firstLine < 0) tier.firstLine = lineIndex;
      if (values.length && byCard) tier.byCard = true;
    });
  });
  if (cancelled) {
    warnings.push('취소·환불 표시가 있어 금액을 확정하지 못했습니다.');
    return null;
  }
  for (const [index, tier] of tiers.entries()) {
    if (tier.unreadable) {
      warnings.push('금액 표기를 읽을 수 없어 금액을 확정하지 못했습니다.');
      return null;
    }
    if (tier.values.size > 1) {
      warnings.push('서로 다른 금액이 여러 개 있어 금액을 확정하지 못했습니다.');
      return null;
    }
    if (tier.values.size === 1) {
      const [value] = tier.values;
      if (tier.byCard && (tier.doubtful || otherPayment || [...tiers[TOTAL_TIER].values].some(total => total !== value))) {
        warnings.push('카드 외 결제나 다른 합계가 있어 금액을 확정하지 못했습니다.');
        return null;
      }
      if (index === TOTAL_TIER && lastAdjustLine > tier.firstLine) {
        warnings.push('합계 뒤에 할인·봉사료가 있어 금액을 확정하지 못했습니다.');
        return null;
      }
      return value;
    }
    if (tier.missing || tier.doubtful) {
      warnings.push('금액 라벨의 값이나 의미를 확신할 수 없어 금액을 확정하지 못했습니다.');
      return null;
    }
  }
  warnings.push('결제금액·합계 라벨이 붙은 금액을 찾지 못했습니다.');
  return null;
}

// ---- 거래처 ----
const MERCHANT_LABELS = ['상호', '상호명', '가맹점', '가맹점명', '매장명'];
const LABEL = alt(MERCHANT_LABELS);
const OWNER_LABELS = ['대표자', '대표', '주소'];
// 줄 맨 앞이면 ':'나 공백 뒤, 줄 중간이면 ':' 뒤의 값만 쓴다. '본 영수증 가맹점 보관용' 같은 문장을 값으로 읽지 않기 위해서다.
const MERCHANT_RE = new RegExp(`^\\s*(?:${LABEL})(?:\\s*:\\s*|\\s+)|(?<=\\s)(?:${LABEL})\\s*:\\s*`, 'g');
// 같은 줄에 이어지는 다른 항목에서 값을 끊는다. 라벨, 전화 표시, 날짜·번호·금액 모양을 경계로 본다.
const RESULT_DATE_FIELDS = ['거래일시', '거래일자', '거래일', '결제일시', '결제일자', '결제일', '승인일시', '승인일자', '승인일', '일시', '일자', '날짜'];
const NEXT_FIELD_LABELS = alt([...MERCHANT_LABELS, ...ID_LABELS, ...OWNER_LABELS, ...AMOUNT_TIERS.flat(), ...RESULT_DATE_FIELDS]);
const NEXT_FIELD_RE = new RegExp(`(?:\\s+|\\s*[(/|,]\\s*)(?:${NEXT_FIELD_LABELS})(?![가-힣])`
  + '|\\s*[☎☏]|\\s+T\\s*[:.]'
  + '|\\s+(?:\\d{2,4}[-./]\\d{1,2}[-./]\\d{1,2}|\\d{2,4}\\s*\\.\\s*\\d{1,2}\\s*\\.\\s*\\d{1,2}|\\d{2,4}-\\d{2,4}-\\d{2,5}|\\d{1,3}(?:,\\d{3})+|\\d{2,4}\\s*년)(?!\\d)', 'i');
// 라벨 뒤에 상호가 아니라 다른 항목 이름이 오는 경우('가맹점 번호', '가맹점 전화번호', '상호 간 협의').
const NOT_NAME_RE = new RegExp(`^(?:${alt([...ID_LABELS, ...OWNER_LABELS, '번호', '코드', '정보', '수수료', '보관용', '보관', '안내', '문의', '서명', '유의사항', '간', 'ID', 'NO'])})(?![가-힣A-Za-z])`, 'i');
// 값 맨 앞의 항목 표시와 안내 문장 끝맺음.
const NAME_TAG_RE = /^\(\s*(?:법인명|상호명?|단체명)\s*\)\s*/;
const SENTENCE_END_RE = /(?:니다|세요)[.!]?$/;
// 카드 앱 이용내역 캡처: 상호 라벨 없이 제목 다음 줄이 상호다. 그 줄이 금액이나 다른 항목이면 상호가 인식되지 않은 것이다.
const APP_TITLE = '이용내역상세';
const APP_NOT_NAME_RE = /^(?:[\d,.원₩\\]+$|결제정보|가맹점정보|이용금액|이용카드|이용구분)/;

// 값 뒤에 이어지는 다른 항목을 끊고, 상호로 볼 수 없으면 undefined.
function merchantValue(rest) {
  const cut = rest.search(NEXT_FIELD_RE);
  const value = (cut < 0 ? rest : rest.slice(0, cut)).replace(/\s+/g, ' ').replace(/[\s:,|/]+$/, '').trim();
  if (value.includes(UNREADABLE_TEXT) || !/[A-Za-z가-힣]/.test(value) || NOT_NAME_RE.test(value) || SENTENCE_END_RE.test(value)) return undefined;
  return value;
}

function appTitleMerchant(lines) {
  const title = lines.findIndex(line => line.replace(/[^0-9A-Za-z가-힣]/g, '') === APP_TITLE);
  if (title < 0) return undefined;
  const next = lines.slice(title + 1).find(line => line.trim());
  if (next === undefined || APP_NOT_NAME_RE.test(compact(next))) return undefined;
  return merchantValue(next);
}

const RECEIPT_HEADING = /^(?:카드|신용카드|체크카드|현금|현금영수증|매출|신용카드매출|카드매출|거래|결제)?(?:영수증|전표|명세서|확인서)(?:고객용|보관용)?$/;
const HEADER_METADATA = /^(?:카드결제|결제정보|판매정보|거래정보|가맹점정보|고객용|고객보관용|가맹점용|가맹점보관용|재발행|품명|품목|상품명|공급가액|부가세|일시불)/;

function receiptHeaderMerchant(lines) {
  const boundary = lines.findIndex(line => DATE_PATTERNS.some(pattern => line.search(pattern) >= 0) || line.search(AMOUNT_RE) >= 0);
  if (boundary < 1) return undefined;
  const candidates = new Map();
  for (const line of lines.slice(0, boundary).filter(line => line.trim()).slice(0, 5)) {
    const key = line.replace(/[^0-9A-Za-z가-힣]/g, '');
    if (key === APP_TITLE) return undefined;
    if (RECEIPT_HEADING.test(key) || HEADER_METADATA.test(key) || HEADER_FIELD_RE.test(line)) continue;
    const name = merchantValue(line);
    if (name && !name.includes(':') && name.length <= 60) candidates.set(compact(name), name);
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}

function findMerchant(lines, warnings, hasTransaction) {
  const found = new Map(); // 공백을 없앤 값 -> 원래 표기
  for (const line of lines) {
    for (const match of line.matchAll(MERCHANT_RE)) {
      const value = merchantValue(line.slice(match.index + match[0].length).replace(NAME_TAG_RE, ''));
      if (value && !found.has(compact(value))) found.set(compact(value), value);
    }
  }
  if (found.size === 1) return [...found.values()][0];
  // 라벨이 붙은 값이 없을 때만 앱 캡처 구조를 본다.
  const fromTitle = found.size ? undefined : appTitleMerchant(lines);
  if (fromTitle) return fromTitle;
  const fromHeader = found.size === 0 && hasTransaction ? receiptHeaderMerchant(lines) : undefined;
  if (fromHeader) return fromHeader;
  warnings.push(found.size ? '서로 다른 거래처가 여러 개 있어 거래처를 확정하지 못했습니다.' : '영수증에서 거래처를 확정하지 못했습니다.');
  return null;
}

// OCR 응답에 남아 있는 민감 필드는 날짜·거래처·금액 후보를 찾기 전에 제외한다.
const PRIVATE_FIELDS = [
  '카드사', '카드사명', '발급사', '발급사명', '발급카드사', '이용카드', '카드번호', '카드NO',
  '승인번호', '승인NO', '가맹점번호', '가맹점NO', '매입사', '매입사명', '매입카드사',
  '주소', '거래처주소', '가맹점주소', '매장주소', '사업장주소', '소재지',
  '사업자등록번호', '사업자번호', '거래처사업자번호', '가맹점사업자번호',
  '전화', '전화번호', '거래처전화번호', '가맹점전화번호', '연락처', 'TEL', 'FAX', '팩스', '휴대폰',
];
const RESULT_FIELDS = [...MERCHANT_LABELS, ...AMOUNT_TIERS.flat(), ...RESULT_DATE_FIELDS];
const HEADER_FIELD_RE = new RegExp(`^(?:${alt(RESULT_FIELDS)})(?![가-힣A-Za-z])`, 'i');
const fieldPattern = labels => `(?<![A-Za-z0-9가-힣])(?:${alt(labels)})(?=\\s|[:#.=]|$)`;
const PRIVATE_FIELD_RE = new RegExp(fieldPattern(PRIVATE_FIELDS), 'gi');
const KNOWN_FIELD_RE = new RegExp(fieldPattern([...PRIVATE_FIELDS, ...RESULT_FIELDS]), 'i');
const PRIVATE_NUMBER_RE = /(?<![\d-])(?:\d{3}-\d{2}-\d{5}|(?:\(?0\d{1,2}\)?[ -])\d{3,4}[ -]\d{4}|[\d*xX]{4}(?:[ -][\d*xX]{4}){3})(?![\d-])/g;
const NUMBER_THEN_DATE_RE = /^\s*[:#.=]?\s*(?:\(?0\d{1,2}\)?[ -])\d{3,4}[ -]\d{4}(?=\s+\d{2,4}[-./]\d{1,2}[-./]\d{1,2}(?![\d-]))/;
const OMITTED_LINE = '—';

function omitPrivateFields(lines) {
  let omitNextValue = false;
  return lines.map(line => {
    if (!line.trim()) return line;
    if (omitNextValue) {
      omitNextValue = false;
      if (!KNOWN_FIELD_RE.test(line)) return OMITTED_LINE;
    }
    let visible = '';
    let cursor = 0;
    for (const match of line.matchAll(PRIVATE_FIELD_RE)) {
      if (match.index < cursor) continue;
      visible += line.slice(cursor, match.index);
      const afterLabel = match.index + match[0].length;
      const tail = line.slice(afterLabel);
      const numberBeforeDate = tail.match(NUMBER_THEN_DATE_RE);
      const next = numberBeforeDate ? numberBeforeDate[0].length : tail.search(KNOWN_FIELD_RE);
      cursor = next < 0 ? line.length : afterLabel + next;
      if (next < 0 && !tail.replace(/^[\s:#.=]+/, '')) omitNextValue = true;
    }
    const filtered = (visible + line.slice(cursor)).replace(PRIVATE_NUMBER_RE, ' ').trim();
    // 빈 줄로 바꾸면 카드 앱의 제목 다음 줄 규칙이 다른 항목을 상호로 선택할 수 있다.
    return filtered || OMITTED_LINE;
  });
}

// OCR 원문에서 날짜·거래처·금액을 뽑는다. 콜백에는 민감 항목을 걸러낸 텍스트만 넘긴다.
export function parseReceiptText(text, { onFilteredText } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    onFilteredText?.('');
    return { data: { date: null, merchant: null, amount: null }, warnings: ['영수증 텍스트가 비어 있거나 문자열이 아닙니다.'] };
  }
  // NFKC: 전각 ':'·'，'·'￦'을 반각으로, 분해된 한글을 완성형으로 맞춘다.
  // 연속 공백은 하나로 줄인다. 값 해석에 영향이 없고, 공백이 아주 긴 입력에서 정규식이 느려지는 것을 막는다.
  const lines = omitPrivateFields(text.normalize('NFKC').replace(/[^\S\r\n]+/g, ' ').split(/\r\n|\r|\n/));
  onFilteredText?.(lines.join('\n'));
  const warnings = [];
  const date = findDate(lines, warnings);
  const amountWarnings = [];
  const amount = findAmount(lines, amountWarnings);
  const merchant = findMerchant(lines, warnings, date !== null && amount !== null);
  warnings.push(...amountWarnings);
  return { data: { date, merchant, amount }, warnings };
}
