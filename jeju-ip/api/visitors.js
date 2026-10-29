// Vercel 서버리스 함수: 공공데이터포털 "제주특별자치도 서귀포시_직영관광지 관람객수 추이" 프록시
// 환경변수: DATA_GO_KR_KEY (서버 전용 — VITE_ 접두사 금지!)
// 두 개의 데이터셋(구: 2018.06~2025.08 / 신: 2025.01~)을 합쳐 월별 한 줄로 정리해서 돌려준다.
const BASE = 'https://api.odcloud.kr/api/15125100/v1/';
const OLD_SET = 'uddi:258f6b02-0967-4fed-b337-83e46cdbba73'; // 20250831 기준
const NEW_SET = 'uddi:32a1b877-af20-4505-a76a-fd389ebd30ca'; // 20251002 기준
const NAMES = ['천지연폭포', '중문대포 주상절리대', '천제연폭포', '정방폭포', '산방산_용머리', '감귤박물관'];

const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)); // 공란 = 미집계 → null
const pad = n => String(n).padStart(2, '0');
const fromIndex = t => `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;

async function fetchSet(id, key) {
  const p = new URLSearchParams({ page: '1', perPage: '500', returnType: 'JSON', serviceKey: key });
  const r = await fetch(`${BASE}${id}?${p}`);
  if (!r.ok) throw new Error(`공공데이터 API 오류 (${r.status})`);
  const j = await r.json();
  if (!Array.isArray(j.data)) throw new Error(j.msg || '응답 형식이 올바르지 않습니다.');
  return j.data;
}

// 구 데이터셋은 기준연월의 "연도"가 전부 2025 로 잘못 기록돼 있다.
// 행이 월 단위로 연속이므로, 마지막 행(2025-08)부터 거꾸로 세어 연월을 복원한다.
function normalizeOld(rows) {
  if (!rows.length) return [];
  const ymOf = r => String(r['기준연월']).slice(0, 7);
  const months = rows.map(r => Number(ymOf(r).slice(5, 7)));
  const consecutive = months.every((m, i) => i === 0 || m === (months[i - 1] % 12) + 1);
  const [ly, lm] = ymOf(rows[rows.length - 1]).split('-').map(Number);
  const last = ly * 12 + (lm - 1);
  return rows.map((r, i) => ({
    ym: consecutive ? fromIndex(last - (rows.length - 1 - i)) : ymOf(r),
    v: NAMES.map(n => num(r[n])),
  }));
}
const normalizeNew = rows => rows.map(r => ({ ym: `${r['기준연도']}-${pad(r['기준월'])}`, v: NAMES.map(n => num(r[n])) }));

export default async function handler(req, res) {
  const send = (code, body, cache) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (cache) res.setHeader('Cache-Control', cache);
    res.end(JSON.stringify(body));
  };
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return send(500, { error: 'DATA_GO_KR_KEY 환경변수가 설정되지 않았습니다.' });

  const [o, n] = await Promise.allSettled([fetchSet(OLD_SET, key), fetchSet(NEW_SET, key)]);
  if (o.status === 'rejected' && n.status === 'rejected') return send(502, { error: n.reason?.message || '공공데이터 API 요청에 실패했습니다.' });

  const oldRows = o.status === 'fulfilled' ? normalizeOld(o.value) : [];
  const newRows = n.status === 'fulfilled' ? normalizeNew(n.value) : [];
  const merged = new Map();
  oldRows.forEach(r => merged.set(r.ym, r));
  newRows.forEach(r => merged.set(r.ym, r)); // 겹치는 달은 최신 데이터셋 값을 사용
  const rows = [...merged.values()].sort((a, b) => a.ym.localeCompare(b.ym));

  const warnings = [];
  if (o.status === 'rejected') warnings.push('구 데이터셋(2018~2025.08)을 불러오지 못했어요.');
  if (n.status === 'rejected') warnings.push('신 데이터셋(2025~)을 불러오지 못했어요.');
  // 월 단위 갱신 데이터라 6시간 캐시
  return send(200, { names: NAMES, rows, warnings, sources: { old: oldRows.length, new: newRows.length } }, 's-maxage=21600, stale-while-revalidate=86400');
}
