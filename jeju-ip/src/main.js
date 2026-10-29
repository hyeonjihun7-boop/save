import './style.css';
import { supabase, hasSupabase, authError } from './supabase.js';
import { searchImages, getImage } from './api.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 검색어는 Pixabay에서 결과가 잘 나오도록 영어로
const TOPICS = [
  { label: '🌋 한라산', q: 'hallasan' },
  { label: '🤿 해녀', q: 'haenyeo jeju' },
  { label: '🗿 돌하르방', q: 'dol hareubang' },
  { label: '🍊 감귤', q: 'jeju tangerine' },
  { label: '⛰️ 오름', q: 'jeju oreum' },
  { label: '🚶 올레길', q: 'jeju olle trail' },
  { label: '🌅 성산일출봉', q: 'seongsan ilchulbong' },
  { label: '🌊 제주 바다', q: 'jeju sea beach' },
  { label: '🐴 조랑말', q: 'jeju pony horse' },
  { label: '🌸 유채꽃', q: 'jeju canola flowers' },
];

const state = {
  topic: TOPICS[0], q: TOPICS[0].q, page: 1, items: [], total: 0, loading: false,
  user: null, favs: new Set(), view: 'home', byId: new Map(),
  products: [], productsErr: '', cart: new Map(), // cart: product_id -> quantity
};

/* ---------- 작은 유틸 ---------- */
let toastT = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400);
}
const setStatus = (msg, bad = false) => { const el = $('#status'); el.textContent = msg; el.classList.toggle('bad', bad); };

/* ---------- 카드 / 갤러리 ---------- */
const heartHtml = id => {
  const on = state.favs.has(id);
  return `<button class="heart ${on ? 'on' : ''}" data-heart="${id}" aria-label="즐겨찾기" title="즐겨찾기">${on ? '♥' : '♡'}</button>`;
};
const card = h => `
  <figure class="card" data-id="${h.id}">
    <img src="${esc(h.thumb)}" alt="${esc(h.tags)}" loading="lazy" width="${h.w}" height="${h.h}" />
    ${heartHtml(h.id)}
    <figcaption>${esc(h.tags)}</figcaption>
  </figure>`;

function renderChips() {
  $('#chips').innerHTML = TOPICS.map((t, i) =>
    `<button class="chip ${state.topic === t ? 'on' : ''}" data-i="${i}">${esc(t.label)}</button>`).join('');
}

async function load(reset) {
  if (state.loading) return;
  state.loading = true;
  if (reset) { state.page = 1; state.items = []; $('#grid').innerHTML = ''; }
  setStatus('사진을 불러오는 중…');
  $('#more').classList.add('hidden');
  try {
    const data = await searchImages(state.q, state.page);
    data.hits.forEach(h => state.byId.set(h.id, h));
    state.items.push(...data.hits);
    state.total = data.total;
    $('#grid').insertAdjacentHTML('beforeend', data.hits.map(card).join(''));
    const name = state.topic ? state.topic.label : `“${state.q}”`;
    setStatus(state.items.length
      ? `${name} · 사진 ${state.total.toLocaleString()}장 중 ${state.items.length}장`
      : '검색 결과가 없어요. 다른 단어로 찾아보세요.');
    $('#more').classList.toggle('hidden', state.items.length >= state.total || data.hits.length === 0);
  } catch (e) {
    setStatus('⚠️ ' + e.message, true);
  } finally {
    state.loading = false;
  }
}

$('#chips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  state.topic = TOPICS[+b.dataset.i]; state.q = state.topic.q; $('#q').value = '';
  renderChips(); load(true);
});
$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#q').value.trim();
  state.topic = null; state.q = v || 'jeju';
  renderChips(); load(true);
});
$('#more').addEventListener('click', () => { state.page += 1; load(false); });

