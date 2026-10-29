-- 장바구니 기능 추가 SQL
-- Supabase 대시보드 → SQL Editor → New query 에 전체 붙여넣고 Run
-- (schema.sql 을 이미 실행했다면 이 파일만 추가로 실행하면 됩니다. 여러 번 실행해도 안전합니다)

-- ============================================================
-- 1) products : 굿즈 상품 (누구나 조회 가능, 수정은 대시보드에서만)
-- ============================================================
create table if not exists public.products (
  id           bigint generated always as identity primary key,
  name         text    not null,
  description  text,
  price        integer not null check (price >= 0),          -- 원 단위
  emoji        text    not null default '🍊',
  image_query  text    not null default 'jeju',               -- Pixabay 검색어(상품 사진용)
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "products_read_active" on public.products;
create policy "products_read_active" on public.products
  for select to anon, authenticated
  using (active);

-- 샘플 상품: 테이블이 비어 있을 때만 넣음
insert into public.products (name, description, price, emoji, image_query)
select * from (values
  ('돌하르방 미니어처',   '현무암 느낌 그대로, 책상 위 제주 수호신',          12000, '🗿', 'dol hareubang'),
  ('한라봉 선물세트 3kg', '새콤달콤 제주 한라봉 (9~12과)',                    29000, '🍊', 'hallabong tangerine'),
  ('해녀 에코백',         '물질하는 해녀를 담은 캔버스 장바구니',              15000, '👜', 'haenyeo'),
  ('제주 조랑말 키링',    '작지만 튼튼한 제주 조랑말 가죽 키링',                6500, '🐴', 'jeju pony horse'),
  ('오름 엽서 8종 세트',  '제주 오름 풍경 엽서 8장',                            5000, '✉️', 'jeju oreum'),
  ('유채꽃 소이캔들',     '봄 제주 유채꽃밭을 닮은 은은한 향',                 18000, '🕯️', 'canola flowers'),
  ('성산일출봉 마그넷',   '냉장고 위의 일출',                                    4500, '🧲', 'seongsan ilchulbong'),
  ('한라산 머그컵',       '백록담이 그려진 도자기 머그',                        13000, '☕', 'hallasan')
) as v(name, description, price, emoji, image_query)
where not exists (select 1 from public.products);

-- ============================================================
-- 2) cart_items : 사용자별 장바구니 (한 상품은 한 줄, 수량으로 관리)
-- ============================================================
create table if not exists public.cart_items (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  product_id  bigint not null references public.products (id) on delete cascade,
  quantity    integer not null default 1 check (quantity between 1 and 99),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists cart_items_user_idx on public.cart_items (user_id);

-- 수정할 때 updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3) RLS : 로그인한 사용자는 "자기 장바구니"만 읽고/담고/수정/삭제
-- ============================================================
alter table public.cart_items enable row level security;

drop policy if exists "cart_select_own" on public.cart_items;
drop policy if exists "cart_insert_own" on public.cart_items;
drop policy if exists "cart_update_own" on public.cart_items;
drop policy if exists "cart_delete_own" on public.cart_items;

create policy "cart_select_own" on public.cart_items
  for select to authenticated using (auth.uid() = user_id);

create policy "cart_insert_own" on public.cart_items
  for insert to authenticated with check (auth.uid() = user_id);

create policy "cart_update_own" on public.cart_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cart_delete_own" on public.cart_items
  for delete to authenticated using (auth.uid() = user_id);
