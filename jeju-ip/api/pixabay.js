// Vercel 서버리스 함수: Pixabay API 키를 브라우저에 노출하지 않기 위한 프록시
// 환경변수: PIXABAY_API_KEY (서버 전용 — VITE_ 접두사를 붙이지 말 것!)
const BASE = 'https://pixabay.com/api/';

export default async function handler(req, res) {
  const send = (code, body, cache) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (cache) res.setHeader('Cache-Control', cache);
    res.end(JSON.stringify(body));
  };

  const key = process.env.PIXABAY_API_KEY;
  if (!key) return send(500, { error: 'PIXABAY_API_KEY 환경변수가 설정되지 않았습니다.' });

  const sp = new URL(req.url, 'http://localhost').searchParams;
  const params = new URLSearchParams({ key, image_type: 'photo', safesearch: 'true', lang: 'en' });

  const id = sp.get('id');
  if (id) {
    if (!/^\d{1,12}$/.test(id)) return send(400, { error: '잘못된 id 입니다.' });
    params.set('id', id);
  } else {
    const q = (sp.get('q') || 'jeju').slice(0, 100);
    const page = Math.min(Math.max(parseInt(sp.get('page'), 10) || 1, 1), 20);
    const perPage = Math.min(Math.max(parseInt(sp.get('per_page'), 10) || 24, 3), 60);
    params.set('q', q);
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    params.set('order', 'popular');
  }

  try {
    const r = await fetch(`${BASE}?${params}`);
    if (!r.ok) return send(r.status, { error: `Pixabay 응답 오류 (${r.status})` });
    const j = await r.json();
    const hits = (j.hits || []).map(h => ({
      id: h.id,
      thumb: h.webformatURL,
      large: h.largeImageURL,
      w: h.imageWidth,
      h: h.imageHeight,
      tags: h.tags,
      user: h.user,
      page: h.pageURL,
      likes: h.likes,
    }));
    // Pixabay 약관상 API 응답은 24시간까지 캐시 가능 → 1시간 CDN 캐시
    return send(200, { total: j.totalHits ?? hits.length, hits }, 's-maxage=3600, stale-while-revalidate=86400');
  } catch (e) {
    return send(502, { error: 'Pixabay 요청에 실패했습니다.' });
  }
}
