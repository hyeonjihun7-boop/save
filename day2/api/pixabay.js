// Vercel 서버리스 함수: 환경변수 PIXABAY_API_KEY 로 Pixabay 를 대신 호출합니다.
module.exports = async (req, res) => {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'PIXABAY_API_KEY 환경변수가 설정되지 않았어요.' });
  }

  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: '검색어를 입력해 주세요.' });
  }

  const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&lang=ko&per_page=10`;
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `Pixabay 오류 (${r.status})` });
    const data = await r.json();
    const hits = data.hits.map((h) => ({
      url: h.largeImageURL,
      thumb: h.webformatURL,
      tags: h.tags,
      user: h.user,
      pageURL: h.pageURL,
    }));
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ hits });
  } catch (e) {
    return res.status(502).json({ error: '이미지를 불러오지 못했어요.' });
  }
};