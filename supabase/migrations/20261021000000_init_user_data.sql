-- daily-english 사용자 데이터 (서버 전용)
-- 사용자 구분은 앱인토스 서버(mTLS)가 파트너 API로 직접 받은 신원으로만 한다.
-- 클라이언트는 이 테이블에 직접 접근하지 않는다: RLS를 켜고 anon·authenticated 권한을 모두 회수한다.
-- 서버는 secret key(service_role)로 접근한다.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  -- anon_key: 익명 식별키 교환(success.anonKey), toss_login: 토스 로그인 userKey
  identity_type text not null check (identity_type in ('anon_key', 'toss_login')),
  identity_key text not null,
  nickname text check (char_length(nickname) between 2 and 10),
  -- 레벨은 저장하지 않고 xp로 계산한다 (60 * L * (L - 1) / 2)
  xp integer not null default 0 check (xp >= 0),
  streak integer not null default 0 check (streak >= 0),
  last_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_type, identity_key)
);

create table public.daily_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  play_date date not null,
  question_ids integer[] not null,
  picks integer[] not null default '{}',
  correct integer check (correct >= 0),
  total integer check (total > 0),
  xp_gained integer check (xp_gained >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, play_date)
);

create table public.saved_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  question_id integer not null,
  kind text not null check (kind in ('sentence', 'word')),
  created_at timestamptz not null default now(),
  unique (user_id, question_id, kind)
);

create index saved_items_user_created_idx on public.saved_items (user_id, created_at desc);

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.daily_results enable row level security;
alter table public.saved_items enable row level security;

revoke all on table public.users, public.daily_results, public.saved_items from anon, authenticated;
revoke all on function public.set_updated_at() from anon, authenticated, public;
