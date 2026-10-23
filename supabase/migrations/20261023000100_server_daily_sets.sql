-- 서버가 문제를 내고 채점한다. 문제 은행(정답·해설)은 서버(server/)에만 두고 클라이언트 번들에는 넣지 않는다.
-- 사용자마다 날짜별로 기본 세트 1개와 보너스 세트(공유·광고 방법마다 1개)만 낸다.
-- 이 한도가 문제 은행을 한꺼번에 가져가지 못하게 막는다.

alter table public.daily_results
  -- daily: 오늘의 문제, share·ad: 보너스 5문제
  add column kind text not null default 'daily' check (kind in ('daily', 'share', 'ad')),
  -- question_ids 중 낼 때 이미 본 적 있던 문제(복습)
  add column review integer[] not null default '{}',
  -- 문제를 고른 맞춤 설정. 아직 하나도 풀지 않았을 때 설정이 바뀌면 다시 고른다.
  add column profile text,
  -- 다시 고른 횟수. 하루에 몇 번까지만 허용해 문제를 계속 바꿔 보지 못하게 한다.
  add column reissues smallint not null default 0 check (reissues >= 0),
  add constraint daily_results_picks_within check (cardinality(picks) <= cardinality(question_ids));

alter table public.daily_results drop constraint daily_results_user_id_play_date_key;
alter table public.daily_results add constraint daily_results_user_id_play_date_kind_key unique (user_id, play_date, kind);

-- 아래 세 값은 서버 연동 전 기기에 쌓인 기록을 한 번 가져온 것이다.
-- 지금 XP·연속 학습일은 이 값에서 시작해 완료한 세트를 날짜순으로 더해 계산한다. 따로 카운터를 두지 않는다.
alter table public.users rename column xp to imported_xp;
alter table public.users rename column streak to imported_streak;
alter table public.users rename column last_date to imported_last_date;
alter table public.users rename constraint users_xp_check to users_imported_xp_check;
alter table public.users rename constraint users_streak_check to users_imported_streak_check;

alter table public.users
  -- 서버 연동 전 기기에서 본 문제. 새 문제를 먼저 내는 데만 쓰고, 문제 내용을 열어 주지는 않는다.
  add column imported_seen integer[] not null default '{}',
  add column imported_at timestamptz;