// 사진 로딩: 도착하면 페이드인, 실패하면 한 번 재시도 후 빈 칸 아이콘 (load/error 는 버블링되지 않아 capture 로 받는다)
function watchImages(grid) {
  grid.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ld'); }, true);
  grid.addEventListener('error', e => {
    const img = e.target; if (img.tagName !== 'IMG') return;
    if (!img.dataset.retry) {
      img.dataset.retry = '1';
      const src = img.getAttribute('src');
      setTimeout(() => { img.src = src + (src.includes('?') ? '&' : '?') + 'r=1'; }, 900);
    } else img.closest('.card')?.classList.add('err');
  }, true);
}
watchImages($('#grid')); watchImages($('#favGrid'));

/* ---------- 즐겨찾기 ---------- */
function paintHearts() {
  document.querySelectorAll('[data-heart]').forEach(b => {
    const on = state.favs.has(Number(b.dataset.heart));
    b.classList.toggle('on', on); b.textContent = on ? '♥' : '♡';
  });
}

async function loadFavs() {
  state.favs = new Set();
  if (state.user && hasSupabase) {
    const { data, error } = await supabase.from('favorites').select('pixabay_id').order('created_at', { ascending: false });
    if (error) toast('즐겨찾기를 불러오지 못했어요: ' + error.message);
    else state.favs = new Set(data.map(r => Number(r.pixabay_id)));
  }
  paintHearts();
  if (state.view === 'favs') renderFavs();
}

async function toggleFav(id) {
  if (!hasSupabase) return toast('Supabase 환경변수가 설정되지 않았어요.');
  if (!state.user) return openAuth('login', '즐겨찾기는 로그인 후에 쓸 수 있어요 🍊');
  const wasOn = state.favs.has(id);
  state.favs = wasOn ? new Set([...state.favs].filter(x => x !== id)) : new Set([id, ...state.favs]);
  paintHearts();
  const { error } = wasOn
    ? await supabase.from('favorites').delete().eq('pixabay_id', id)
    : await supabase.from('favorites').insert({ pixabay_id: id });
  if (error && error.code !== '23505') { // 23505 = 이미 저장됨(중복)은 성공으로 취급
    state.favs = wasOn ? new Set([id, ...state.favs]) : new Set([...state.favs].filter(x => x !== id));
    paintHearts();
    return toast('저장에 실패했어요: ' + error.message);
  }
  toast(wasOn ? '즐겨찾기에서 뺐어요' : '❤ 즐겨찾기에 담았어요');
  if (state.view === 'favs') renderFavs();
}

let favToken = 0;
async function renderFavs() {
  const grid = $('#favGrid'), st = $('#favStatus'), my = ++favToken;
  if (!hasSupabase) { grid.innerHTML = ''; st.textContent = 'Supabase 환경변수를 설정하면 사용할 수 있어요.'; return; }
  if (!state.user) {
    grid.innerHTML = '';
    st.innerHTML = '로그인하면 마음에 든 사진을 모아 볼 수 있어요. <button class="link" id="favLogin">로그인하기</button>';
    return;
  }
  const ids = [...state.favs].slice(0, 40);
  if (!ids.length) { grid.innerHTML = ''; st.textContent = '아직 담은 사진이 없어요. 갤러리에서 ♡ 를 눌러 보세요!'; return; }
  st.textContent = '불러오는 중…';
  const hits = (await Promise.all(ids.map(id => getImage(id).catch(() => null)))).filter(Boolean);
  if (my !== favToken) return; // 그 사이 다시 렌더링됨
  hits.forEach(h => state.byId.set(h.id, h));
  grid.innerHTML = hits.map(card).join('');
  st.textContent = `${hits.length}장` + (hits.length < ids.length ? ' (일부 사진은 불러오지 못했어요)' : '');
}
$('#favStatus').addEventListener('click', e => { if (e.target.id === 'favLogin') openAuth('login'); });

