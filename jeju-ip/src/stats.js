// 서귀포시 직영관광지 관람객수 추이 (공공데이터포털 15125100) 화면
// 데이터는 /api/visitors (서버리스 함수)에서 월별로 정리된 JSON 을 받아온다.
const COLORS = ['#0f6fa8', '#ff8a1f', '#2e8b57', '#7b5cff', '#e0245e', '#b8860b'];
const RANGES = [{ label: '최근 12개월', n: 12 }, { label: '최근 3년', n: 36 }, { label: '전체', n: 0 }];

let data = null, err = '', loading = false;
let rangeIdx = 0;
const hidden = new Set(); // 숨긴 관광지 index

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = n => n.replace('_', '·');
const fmt = n => (n === null || n === undefined ? '–' : n.toLocaleString('ko-KR'));
const man = n => (n >= 10000 ? `${+(n / 10000).toFixed(1)}만` : String(n));
const ymLabel = ym => `${ym.slice(2, 4)}.${ym.slice(5, 7)}`;
const sum = arr => arr.reduce((a, v) => a + (v ?? 0), 0);

export async function renderStats() {
  const root = document.querySelector('#statsBody');
  if (!data && !loading) {
    loading = true; err = '';
    root.innerHTML = '<p class="status">관람객 통계를 불러오는 중…</p>';
    try {
      const res = await fetch('/api/visitors');
      let body = null; try { body = await res.json(); } catch { /* 본문 없음 */ }
      if (!res.ok) throw new Error(body?.error || `서버 오류 (${res.status})`);
      data = body;
    } catch (e) { err = e.message; }
    loading = false;
  }
  if (loading) return;
  draw(root);
}

function draw(root) {
  if (err || !data) {
    root.innerHTML = `<p class="status bad">⚠️ ${esc(err || '데이터를 불러오지 못했어요.')}</p>
      <p class="status">Vercel(또는 .env)에 <code>DATA_GO_KR_KEY</code> 환경변수가 있는지 확인해 주세요. <button class="link" id="statsRetry">다시 시도</button></p>`;
    root.querySelector('#statsRetry').onclick = () => { err = ''; renderStats(); };
    return;
  }
  const all = data.rows, names = data.names;
  const rows = RANGES[rangeIdx].n ? all.slice(-RANGES[rangeIdx].n) : all;
  const shown = names.map((_, i) => i).filter(i => !hidden.has(i));
  const latest = all[all.length - 1], prev = all[all.length - 2];
  const tot = r => sum(r.v);
  const last12 = all.slice(-12);
  const last12Sum = names.map((_, i) => sum(last12.map(r => r.v[i])));
  const topI = last12Sum.indexOf(Math.max(...last12Sum));
  const diff = prev && tot(prev) ? ((tot(latest) - tot(prev)) / tot(prev)) * 100 : null;

  root.innerHTML = `
    <div class="cards">
      <div class="scard"><small>최신 월 합계 (${ymLabel(latest.ym)})</small><b>${fmt(tot(latest))}명</b>
        ${diff === null ? '' : `<em class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} 전월 대비 ${Math.abs(diff).toFixed(1)}%</em>`}</div>
      <div class="scard"><small>최근 12개월 합계</small><b>${fmt(sum(last12Sum))}명</b><em>6개 관광지 합산</em></div>
      <div class="scard"><small>최근 12개월 1위</small><b>${esc(label(names[topI]))}</b><em>${fmt(last12Sum[topI])}명</em></div>
      <div class="scard"><small>데이터 기간</small><b>${all[0].ym.replace('-', '.')} ~ ${latest.ym.replace('-', '.')}</b><em>${all.length}개월</em></div>
    </div>

    <div class="toolbar">
      <div class="seg2">${RANGES.map((r, i) => `<button data-range="${i}" class="${i === rangeIdx ? 'on' : ''}">${r.label}</button>`).join('')}</div>
      <div class="legend">${names.map((n, i) => `<button class="lg ${hidden.has(i) ? 'off' : ''}" data-lg="${i}"><i style="background:${COLORS[i]}"></i>${esc(label(n))}</button>`).join('')}</div>
    </div>

    <div class="chartwrap"><svg id="statChart" viewBox="0 0 900 360" role="img" aria-label="관광지별 월간 관람객 추이"></svg><div id="statTip" class="tip hidden"></div></div>

    <div class="two">
      <section class="panel"><h3>기간 합계 순위</h3><div id="statRank"></div></section>
      <section class="panel"><h3>최근 12개월 상세</h3><div class="tablewrap"><table id="statTable"></table></div></section>
    </div>

    <p class="foot-note">출처: 공공데이터포털 · 제주특별자치도 서귀포시_직영관광지 관람객수 추이.
      구 데이터셋(2018.06~2025.08)과 신 데이터셋(2025.01~)을 합쳤고, 겹치는 달은 신 데이터 값을 썼어요.
      구 데이터셋의 연도 표기가 모두 2025로 잘못 기록돼 있어 월 순서를 이용해 연도를 보정했어요.
      비어 있는 값은 <b>미집계</b>라 선이 끊겨 보입니다.
      ${(data.warnings || []).map(w => `<br>⚠️ ${esc(w)}`).join('')}</p>`;

  drawChart(root.querySelector('#statChart'), root.querySelector('#statTip'), rows, names, shown);
  drawRank(root.querySelector('#statRank'), rows, names, shown);
  drawTable(root.querySelector('#statTable'), last12, names);

  root.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { rangeIdx = +b.dataset.range; draw(root); });
  root.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => {
    const i = +b.dataset.lg;
    if (hidden.has(i)) hidden.delete(i); else if (hidden.size < names.length - 1) hidden.add(i);
    draw(root);
  });
}

