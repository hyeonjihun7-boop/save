-- Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run

-- 1) 즐겨찾기 테이블 (이미지 자체가 아니라 Pixabay 이미지 id 만 저장)
create table if not exists public.favorites (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  pixabay_id  bigint not null,
  created_at  timestamptz not null default now(),
  unique (user_id, pixabay_id)
);

-- 2) RLS(행 단위 보안) 켜기: 로그인한 사용자는 "자기 행"만 읽고/쓰고/지울 수 있음
alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
drop policy if exists "favorites_insert_own" on public.favorites;
drop policy if exists "favorites_delete_own" on public.favorites;

create policy "favorites_select_own" on public.favorites
  for select to authenticated using (auth.uid() = user_id);

create policy "favorites_insert_own" on public.favorites
  for insert to authenticated with check (auth.uid() = user_id);

create policy "favorites_delete_own" on public.favorites
  for delete to authenticated using (auth.uid() = user_id);
