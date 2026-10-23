-- 앞으로 public에 만드는 테이블·시퀀스·함수도 anon·authenticated에 열리지 않게 한다.
-- Supabase는 public 스키마에 새로 만든 객체를 anon·authenticated에 자동으로 허용한다(기본 권한).
-- 초기 마이그레이션은 객체마다 권한을 회수했지만, 새 객체에서 회수를 빠뜨리면 Data API(/rest, /rpc)로 그대로 노출된다.
-- 서버는 secret key(service_role)로 접근하므로 service_role 권한은 그대로 둔다.
-- 마이그레이션과 SQL 편집기는 postgres 역할로 실행되므로 postgres가 만드는 객체에 적용한다.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- 함수 실행 권한은 PostgreSQL이 모든 스키마에서 PUBLIC에 기본으로 준다(anon도 PUBLIC에 속한다).
-- 스키마 단위로는 이 기본값을 회수할 수 없어 전역으로 회수한다.
alter default privileges for role postgres revoke execute on functions from public;

-- 초기 마이그레이션에서 빠진 identity 시퀀스 권한도 회수한다.
revoke all on sequence public.daily_results_id_seq, public.saved_items_id_seq from anon, authenticated;
