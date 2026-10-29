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
  $('#homeView').classList.toggle('hidden', v !== 'home');
  $('#favsView').classList.toggle('hidden', v !== 'favs');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  if (v === 'favs') renderFavs();
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
  setTimeout(loadFavs, 0); // onAuthStateChange 콜백 안에서 supabase 호출을 await 하면 교착될 수 있어 한 틱 미룸
}

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
load(true);