/* ---------- 이미지 크게 보기 ---------- */
const viewDlg = $('#viewDlg');
function openView(id) {
  const h = state.byId.get(id); if (!h) return;
  $('#viewBody').innerHTML = `
    <img class="big" src="${esc(h.large)}" alt="${esc(h.tags)}" />
    <div class="vinfo">
      <div>
        <b>${esc(h.tags)}</b>
        <small>Photo by <a href="${esc(h.page)}" target="_blank" rel="noopener">${esc(h.user)}</a> · Pixabay</small>
      </div>
      ${heartHtml(h.id)}
    </div>`;
  viewDlg.showModal();
}
function onGridClick(e) {
  const heart = e.target.closest('[data-heart]');
  if (heart) { e.stopPropagation(); return toggleFav(Number(heart.dataset.heart)); }
  const c = e.target.closest('.card'); if (c) openView(Number(c.dataset.id));
}
$('#grid').addEventListener('click', onGridClick);
$('#favGrid').addEventListener('click', onGridClick);
$('#viewBody').addEventListener('click', e => { const heart = e.target.closest('[data-heart]'); if (heart) toggleFav(Number(heart.dataset.heart)); });

/* ---------- 탭 전환 ---------- */
function switchView(v) {
  state.view = v;
  ['home', 'favs', 'shop', 'cart'].forEach(name => $(`#${name}View`).classList.toggle('hidden', v !== name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  if (v === 'favs') renderFavs();
  if (v === 'shop') renderShop();
  if (v === 'cart') renderCart();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelector('.tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) switchView(t.dataset.view); });

/* ---------- 인증 (Supabase Auth) ---------- */
const authDlg = $('#authDlg');
let mode = 'login';

function setMode(m) {
  mode = m;
  const signup = m === 'signup';
  $('#authTitle').textContent = signup ? '회원가입' : '로그인';
  $('#authSubmit').textContent = signup ? '가입하기' : '로그인';
  authDlg.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  authDlg.querySelector('.signup-only').classList.toggle('hidden', !signup);
  $('#pw').autocomplete = signup ? 'new-password' : 'current-password';
  $('#authMsg').textContent = ''; $('#authMsg').className = 'msg';
}
function openAuth(m = 'login', note = '') {
  if (!hasSupabase) return toast('Supabase 환경변수가 설정되지 않았어요.');
  setMode(m);
  const n = $('#authNote'); n.textContent = note; n.classList.toggle('hidden', !note);
  if (!authDlg.open) authDlg.showModal();
  $('#email').focus();
}
authDlg.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode); });

function showMsg(text, ok = false) { const el = $('#authMsg'); el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); }

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#email').value.trim(), password = $('#pw').value, nick = $('#nick').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showMsg('올바른 이메일을 입력해 주세요.');
  if (password.length < 6) return showMsg('비밀번호는 6자 이상이어야 해요.');
  const btn = $('#authSubmit'); btn.disabled = true;
  try {
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authDlg.close(); toast('환영해요! 🍊');
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { nickname: nick || email.split('@')[0] }, emailRedirectTo: location.origin },
      });
      if (error) throw error;
      if (data.session) { authDlg.close(); toast('가입 완료! 환영해요 🎉'); }
      else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) showMsg('이미 가입된 이메일이에요. 로그인해 주세요.');
      else { showMsg('가입 완료! 📧 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.', true); }
    }
  } catch (err) {
    showMsg(authError(err));
  } finally {
    btn.disabled = false;
  }
});

function renderAuth() {
  const box = $('#authBox');
  if (!hasSupabase) { box.innerHTML = '<button class="ghost" disabled title="환경변수 설정 필요">로그인 (설정 필요)</button>'; return; }
  if (state.user) {
    const u = state.user, name = u.user_metadata?.nickname || (u.email || '').split('@')[0];
    box.innerHTML = `<span class="me">🍊 ${esc(name)}님</span><button class="ghost" id="logout">로그아웃</button>`;
  } else {
    box.innerHTML = '<button class="ghost" id="loginBtn">로그인</button><button class="primary sm" id="signupBtn">회원가입</button>';
  }
}
$('#authBox').addEventListener('click', async e => {
  if (e.target.id === 'loginBtn') openAuth('login');
  else if (e.target.id === 'signupBtn') openAuth('signup');
  else if (e.target.id === 'logout') { await supabase.auth.signOut(); toast('로그아웃했어요. 또 만나요!'); }
});

function setUser(user) {
  state.user = user;
  renderAuth();
  setTimeout(() => { loadFavs(); loadCart(); }, 0); // onAuthStateChange 콜백 안에서 supabase 호출을 await 하면 교착될 수 있어 한 틱 미룸
}

