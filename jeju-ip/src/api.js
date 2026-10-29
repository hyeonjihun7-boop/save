// Pixabay 호출은 모두 서버리스 함수(/api/pixabay)를 거친다 → API 키가 브라우저에 노출되지 않음
async function call(params) {
  const res = await fetch(`/api/pixabay?${new URLSearchParams(params)}`);
  let data = null;
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  if (!res.ok) throw new Error(data?.error || `이미지 서버 오류 (${res.status})`);
  return data;
}

export const searchImages = (q, page = 1, per_page = 24) => call({ q, page, per_page });

const cache = new Map();
export async function getImage(id) {
  if (cache.has(id)) return cache.get(id);
  const data = await call({ id });
  const hit = data.hits?.[0] || null;
  if (hit) cache.set(id, hit);
  return hit;
}
