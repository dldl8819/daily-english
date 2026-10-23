import type { SetKind } from '../../src/lib/apiTypes';

/** public.users (supabase/migrations). imported_*는 서버 연동 전 기기 기록을 한 번 가져온 값이다. */
export type UserRow = {
  id: string;
  imported_xp: number;
  imported_streak: number;
  imported_last_date: string | null;
  imported_seen: number[];
  imported_at: string | null;
};

/** public.daily_results. 사용자·날짜·종류마다 한 줄이다. */
export type SetRow = {
  id: number;
  user_id: string;
  play_date: string;
  kind: SetKind;
  question_ids: number[];
  picks: number[];
  review: number[];
  profile: string | null;
  reissues: number;
  correct: number | null;
  total: number | null;
  xp_gained: number | null;
  completed_at: string | null;
};

export type NewSet = Pick<SetRow, 'user_id' | 'play_date' | 'kind' | 'question_ids' | 'review' | 'profile'>;

export type Imported = Pick<UserRow, 'imported_xp' | 'imported_streak' | 'imported_last_date' | 'imported_seen'>;

/**
 * 서버가 쓰는 저장소. 동시에 들어온 요청이 서로 덮어쓰지 않도록 바꾸는 함수는 모두 조건부다.
 * 조건이 맞지 않아 바꾸지 못하면 null(또는 false)을 돌려준다.
 */
export interface Store {
  /** 신원으로 사용자를 찾고, 없으면 만든다. */
  userByIdentity(identityKey: string): Promise<UserRow>;
  user(id: string): Promise<UserRow | null>;
  /** 아직 가져온 적이 없을 때만 반영한다. */
  importOnce(id: string, data: Imported): Promise<boolean>;
  sets(userId: string): Promise<SetRow[]>;
  /** 같은 (사용자, 날짜, 종류)가 이미 있으면 null */
  insertSet(set: NewSet): Promise<SetRow | null>;
  /** 아직 답이 없고 reissues가 그대로일 때만 문제를 바꾼다. */
  reissueSet(id: number, reissues: number, next: Pick<SetRow, 'question_ids' | 'review' | 'profile'>): Promise<SetRow | null>;
  /** picks가 expected 그대로이고 완료 전일 때만 답을 덧붙인다. */
  appendPick(id: number, expected: number[], pick: number): Promise<SetRow | null>;
  /** 완료 전일 때만 결과를 기록한다. */
  completeSet(id: number, result: Pick<SetRow, 'correct' | 'total' | 'xp_gained'>): Promise<SetRow | null>;
}