/* ---------- 굿즈샵 · 장바구니 (products / cart_items 테이블) ---------- */
const won = n => Number(n).toLocaleString('ko-KR') + '원';

// 상품 사진은 Pixabay 검색 첫 결과를 사용 (없으면 이모지)
const thumbCache = new Map();
async function productThumb(q) {
  if (thumbCache.has(q)) return thumbCache.get(q);
  let url = null;
  try { url = (await searchImages(q, 1, 3)).hits[0]?.thumb || null; } catch { /* 이모지로 대체 */ }
  thumbCache.set(q, url);
  return url;
}
const fillThumb = (el, q) => productThumb(q).then(u => { if (u && el.isConnected) { el.style.backgroundImage = `url("${u}")`; el.classList.add('has'); } });

async function loadProducts() {
  if (!hasSupabase) return;
  const { data, error } = await supabase.from('products').select('*').eq('active', true).order('id');
  if (error) state.productsErr = error.message; else { state.productsErr = ''; state.products = data; }
  if (state.view === 'shop') renderShop();
  if (state.view === 'cart') renderCart();
}

function renderShop() {
  const grid = $('#shopGrid'), st = $('#shopStatus');
  if (!hasSupabase) { grid.innerHTML = ''; st.textContent = 'Supabase 환경변수를 설정하면 사용할 수 있어요.'; return; }
  if (state.productsErr) {
    grid.innerHTML = '';
    st.innerHTML = `⚠️ 상품을 불러오지 못했어요: ${esc(state.productsErr)}<br>Supabase SQL Editor 에서 <code>supabase/cart.sql</code> 을 실행했는지 확인해 주세요.`;
    st.classList.add('bad'); return;
  }
  st.classList.remove('bad');
  st.textContent = state.products.length ? `상품 ${state.products.length}개 · 로그인 후 장바구니에 담을 수 있어요` : '등록된 상품이 없어요.';
  grid.innerHTML = state.products.map(p => `
    <article class="prod">
      <div class="pimg" data-q="${esc(p.image_query)}"><span>${esc(p.emoji || '🍊')}</span></div>
      <div class="pbody">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description || '')}</p>
        <div class="prow"><b>${won(p.price)}</b><button class="primary sm" data-add="${p.id}">🛒 담기</button></div>
      </div>
    </article>`).join('');
  grid.querySelectorAll('.pimg').forEach(el => fillThumb(el, el.dataset.q));
}

function paintCartCount() {
  const n = [...state.cart.values()].reduce((a, b) => a + b, 0), el = $('#cartCount');
  el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', n === 0);
}

async function loadCart() {
  state.cart = new Map();
  if (state.user && hasSupabase) {
    const { data, error } = await supabase.from('cart_items').select('product_id, quantity').order('created_at');
    if (error) toast('장바구니를 불러오지 못했어요: ' + error.message);
    else data.forEach(r => state.cart.set(Number(r.product_id), r.quantity));
  }
  paintCartCount();
  if (state.view === 'cart') renderCart();
}

// 수량 설정(0 이하면 삭제). 화면을 먼저 바꾸고(낙관적 업데이트) 실패하면 되돌린다.
async function setQty(pid, qty) {
  if (!hasSupabase) { toast('Supabase 환경변수가 설정되지 않았어요.'); return false; }
  if (!state.user) { openAuth('login', '장바구니는 로그인 후에 쓸 수 있어요 🛒'); return false; }
  const prev = state.cart.get(pid) || 0; qty = Math.min(qty, 99);
  if (qty <= 0) state.cart.delete(pid); else state.cart.set(pid, qty);
  paintCartCount(); if (state.view === 'cart') renderCart();
  const { error } = qty <= 0
    ? await supabase.from('cart_items').delete().eq('product_id', pid)
    : await supabase.from('cart_items').upsert({ product_id: pid, quantity: qty }, { onConflict: 'user_id,product_id' });
  if (error) {
    if (prev) state.cart.set(pid, prev); else state.cart.delete(pid);
    paintCartCount(); if (state.view === 'cart') renderCart();
    toast('저장에 실패했어요: ' + error.message); return false;
  }
  return true;
}
const addToCart = async pid => { if (await setQty(pid, (state.cart.get(pid) || 0) + 1)) toast('🛒 장바구니에 담았어요'); };

