'use client';

import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Progress, Question, SavedKind, StudyProfile } from '@/lib/types';
import { ApiError, SERVER_MODE } from '@/lib/api';
import type { SetKind } from '@/lib/apiTypes';
import { loadLocalBank } from '@/lib/localBank';
import { QUESTION_CACHE_KEY, type QuestionCache, cachedQuestions, parseQuestionCache, withGraded } from '@/lib/questionCache';
import { applyToday, completeSet, fetchToday, importOnce, openBonus, submitAnswer, withBonus, withSet } from '@/lib/remote';
import {
  attemptQuestions,
  bindUser,
  bonusQuestions,
  completeBonus,
  grantBonus,
  recordBonusPick,
  todaysBonus,
  completeDay,
  countCorrect,
  dateKey,
  recordPick,
  setStudyProfile,
  startAttempt,
  visibleStreak,
} from '@/lib/daily';
import { levelFromXp, levelProgress } from '@/lib/level';
import { WRONG_BACKFILL_KEY, loadProgress, loadUserKey, loadValue, saveProgress, saveValue, todayKey } from '@/lib/storage';
import { setNickname } from '@/lib/profile';
import { isSaved, toggleSaved } from '@/lib/saved';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, dailyGoalOf } from '@/lib/study';
import { backfillWrong, noteAnswer, removeWrong, wrongEntries } from '@/lib/wrong';
import BannerAd from './BannerAd';
import BonusSection from './BonusSection';
import SavedView from './SavedView';
import Prompt from './Prompt';
import SettingsView, { type SettingsSection } from './SettingsView';
import StudyWizard from './StudyWizard';
import { requestReview, shouldAskReview, track, trackScreen } from '@/lib/analytics';
import TodayReview, { type ReviewGroup } from './TodayReview';
import { useTheme } from './useTheme';
import { useView } from './useView';
import WrongView from './WrongView';

const BONUS_SOURCE = { share: '친구에게 알리기', ad: '광고 보기' } as const;
const BONUS_TITLE = { share: `보너스: ${BONUS_SOURCE.share}`, ad: `보너스: ${BONUS_SOURCE.ad}` } as const;

function LevelCard({ progress, streak }: { progress: Progress; streak: number }) {
  const { level, current, needed } = levelProgress(progress.xp);
  const percent = Math.min(100, Math.round((current / needed) * 100));
  return (
    <section className="card" aria-labelledby="level-heading">
      <h2 id="level-heading" className="sr-only">
        내 레벨
      </h2>
      {progress.nickname && <p className="greeting">{progress.nickname}님</p>}
      <div className="row">
        <span className="level">
          <span aria-hidden="true">Lv.{level}</span>
          <span className="sr-only">레벨 {level}</span>
        </span>
        <span className="sub">
          <span aria-hidden="true">
            {current} / {needed} XP
          </span>
          <span className="sr-only">
            다음 레벨까지 {needed} XP 중 {current} XP
          </span>
        </span>
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-label="다음 레벨까지 진행도"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div style={{ width: `${percent}%` }} />
      </div>
      <p className="sub streak">{streak > 0 ? `${streak}일 연속으로 풀었어요` : '오늘 첫 문제를 풀어 보세요'}</p>
    </section>
  );
}

type QuizProps = {
  questions: Question[];
  picks: number[];
  onPick: (index: number, choice: number) => void;
  onFinish: () => void;
  isSaved: (questionId: number, kind: SavedKind) => boolean;
  onToggleSave: (questionId: number, kind: SavedKind) => void;
  /** 스크린리더용 이름 앞말. 예: "보너스" */
  label?: string;
  /** 처음 그릴 때 문제 제목으로 포커스를 옮긴다 (보너스 문제가 열린 직후) */
  autoFocus?: boolean;
  /** 서버 모드: 채점·완료를 서버에 보내는 중이면 true. 기기 안에서만 풀 때는 넘기지 않는다. */
  busy?: boolean;
  /** 서버 모드: 채점·완료에 실패한 이유 */
  error?: string;
};