function niceMax(v) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function drawChart(svg, tip, rows, names, shown) {
  const W = 900, H = 360, L = 58, R = 16, T = 16, B = 34, n = rows.length;
  const max = niceMax(Math.max(1, ...rows.flatMap(r => shown.map(i => r.v[i] ?? 0))));
  const x = i => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = v => T + (1 - v / max) * (H - T - B);
  let g = '';
  for (let k = 0; k <= 5; k++) { // 가로 눈금
    const v = (max / 5) * k, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end" class="ax">${man(Math.round(v))}</text>`;
  }
  const step = Math.max(1, Math.ceil(n / 9));
  rows.forEach((r, i) => { if (i % step === 0) g += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="ax">${ymLabel(r.ym)}</text>`; });
  shown.forEach(si => { // 선 (미집계 구간은 끊기)
    let d = '', pen = false;
    rows.forEach((r, i) => { const v = r.v[si]; if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    g += `<path d="${d}" fill="none" stroke="${COLORS[si]}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (n <= 24) rows.forEach((r, i) => { if (r.v[si] !== null) g += `<circle cx="${x(i)}" cy="${y(r.v[si])}" r="3" fill="${COLORS[si]}"/>`; });
  });
  g += '<line id="statCursor" y1="' + T + '" y2="' + (H - B) + '" class="cursor" style="display:none"/>';
  svg.innerHTML = g;

  const cursor = svg.querySelector('#statCursor');
  const move = e => {
    const rect = svg.getBoundingClientRect(), px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.min(n - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (n - 1))));
    const r = rows[i];
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.style.display = '';
    const list = shown.map(si => ({ si, v: r.v[si] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
    tip.innerHTML = `<b>${r.ym.replace('-', '.')}</b>` + list.map(o => `<div><i style="background:${COLORS[o.si]}"></i>${esc(label(names[o.si]))}<span>${o.v === null ? '미집계' : fmt(o.v)}</span></div>`).join('');
    tip.classList.remove('hidden');
    const left = (x(i) / W) * rect.width, flip = left > rect.width * 0.6;
    tip.style.left = left + 'px'; tip.style.transform = `translateX(${flip ? '-104%' : '4%'})`;
  };
  svg.onpointermove = move;
  svg.onpointerleave = () => { cursor.style.display = 'none'; tip.classList.add('hidden'); };
}

function drawRank(el, rows, names, shown) {
  const totals = shown.map(i => ({ i, t: sum(rows.map(r => r.v[i])), miss: rows.filter(r => r.v[i] === null).length }));
  totals.sort((a, b) => b.t - a.t);
  const max = Math.max(1, ...totals.map(o => o.t));
  el.innerHTML = totals.map((o, k) => `<div class="rk"><span class="no">${k + 1}</span><span class="nm">${esc(label(names[o.i]))}</span>
    <span class="bar"><i style="width:${(o.t / max) * 100}%;background:${COLORS[o.i]}"></i></span><span class="val">${fmt(o.t)}${o.miss ? `<small> · 미집계 ${o.miss}개월 제외</small>` : ''}</span></div>`).join('');
}

function drawTable(el, last12, names) {
  const rows = [...last12].reverse();
  el.innerHTML = `<thead><tr><th>월</th>${names.map(n => `<th>${esc(label(n))}</th>`).join('')}<th>합계</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r.ym.replace('-', '.')}</td>${r.v.map(v => `<td class="${v === null ? 'na' : ''}">${fmt(v)}</td>`).join('')}<td><b>${fmt(sum(r.v))}</b></td></tr>`).join('')}</tbody>`;
}