async function clearCart() {
  if (!state.cart.size) return;
  const backup = new Map(state.cart);
  state.cart = new Map(); paintCartCount(); renderCart();
  const { error } = await supabase.from('cart_items').delete().eq('user_id', state.user.id);
  if (error) { state.cart = backup; paintCartCount(); renderCart(); toast('비우지 못했어요: ' + error.message); }
  else toast('장바구니를 비웠어요');
}

function renderCart() {
  const box = $('#cartBody');
  if (!hasSupabase) { box.innerHTML = '<p class="status">Supabase 환경변수를 설정하면 사용할 수 있어요.</p>'; return; }
  if (!state.user) { box.innerHTML = '<p class="status">로그인하면 장바구니를 쓸 수 있어요. <button class="link" data-login>로그인하기</button></p>'; return; }
  const pm = new Map(state.products.map(p => [Number(p.id), p]));
  const rows = [...state.cart].filter(([pid]) => pm.has(pid));
  if (!rows.length) { box.innerHTML = '<p class="status">장바구니가 비어 있어요. 굿즈샵에서 담아 보세요! <button class="link" data-goshop>굿즈샵 가기</button></p>'; return; }
  let total = 0;
  const list = rows.map(([pid, q]) => {
    const p = pm.get(pid); total += p.price * q;
    return `<li class="crow">
      <div class="cthumb" data-q="${esc(p.image_query)}"><span>${esc(p.emoji || '🍊')}</span></div>
      <div class="cinfo"><b>${esc(p.name)}</b><small>${won(p.price)}</small></div>
      <div class="qty"><button data-dec="${pid}" aria-label="수량 줄이기">−</button><span>${q}</span><button data-inc="${pid}" aria-label="수량 늘리기">+</button></div>
      <div class="csum">${won(p.price * q)}</div>
      <button class="del" data-del="${pid}" aria-label="삭제">✕</button>
    </li>`;
  }).join('');
  box.innerHTML = `<ul class="clist">${list}</ul>
    <div class="ctotal"><span>합계 (${rows.reduce((a, [, q]) => a + q, 0)}개)</span><b>${won(total)}</b></div>
    <div class="cact"><button class="plain" data-clear>비우기</button><button class="primary" data-order>주문하기 (데모)</button></div>`;
  box.querySelectorAll('.cthumb').forEach(el => fillThumb(el, el.dataset.q));
}

$('#shopGrid').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) addToCart(Number(b.dataset.add)); });
$('#cartBody').addEventListener('click', e => {
  const t = e.target, pick = sel => t.closest(sel);
  let b;
  if ((b = pick('[data-inc]'))) setQty(Number(b.dataset.inc), (state.cart.get(Number(b.dataset.inc)) || 0) + 1);
  else if ((b = pick('[data-dec]'))) setQty(Number(b.dataset.dec), (state.cart.get(Number(b.dataset.dec)) || 0) - 1);
  else if ((b = pick('[data-del]'))) setQty(Number(b.dataset.del), 0);
  else if (pick('[data-clear]')) clearCart();
  else if (pick('[data-order]')) toast('결제 연동은 아직 준비 중이에요 🙏 (데모)');
  else if (pick('[data-login]')) openAuth('login');
  else if (pick('[data-goshop]')) switchView('shop');
});

/* ---------- 공통: 다이얼로그 닫기 ---------- */
document.querySelectorAll('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d) d.close(); }); // 배경 클릭
  d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
});

/* ---------- 시작 ---------- */
if (!hasSupabase) {
  const b = $('#envBanner');
  b.innerHTML = '⚙️ <b>Supabase 환경변수</b>(<code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>)가 아직 없어서 로그인 기능이 꺼져 있어요. README의 설정 절차를 따라 주세요.';
  b.classList.remove('hidden');
}
renderChips();
renderAuth();
if (hasSupabase) supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
loadProducts();
load(true);
