# 🍊 제주이야기 · Jeju IP 갤러리

Vite + Supabase(회원가입/로그인/즐겨찾기) + Pixabay(제주 사진) + Vercel 배포

- 제주 상징(한라산·해녀·돌하르방·감귤·오름·올레길…)을 Pixabay 사진으로 보여주는 갤러리
- 회원가입 / 로그인 / 로그아웃 (Supabase Auth, 이메일+비밀번호)
- 로그인한 사용자는 ♡ 로 사진을 **즐겨찾기** → `favorites` 테이블(RLS로 본인 데이터만 접근)
- Pixabay API 키는 **서버리스 함수(`api/pixabay.js`)** 안에만 있어서 브라우저에 노출되지 않음

```
jeju-ip/
├─ api/pixabay.js        ← Vercel 서버리스 함수 (Pixabay 프록시, 키 보관)
├─ src/                  ← 프론트엔드 (main.js, supabase.js, api.js, style.css)
├─ supabase/schema.sql   ← Supabase SQL Editor에서 실행할 테이블/보안 정책
├─ index.html · vite.config.js · package.json
└─ .env.example          ← 환경변수 견본
```

---

## 환경변수 한눈에 보기

| 이름 | 어디서 얻나 | 공개 여부 | 쓰이는 곳 |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → **Project URL** | 공개돼도 OK | 브라우저 |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → **anon public key** (신형 UI는 *publishable key*) | 공개돼도 OK (RLS가 보호) | 브라우저 |
| `PIXABAY_API_KEY` | https://pixabay.com/api/docs/ (로그인 시 표시) | **비공개** | 서버리스 함수만 |

> ⚠️ `service_role` / `secret` 키는 절대 쓰지 마세요. `VITE_` 로 시작하는 변수는 브라우저 코드에 그대로 포함됩니다.
> `PIXABAY_API_KEY` 에는 `VITE_` 를 **붙이지 않습니다** (붙이면 키가 공개됨).

---

## 절차 1 · Supabase 준비 (약 5분)

1. https://supabase.com/dashboard 에서 프로젝트 생성(이미 있으면 선택).
2. **키 확인**: 왼쪽 아래 ⚙ *Project Settings* → **API** (또는 상단 *Connect* 버튼)
   - `Project URL` → 메모 (`VITE_SUPABASE_URL`)
   - `anon` `public` 키 → 메모 (`VITE_SUPABASE_ANON_KEY`)
3. **테이블 만들기**: 왼쪽 메뉴 **SQL Editor** → *New query* → [`supabase/schema.sql`](supabase/schema.sql) 전체 붙여넣기 → **Run**
   - 확인: *Database → Tables* 에 `favorites` 가 보이고 RLS 가 켜져 있어야 함 (지금 `public` 스키마가 비어 있는 상태라면 정상)
4. **인증 설정**: **Authentication → Sign In / Providers → Email** 이 켜져 있는지 확인
   - 처음 테스트할 땐 *Confirm email* 을 끄면 가입 즉시 로그인됩니다. 켜 두면 인증 메일의 링크를 눌러야 로그인돼요(실서비스 권장).
   - 기본 메일 발송은 시간당 개수 제한이 있어요. 테스트가 막히면 *Confirm email* 을 잠시 끄세요.

## 절차 2 · Pixabay 키 받기 (약 2분)

1. https://pixabay.com 가입/로그인 → https://pixabay.com/api/docs/ 접속
2. 문서 위쪽 *Parameters* 근처에 **Your API key** 가 표시됩니다 → 메모 (`PIXABAY_API_KEY`)

## 절차 3 · 로컬 실행

사전 준비: [Node.js LTS](https://nodejs.org) 설치 (Windows: `winget install OpenJS.NodeJS.LTS`)

```bash
cd jeju-ip
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# .env 를 열어 3개 값을 채운다
npm install
npm run dev                 # http://localhost:5173
```

`npm run dev` 에서도 `/api/pixabay` 가 동작합니다 (vite.config.js 의 개발용 플러그인).
`.env` 를 수정한 뒤에는 dev 서버를 다시 시작하세요.

## 절차 4 · GitHub 에 올리기

이 폴더는 저장소의 `jeju-ip/` 하위 폴더입니다. (`.env` 는 `.gitignore` 로 제외되어 올라가지 않아요)

```bash
git add jeju-ip
git commit -m "Add jeju-ip site"
git push
```

## 절차 5 · Vercel 배포

1. https://vercel.com → **Add New… → Project** → GitHub 저장소(`save`) **Import**
2. **Configure Project** 화면에서
   - **Root Directory**: `jeju-ip` ← *Edit* 눌러 지정 (중요! 저장소 루트가 아님)
   - **Framework Preset**: `Vite` (자동 감지) · Build `npm run build` · Output `dist`
3. **Environment Variables** 에 3개를 추가 (Production · Preview · Development 모두 체크)

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon(publishable) key |
   | `PIXABAY_API_KEY` | Pixabay API key |

4. **Deploy** → 완료되면 `https://<프로젝트>.vercel.app` 주소가 생깁니다.
5. 환경변수를 나중에 바꿨다면 **Deployments → … → Redeploy** 해야 반영됩니다.

## 절차 6 · 배포 주소를 Supabase 에 등록 (필수!)

회원가입 인증 메일의 링크가 배포 주소로 돌아오려면 필요합니다.

1. Supabase → **Authentication → URL Configuration**
2. **Site URL**: `https://<프로젝트>.vercel.app`
3. **Redirect URLs** 에 추가: `https://<프로젝트>.vercel.app/**` , `http://localhost:5173/**`
4. Save

## 동작 확인 체크리스트

- [ ] 첫 화면에 한라산 사진이 뜬다 (안 뜨면 `PIXABAY_API_KEY` 확인)
- [ ] 회원가입 → (인증 메일 클릭) → 로그인 → 우측 상단에 닉네임 표시
- [ ] 사진의 ♡ 클릭 → ♥ 로 바뀜 → *내 즐겨찾기* 탭에 나타남
- [ ] Supabase → Table Editor → `favorites` 에 행이 생김
- [ ] 로그아웃 후 ♡ 를 누르면 로그인 창이 뜬다

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 화면 위에 노란 배너 | `VITE_SUPABASE_*` 가 없음 → `.env` / Vercel 환경변수 확인 후 재시작·재배포 |
| 사진 영역에 `PIXABAY_API_KEY 환경변수가…` | 서버 변수 누락. Vercel 에 추가 후 Redeploy |
| `Invalid login credentials` | 비밀번호 오류 또는 이메일 인증 전 |
| 가입 메일이 안 옴 | 스팸함 확인, 시간당 발송 제한 → *Confirm email* 끄고 테스트 |
| 즐겨찾기 저장 실패(`permission denied` / `relation does not exist`) | `schema.sql` 을 아직 실행하지 않았거나 RLS 정책 누락 |
| Vercel 빌드 `package.json not found` | Root Directory 를 `jeju-ip` 로 지정하지 않음 |
| `Too many requests` / 429 | Pixabay 는 60초에 100회 제한. 잠시 후 재시도 (응답은 1시간 캐시됨) |

## 사진 이용 안내

사진은 [Pixabay](https://pixabay.com) 에서 제공받으며, 이미지를 바로 보여주기만 하고 서버에 저장하지 않습니다.
즐겨찾기에는 이미지 파일이 아니라 **Pixabay 이미지 id 만** 저장하고 필요할 때 다시 조회합니다.
