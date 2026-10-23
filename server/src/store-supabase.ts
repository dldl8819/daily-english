import { type PostgrestError, createClient } from '@supabase/supabase-js';
import type { NewSet, SetRow, Store, UserRow } from './store';

const USER_COLUMNS = 'id, imported_xp, imported_streak, imported_last_date, imported_seen, imported_at';
const SET_COLUMNS = 'id, user_id, play_date, kind, question_ids, picks, review, profile, reissues, correct, total, xp_gained, completed_at';
const UNIQUE_VIOLATION = '23505';

type Rows<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null; status: number }>;

/** 서버 로그(api_error의 detail)에 남길 원인. 게이트웨이 오류처럼 코드가 없으면 HTTP 상태로 구분한다. */
function dbError(error: PostgrestError, status: number): Error {
  return new Error(`supabase ${status} ${error.code || '-'}: ${error.message.trim()}`);
}

/** PostgREST 배열 리터럴. "picks가 그대로일 때만" 같은 조건에 쓴다. */
function pgArray(values: number[]): string {
  return `{${values.join(',')}}`;
}

/**
 * Supabase Data API 저장소. secret key(service_role)로 접근한다.
 * 테이블은 anon·authenticated 권한이 없어 이 키로만 읽고 쓸 수 있다.
 */
export function createSupabaseStore(url: string, secretKey: string): Store {
  const db = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  async function rows<T>(query: Rows<T>): Promise<T[]> {
    const { data, error, status } = await query;
    if (error) throw dbError(error, status);
    return data ?? [];
  }

  async function first<T>(query: Rows<T>): Promise<T | null> {
    return (await rows(query))[0] ?? null;
  }

  const findUser = (identityKey: string) =>
    first<UserRow>(db.from('users').select(USER_COLUMNS).eq('identity_type', 'anon_key').eq('identity_key', identityKey).limit(1));

  return {
    async userByIdentity(identityKey) {
      const found = await findUser(identityKey);
      if (found) return found;
      const { data, error, status } = await db.from('users').insert({ identity_type: 'anon_key', identity_key: identityKey }).select(USER_COLUMNS);
      if (!error && data?.[0]) return data[0] as UserRow;
      if (error && error.code !== UNIQUE_VIOLATION) throw dbError(error, status);
      // 같은 사용자의 첫 요청이 동시에 들어와 다른 요청이 먼저 만들었다.
      const created = await findUser(identityKey);
      if (!created) throw new Error('user insert conflict without row');
      return created;
    },
    user(id) {
      return first<UserRow>(db.from('users').select(USER_COLUMNS).eq('id', id).limit(1));
    },
    async importOnce(id, data) {
      const updated = await rows(
        db
          .from('users')
          .update({ ...data, imported_at: new Date().toISOString() })
          .eq('id', id)
          .is('imported_at', null)
          .select('id'),
      );
      return updated.length > 0;
    },
    sets(userId) {
      return rows<SetRow>(db.from('daily_results').select(SET_COLUMNS).eq('user_id', userId));
    },
    async insertSet(set: NewSet) {
      const { data, error, status } = await db.from('daily_results').insert(set).select(SET_COLUMNS);
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error) throw dbError(error, status);
      return (data?.[0] as SetRow | undefined) ?? null;
    },
    reissueSet(id, reissues, next) {
      return first<SetRow>(
        db
          .from('daily_results')
          .update({ ...next, reissues: reissues + 1 })
          .eq('id', id)
          .eq('reissues', reissues)
          .filter('picks', 'eq', pgArray([]))
          .is('completed_at', null)
          .select(SET_COLUMNS),
      );
    },
    appendPick(id, expected, pick) {
      return first<SetRow>(
        db
          .from('daily_results')
          .update({ picks: [...expected, pick] })
          .eq('id', id)
          .filter('picks', 'eq', pgArray(expected))
          .is('completed_at', null)
          .select(SET_COLUMNS),
      );
    },
    completeSet(id, result) {
      return first<SetRow>(
        db
          .from('daily_results')
          .update({ ...result, completed_at: new Date().toISOString() })
          .eq('id', id)
          .is('completed_at', null)
          .select(SET_COLUMNS),
      );
    },
  };
}
