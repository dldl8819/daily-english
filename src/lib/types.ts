export type Category = 'dev' | 'office' | 'study' | 'toeic' | 'daily';

/** 영어를 배우는 이유. 이유(와 경력 개발이면 쓰는 곳)에 따라 나오는 분류가 다르다 (study.ts profileCategories). */
export type Reason = 'communication' | 'career' | 'hobby' | 'travel' | 'study';

/** 경력 개발일 때 영어를 쓰는 곳 */
export type CareerFocus = 'dev' | 'office' | 'toeic';

/** 스스로 고른 영어 실력. 시작 난이도만 올리고 XP·레벨은 바꾸지 않는다. */
export type SelfLevel = 1 | 2 | 3;

/** 하루 목표 문제 수. 이만큼 풀어야 오늘 학습을 마친다. */
export type DailyGoal = 5 | 10 | 15 | 20;

/** 처음 들어올 때 고르는 맞춤 문제 설정 */
export type StudyProfile = {
  reason: Reason;
  /** 경력 개발일 때만 값이 있다 */
  careerFocus: CareerFocus | null;
  selfLevel: SelfLevel;
  dailyGoal: DailyGoal;
};
export type Difficulty = 1 | 2 | 3;

export type Question = {
  id: number;
  category: Category;
  difficulty: Difficulty;
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
  /** 정답을 채운 문장의 한국어 해석. 정답을 알려 주므로 답한 뒤에만 보여 준다. 아직 없는 문항도 있다. */
  translation?: string;
};

export type TodayResult = {
  date: string;
  correct: number;
  total: number;
  xpGained: number;
};

/** 하루를 시작할 때 고정한 문제와, 지금까지 고른 답 */
export type Attempt = {
  date: string;
  ids: number[];
  picks: number[];
  /** ids 중 고를 때 이미 본 적 있던 문제(복습). 새 문제를 다 본 뒤에만 생긴다. */
  review: number[];
};

/** 보너스 문제를 여는 방법. 방법마다 하루 한 번이다. */
export type BonusSource = 'share' | 'ad';

/** 보너스 5문제. 오늘 학습을 마친 뒤에만 열 수 있고, 그날 것만 남긴다. */
export type BonusSet = {
  date: string;
  source: BonusSource;
  ids: number[];
  picks: number[];
  result: { correct: number; total: number; xpGained: number } | null;
  /** ids 중 복습 문제 */
  review: number[];
};

export type Progress = {
  xp: number;
  streak: number;
  lastDate: string | null;
  today: TodayResult | null;
  attempt: Attempt | null;
  /** 한 번이라도 출제된 문제 ID. 안 본 문제를 먼저 내는 데 쓴다. */
  seen: number[];
  /** 앱인토스 사용자 식별키(User.getAnonymousKey의 hash). 토스 앱 밖이거나 받지 못했으면 null */
  userKey: string | null;
  /** 사용자가 정한 닉네임. 본인 화면에만 보인다. */
  nickname: string | null;
  /** 다시 볼 문장·단어 */
  saved: SavedItem[];
  /** 오늘 연 보너스 문제 */
  bonus: BonusSet[];
  /** 맞춤 문제 설정. 고르기 전(첫 실행, 이전 버전 사용자)에는 null */
  profile: StudyProfile | null;
  /** 틀린 문제. 최근 것부터. 다시 맞히면 빠진다. */
  wrong: WrongItem[];
  /** 문제마다 마지막으로 답한 날짜와 결과. 새 문제를 다 본 뒤 복습 순서(틀린 것, 오래된 것 먼저)를 정한다. 키는 문제 ID. */
  history: Record<string, AnswerRecord>;
};

export type AnswerRecord = {
  date: string;
  correct: boolean;
};

export type WrongItem = {
  questionId: number;
  /** 틀렸을 때 고른 보기 */
  pick: number;
  date: string;
};

/** sentence: 정답을 채운 문장, word: 정답 단어·표현 */
export type SavedKind = 'sentence' | 'word';

export type SavedItem = {
  questionId: number;
  kind: SavedKind;
  savedAt: string;
};
