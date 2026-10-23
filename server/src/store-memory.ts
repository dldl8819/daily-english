import type { Imported, NewSet, SetRow, Store, UserRow } from './store';

/** 테스트용 메모리 저장소. 조건부 변경은 Supabase 저장소와 같은 규칙을 따른다. */
export function createMemoryStore(): Store {
  const users = new Map<string, UserRow>();
  const identities = new Map<string, string>();
  const sets: SetRow[] = [];
  let nextSetId = 1;

  const copy = <T>(value: T): T => structuredClone(value);
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((n, i) => n === b[i]);

  return {
    async userByIdentity(identityKey) {
      let id = identities.get(identityKey);
      if (!id) {
        id = crypto.randomUUID();
        identities.set(identityKey, id);
        users.set(id, { id, imported_xp: 0, imported_streak: 0, imported_last_date: null, imported_seen: [], imported_at: null });
      }
      return copy(users.get(id)!);
    },
    async user(id) {
      const user = users.get(id);
      return user ? copy(user) : null;
    },
    async importOnce(id, data: Imported) {
      const user = users.get(id);
      if (!user || user.imported_at !== null) return false;
      Object.assign(user, copy(data), { imported_at: new Date().toISOString() });
      return true;
    },
    async sets(userId) {
      return copy(sets.filter((s) => s.user_id === userId));
    },
    async insertSet(set: NewSet) {
      if (sets.some((s) => s.user_id === set.user_id && s.play_date === set.play_date && s.kind === set.kind)) return null;
      const row: SetRow = {
        ...copy(set),
        id: nextSetId++,
        picks: [],
        reissues: 0,
        correct: null,
        total: null,
        xp_gained: null,
        completed_at: null,
      };
      sets.push(row);
      return copy(row);
    },
    async reissueSet(id, reissues, next) {
      const row = sets.find((s) => s.id === id);
      if (!row || row.reissues !== reissues || row.picks.length > 0 || row.completed_at !== null) return null;
      Object.assign(row, copy(next), { reissues: reissues + 1 });
      return copy(row);
    },
    async appendPick(id, expected, pick) {
      const row = sets.find((s) => s.id === id);
      if (!row || row.completed_at !== null || !same(row.picks, expected) || row.picks.length >= row.question_ids.length) return null;
      row.picks = [...row.picks, pick];
      return copy(row);
    },
    async completeSet(id, result) {
      const row = sets.find((s) => s.id === id);
      if (!row || row.completed_at !== null) return null;
      Object.assign(row, result, { completed_at: new Date().toISOString() });
      return copy(row);
    },
  };
}