function Quiz({ questions, picks, onPick, onFinish, isSaved, onToggleSave, label = '', autoFocus = false, busy, error }: QuizProps) {
  // 앱을 다시 열면 답하지 않은 첫 문제부터 이어서 푼다.
  const [index, setIndex] = useState(() => Math.min(picks.length, questions.length - 1));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const moved = useRef(autoFocus);
  const promptId = useId();

  const question = questions[index];
  const picked = picks[index] ?? null;
  const answered = picked !== null;
  const isLast = index === questions.length - 1;
  const isCorrect = picked === question.answer;

  // 다음 문제로 넘어가면 문제 제목으로, 답을 고르면 결과로 포커스를 옮긴다.
  // 고른 버튼이 비활성화되며 포커스를 잃지 않도록 하기 위해서다. 처음 그릴 때는 옮기지 않는다.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [index]);

  useEffect(() => {
    if (answered && moved.current) feedbackRef.current?.focus();
  }, [answered]);

  function pick(choice: number) {
    moved.current = true;
    onPick(index, choice);
  }

  function next() {
    if (isLast) {
      onFinish();
      return;
    }
    moved.current = true;
    setIndex(index + 1);
  }

  return (
    <section className="card" aria-labelledby="question-heading">
      <h2 id="question-heading" className="step" tabIndex={-1} ref={headingRef}>
        <span aria-hidden="true">
          {label && `${label} `}
          {index + 1} / {questions.length}
        </span>
        <span className="sr-only">
          {label} {questions.length}문제 중 {index + 1}번째 문제, {CATEGORY_LABEL[question.category]},{' '}
          {DIFFICULTY_LABEL[question.difficulty]}
        </span>
      </h2>
      <div aria-hidden="true">
        <span className="tag">{CATEGORY_LABEL[question.category]}</span>{' '}
        <span className="tag">{DIFFICULTY_LABEL[question.difficulty]}</span>
      </div>
      <p id={promptId} className="prompt" lang="en">
        <Prompt text={question.prompt} />
      </p>
      <div role="group" aria-labelledby={promptId}>
        {question.choices.map((text, i) => {
          const state = !answered ? '' : i === question.answer ? 'ok' : i === picked ? 'bad' : '';
          const mark = !answered ? null : i === question.answer ? '정답' : i === picked ? '내 선택' : null;
          return (
            <button
              key={i}
              type="button"
              className={`choice ${state}`}
              aria-disabled={answered || !!busy}
              onClick={() => !answered && !busy && pick(i)}
            >
              <span lang="en">{text}</span>
              {mark && (
                <span className="mark">
                  <span aria-hidden="true">{mark === '정답' ? '✓ ' : '✗ '}</span>
                  {mark}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {busy !== undefined && (
        <p className="sub" role="status">
          {busy ? '확인하는 중이에요' : ''}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {answered && (
        <>
          <div className="explain" ref={feedbackRef} tabIndex={-1}>
            <p className="verdict">
              {isCorrect ? (
                '정답이에요.'
              ) : (
                <>
                  오답이에요. 정답은 <span lang="en">{question.choices[question.answer]}</span>예요.
                </>
              )}
            </p>
            <p>{question.explanation}</p>
          </div>
          <div className="save-row" role="group" aria-label="다시 볼 항목에 저장">
            {(['sentence', 'word'] as const).map((kind) => {
              const on = isSaved(question.id, kind);
              return (
                <button
                  key={kind}
                  type="button"
                  className="small-btn"
                  aria-pressed={on}
                  onClick={() => onToggleSave(question.id, kind)}
                >
                  {on && <span aria-hidden="true">✓ </span>}
                  {kind === 'sentence' ? '문장 저장' : '단어 저장'}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn" onClick={() => !busy && next()} aria-disabled={busy}>
            {isLast ? '결과 보기' : '다음 문제'}
          </button>
        </>
      )}
    </section>
  );
}

type ResultProps = {
  /** 오늘의 5문제와 그날 마친 보너스를 합친 값 */
  correct: number;
  total: number;
  xpGained: number;
  /** 합계를 나눠 적은 한 줄. 보너스를 안 풀었으면 null */
  breakdown: string | null;
  /** 지금 누적 XP. 레벨 변화와 다음 레벨까지 남은 XP를 알려 주는 데 쓴다. */
  xp: number;
  focusOnMount: boolean;
  onReview: (() => void) | null;
  /** 결과 카드 안에 넣는 "5문제 더 풀기" */
  children?: ReactNode;
};

function Result({ correct, total, xpGained, breakdown, xp, focusOnMount, onReview, children }: ResultProps) {
  const { level, current, needed } = levelProgress(xp);
  const leveledUp = levelFromXp(xp - xpGained) < level;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 방금 풀이를 마쳤으면 제목으로 포커스를 옮겨 스크린리더가 결과를 읽게 한다.
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <section className="card" aria-labelledby="result-heading">
      <h2 id="result-heading" className="prompt" tabIndex={-1} ref={headingRef}>
        오늘 학습을 마쳤어요
      </h2>
      <dl className="stats">
        <div>
          <dt className="sub">맞힌 문제</dt>
          <dd>
            <span aria-hidden="true">
              {correct} / {total}
            </span>
            <span className="sr-only">
              {total}문제 중 {correct}문제
            </span>
          </dd>
        </div>
        <div>
          <dt className="sub">획득 XP</dt>
          <dd>+{xpGained}</dd>
        </div>
      </dl>
      {breakdown && <p className="sub breakdown">{breakdown}</p>}
      <div className="result-meaning">
        {leveledUp && (
          <p className="level-up">
            Lv.{level}이 됐어요. 레벨이 오르면 조금 더 어려운 문제가 섞여 나와요.
          </p>
        )}
        <p>다음 레벨까지 {needed - current} XP 남았어요.</p>
      </div>
      {onReview && (
        <button type="button" className="btn" onClick={onReview}>
          오늘 문제 다시 보기
        </button>
      )}
      {children}
      <p className="sub next-day">
        XP는 정답 1개에 10, 오늘 목표를 마치면 5를 더 받아요. 새 문제는 내일 열려요.
      </p>
    </section>
  );
}

/** 서버 모드에서 오늘 문제를 불러온 상태. key는 날짜와 맞춤 설정이다(바뀌면 다시 불러온다). */
type SyncState = { key: string; status: 'loading' | 'ready' | 'error'; message: string };

export default function DailyChallenge() {
  const [progress, setProgress] = useState<Progress | null>(null);
  // 기기 모드: 번들의 문제 은행. 서버 모드: null이고 서버에서 받은 문제(cache)를 쓴다.
  const [bank, setBank] = useState<Question[] | null>(null);
  const [cache, setCache] = useState<QuestionCache>({});
  const [today, setToday] = useState('');
  const [finishedNow, setFinishedNow] = useState(false);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [theme, setTheme] = useTheme();
  const { view, go } = useView();
  const pool = useMemo(() => bank ?? cachedQuestions(cache), [bank, cache]);

  const update = useCallback((next: Progress) => {
    setProgress(next);
    void saveProgress(next);
  }, []);

  // 서버 모드: 응답을 기다리는 사이 상태가 바뀌었을 수 있어, 응답은 가장 최근 상태에 반영한다.
  const latest = useRef({ progress, cache });
  latest.current = { progress, cache };
  const commit = useCallback(
    (next: Progress, nextCache: QuestionCache) => {
      latest.current = { progress: next, cache: nextCache };
      update(next);
      setCache(nextCache);
      void saveValue(QUESTION_CACHE_KEY, JSON.stringify(nextCache));
    },
    [update],
  );

  // 서버 모드: 날짜·맞춤 설정이 정해지면 오늘 문제를 서버에서 받는다. 처음 한 번은 기기 기록을 먼저 옮긴다.
  const syncKey = SERVER_MODE && progress?.profile && today ? `${today}|${JSON.stringify(progress.profile)}` : null;
  const syncKeyRef = useRef(syncKey);
  syncKeyRef.current = syncKey;
  const syncToday = useCallback(
    async (key: string, date: string) => {
      setSync({ key, status: 'loading', message: '' });
      try {
        const start = latest.current.progress;
        if (!start?.profile) return;
        await importOnce(start);
        const res = await fetchToday(date, start.profile);
        // 기다리는 사이 날짜나 설정이 또 바뀌었으면 이 응답은 버린다.
        const { progress: p, cache: c } = latest.current;
        if (syncKeyRef.current !== key || !p) return;
        const applied = applyToday(p, c, res);
        commit(applied.progress, applied.cache);
        setSync({ key, status: 'ready', message: '' });
      } catch (e) {
        setSync({ key, status: 'error', message: e instanceof ApiError ? e.message : '오늘 문제를 불러오지 못했어요.' });
      }
    },
    [commit],
  );
  useEffect(() => {
    if (syncKey && sync?.key !== syncKey) void syncToday(syncKey, today);
  }, [syncKey, sync?.key, syncToday, today]);

  // 처음 열 때, 그리고 화면으로 돌아올 때마다 날짜를 다시 확인한다. 자정을 넘겨 열어 둔 경우를 위해서다.
  useEffect(() => {
    let cancelled = false;
    const refreshDate = () => {
      void todayKey(dateKey).then((key) => {
        if (!cancelled) setToday(key);
      });
    };
    // 진행 상황을 지금 토스 사용자 식별키와 맞춘 뒤에 쓴다. 키가 바뀌었으면 저장도 한다.
    // 틀린 문제 기능이 생기기 전에 푼 기록이 있으면 처음 한 번만 틀린 문제로 옮긴다.
    void Promise.all([
      loadProgress(),
      loadUserKey(),
      loadValue(WRONG_BACKFILL_KEY),
      SERVER_MODE ? Promise.resolve(null) : loadLocalBank(),
      SERVER_MODE ? loadValue(QUESTION_CACHE_KEY).then(parseQuestionCache) : Promise.resolve({}),
    ]).then(([loaded, userKey, backfilled, localBank, savedCache]) => {
      if (cancelled) return;
      const bound = bindUser(loaded, userKey);
      // 다른 토스 사용자로 바뀌었으면 앞 사용자가 받은 문제도 쓰지 않는다.
      const startCache = loaded.userKey !== null && bound.userKey !== loaded.userKey ? {} : savedCache;
      const next = backfilled === null ? backfillWrong(bound, localBank ?? cachedQuestions(startCache)) : bound;
      setBank(localBank);
      setCache(startCache);
      setProgress(next);
      if (next !== loaded) void saveProgress(next);
      if (backfilled === null) void saveValue(WRONG_BACKFILL_KEY, 'done');
    });
    refreshDate();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // 기기 모드: 오늘 아직 완료하지 않았으면 오늘의 문제를 고정한다. 학습 목적을 고르기 전에는 고정하지 않는다.
  useEffect(() => {
    if (!bank || !progress || !today || progress.today?.date === today || progress.profile === null) return;
    const started = startAttempt(progress, bank, today);
    if (started !== progress) update(started);
  }, [bank, progress, today, update]);

  // 다른 화면에서 홈으로 돌아오면 제목으로 포커스를 옮긴다. 처음 열 때는 옮기지 않는다.
  const homeHeadingRef = useRef<HTMLHeadingElement>(null);
  const visitedOther = useRef(false);
  useEffect(() => {
    void trackScreen(view);
    if (view !== 'home') {
      visitedOther.current = true;
      setFinishedNow(false);
    } else if (visitedOther.current) {
      homeHeadingRef.current?.focus();
    }
  }, [view]);

  if (!progress || !today || !theme) {
    return (
      <p className="sr-only" role="status">
        불러오는 중
      </p>
    );
  }

  const current = progress;
  const done = current.today?.date === today ? current.today : null;
  const attempt = current.attempt?.date === today ? current.attempt : null;
  const questions = attempt ? attemptQuestions(attempt, pool) : null;

  /**
   * 서버 모드에서 채점·완료를 보낸다. 서버와 기기 기록이 어긋났으면(이미 답함 등, 409) 서버 기록으로 다시 맞춘다.
   * 실패하면 이유를 보여 주고 다시 누를 수 있게 둔다.
   */
  async function remote(work: () => Promise<void>, failMessage: string) {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && syncKey) void syncToday(syncKey, today);
      setActionError(e instanceof ApiError && e.status === 0 ? e.message : failMessage);
    } finally {
      setBusy(false);
    }
  }

  /** 서버 모드: 답을 채점받고, 받은 정답·해설로 기기 기록(답, 틀린 문제)을 맞춘다. */
  function answerRemote(kind: SetKind, index: number, choice: number) {
    const ids = kind === 'daily' ? attempt?.ids : todaysBonus(current, today).find((b) => b.source === kind)?.ids;
    const id = ids?.[index];
    if (id === undefined) return;
    void remote(async () => {
      const graded = await submitAnswer(today, kind, id, choice);
      const { progress: p, cache: c } = latest.current;
      if (!p || !c[id]) return;
      const nextCache = withGraded(c, c[id], graded);
      const recorded = kind === 'daily' ? recordPick(p, index, choice) : recordBonusPick(p, today, kind, index, choice);
      commit(recorded === p ? p : noteAnswer(recorded, nextCache[id], choice, today), nextCache);
    }, '채점하지 못했어요. 보기를 다시 골라 주세요.');
  }

  function finish() {
    if (!attempt || !questions) return;
    if (SERVER_MODE) {
      void remote(async () => {
        const { result, me } = await completeSet(today, 'daily');
        const p = latest.current.progress!;
        setFinishedNow(true);
        commit({ ...p, xp: me.xp, streak: me.streak, lastDate: me.lastDate, today: { date: today, ...result } }, latest.current.cache);
        void track('daily_complete', { correct: result.correct, total: result.total, level: me.level, streak: me.streak });
        if (shouldAskReview(me.streak, result.correct)) void requestReview();
      }, '결과를 저장하지 못했어요. 다시 눌러 주세요.');
      return;
    }
    setFinishedNow(true);
    const correct = countCorrect(questions, attempt.picks);
    const next = completeDay(current, today, correct, questions.length);
    update(next);
    void track('daily_complete', { correct, total: questions.length, level: levelFromXp(next.xp), streak: next.streak });
    // 만족도가 높을 순간에만 리뷰를 부탁한다. 노출 여부와 상관없이 흐름은 그대로다.
    if (shouldAskReview(next.streak, correct)) void requestReview();
  }

  const bonusToday = todaysBonus(current, today);
  const activeBonus = done ? (bonusToday.find((b) => b.result === null) ?? null) : null;
  const activeBonusQuestions = activeBonus ? bonusQuestions(activeBonus, pool) : null;
  const bonusDone = bonusToday.flatMap((b) => (b.result ? [{ source: b.source, result: b.result }] : []));

  // 답을 기록하고 틀린 문제 목록도 맞춘다. 이미 답한 문제(기록이 안 바뀐 경우)는 건너뛴다.
  const answer = (recorded: Progress, question: Question, choice: number) => {
    if (recorded !== current) update(noteAnswer(recorded, question, choice, today));
  };

  // 처음 들어왔을 때(이전 버전 사용자 포함) 목적과 실력을 묻는다. 오늘 문제를 풀기 시작했으면 묻지 않는다.
  const needsProfile = current.profile === null && !done && !(attempt && attempt.picks.length > 0);

  const saveProfile = (profile: StudyProfile, from: 'onboarding' | 'settings') => {
    // 서버 모드는 설정만 바꾸고, 바뀐 설정으로 오늘 문제를 다시 받으면 서버가 다시 고른다(syncToday).
    update(SERVER_MODE ? { ...current, profile } : setStudyProfile(current, profile, pool, today));
    void track('study_profile_set', {
      reason: profile.reason,
      career_focus: profile.careerFocus ?? 'none',
      self_level: profile.selfLevel,
      daily_goal: profile.dailyGoal,
      from,
    });
  };

  const toggleSave = (questionId: number, kind: SavedKind) => {
    if (!isSaved(current, questionId, kind)) void track('item_save', { kind });
    update(toggleSaved(current, questionId, kind, new Date()));
  };

  if (view === 'saved') {
    return <SavedView progress={current} questions={pool} onRemove={toggleSave} />;
  }

  if (view === 'wrong') {
    return (
      <WrongView
        entries={wrongEntries(current, pool)}
        onRetry={(question, pick) => void track('wrong_retry', { correct: pick === question.answer })}
        onRemove={(ids) => update(ids.reduce(removeWrong, current))}
      />
    );
  }

  if (view === 'review' && done && attempt && questions) {
    const groups: ReviewGroup[] = [
      { id: 'daily', title: '오늘의 문제', questions, picks: attempt.picks },
      ...bonusToday.map((b) => ({
        id: b.source,
        title: BONUS_TITLE[b.source],
        questions: bonusQuestions(b, pool) ?? [],
        picks: b.picks,
      })),
    ];
    return (
      <TodayReview
        groups={groups}
        isSaved={(questionId, kind) => isSaved(current, questionId, kind)}
        onToggleSave={toggleSave}
      />
    );
  }

  if (view === 'settings' || view.startsWith('settings_')) {
    return (
      <SettingsView
        key={view}
        section={view === 'settings' ? null : (view.slice('settings_'.length) as SettingsSection)}
        onOpen={(section) => go(`settings_${section}`)}
        progress={current}
        onSaveNickname={(name) => update(setNickname(current, name))}
        onSaveStudyProfile={(profile) => saveProfile(profile, 'settings')}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  return (
    <>
      <h1 tabIndex={-1} ref={homeHeadingRef}>
        하루 영어 한 입
      </h1>
      <p className="sub">하루 {dailyGoalOf(current)}문제로 영어 한 입</p>
      <LevelCard progress={current} streak={visibleStreak(current, today)} />
      {done && activeBonus && activeBonusQuestions ? (
        <Quiz
          key={`${activeBonus.date}-${activeBonus.source}`}
          label="보너스"
          autoFocus
          questions={activeBonusQuestions}
          picks={activeBonus.picks}
          onPick={(index, choice) =>
            SERVER_MODE
              ? answerRemote(activeBonus.source, index, choice)
              : answer(recordBonusPick(current, today, activeBonus.source, index, choice), activeBonusQuestions[index], choice)
          }
          onFinish={() => {
            if (SERVER_MODE) {
              void remote(async () => {
                const { result, me } = await completeSet(today, activeBonus.source);
                const p = latest.current.progress!;
                const bonus = p.bonus.map((b) => (b.date === today && b.source === activeBonus.source ? { ...b, result } : b));
                commit({ ...p, bonus, xp: me.xp }, latest.current.cache);
                void track('bonus_complete', { source: activeBonus.source, correct: result.correct });
                setFinishedNow(true);
              }, '결과를 저장하지 못했어요. 다시 눌러 주세요.');
              return;
            }
            const correct = countCorrect(activeBonusQuestions, activeBonus.picks);
            update(completeBonus(current, today, activeBonus.source, correct));
            void track('bonus_complete', { source: activeBonus.source, correct });
            // 합친 결과 카드로 돌아오면 제목으로 포커스를 옮긴다.
            setFinishedNow(true);
          }}
          isSaved={(questionId, kind) => isSaved(current, questionId, kind)}
          onToggleSave={toggleSave}
          busy={SERVER_MODE ? busy : undefined}
          error={actionError}
        />
      ) : done ? (
        <Result
          correct={done.correct + bonusDone.reduce((n, b) => n + b.result.correct, 0)}
          total={done.total + bonusDone.reduce((n, b) => n + b.result.total, 0)}
          xpGained={done.xpGained + bonusDone.reduce((n, b) => n + b.result.xpGained, 0)}
          breakdown={
            bonusDone.length > 0
              ? [`오늘의 문제 ${done.correct}/${done.total}`, ...bonusDone.map((b) => `보너스(${BONUS_SOURCE[b.source]}) ${b.result.correct}/${b.result.total}`)].join(' · ')
              : null
          }
          xp={current.xp}
          focusOnMount={finishedNow}
          onReview={attempt && questions ? () => go('review') : null}
        >
          <BonusSection
            sets={bonusToday}
            onGrant={async (source) => {
              if (SERVER_MODE) {
                try {
                  const set = await openBonus(today, source);
                  const { progress: p, cache: c } = latest.current;
                  commit(withBonus(p!, today, set), withSet(c, set));
                } catch {
                  return false;
                }
              } else {
                update(grantBonus(current, pool, today, source));
              }
              void track('bonus_open', { source });
              return true;
            }}
          />
        </Result>
      ) : needsProfile ? (
        <section className="card" aria-labelledby="onboarding-heading">
          <p id="onboarding-heading" className="greeting">
            맞춤 문제를 골라 드릴게요
          </p>
          <p className="sub">보기를 누르면 다음 질문으로 넘어가요. 설정에서 언제든 바꿀 수 있어요.</p>
          <StudyWizard
            initial={null}
            onComplete={(profile) => {
              setJustOnboarded(true);
              saveProfile(profile, 'onboarding');
            }}
          />
        </section>
      ) : attempt && questions ? (
        <Quiz
          key={attempt.date}
          autoFocus={justOnboarded}
          questions={questions}
          picks={attempt.picks}
          onPick={(index, choice) =>
            SERVER_MODE ? answerRemote('daily', index, choice) : answer(recordPick(current, index, choice), questions[index], choice)
          }
          onFinish={finish}
          isSaved={(questionId, kind) => isSaved(current, questionId, kind)}
          onToggleSave={toggleSave}
          busy={SERVER_MODE ? busy : undefined}
          error={actionError}
        />
      ) : SERVER_MODE ? (
        <section className="card" aria-label="오늘의 문제">
          {sync?.status === 'error' ? (
            <>
              <p className="error" role="alert">
                {sync.message}
              </p>
              <button type="button" className="btn" onClick={() => syncKey && void syncToday(syncKey, today)}>
                다시 시도
              </button>
            </>
          ) : (
            <p className="sub" role="status">
              오늘 문제를 불러오는 중이에요
            </p>
          )}
        </section>
      ) : null}
      {/* 오늘의 문제를 먼저 보여 주고, 메뉴는 그 아래에 둔다 (첫 화면에서 할 일이 바로 보이게). */}
      <nav className="home-nav" aria-label="메뉴">
        <button type="button" className="small-btn" onClick={() => go('wrong')}>
          틀린 문제 {current.wrong.length}개
        </button>
        <button type="button" className="small-btn" onClick={() => go('saved')}>
          다시 볼 항목 {current.saved.length}개
        </button>
        <button type="button" className="small-btn" onClick={() => go('settings')}>
          설정
        </button>
      </nav>
      <BannerAd dark={theme === 'dark'} />
    </>
  );
}
