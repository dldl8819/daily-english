import type { CareerFocus, Category, DailyGoal, Progress, Reason, SelfLevel, StudyProfile } from './types';
import { levelFromXp } from './level';

export const CATEGORY_LABEL: Record<Category, string> = {
  dev: '개발자 영어',
  office: '직장 영어',
  study: '학교 영어',
  toeic: '토익 대비',
  daily: '일상 영어',
};

export const DIFFICULTY_LABEL = { 1: '기초', 2: '중급', 3: '심화' } as const;

type Option<T> = { value: T; label: string; description: string };

export const REASONS: Option<Reason>[] = [
  { value: 'communication', label: '소통', description: '외국인과 대화하고 메시지를 주고받아요' },
  { value: 'career', label: '경력 개발', description: '업무, 이직, 자격증에 필요해요' },
  { value: 'hobby', label: '취미', description: '재미로 꾸준히 배우고 싶어요' },
  { value: 'travel', label: '여행', description: '여행지에서 쓰는 표현을 익히고 싶어요' },
  { value: 'study', label: '학업', description: '수업, 시험, 유학을 준비해요' },
];

export const CAREER_FOCUSES: Option<CareerFocus>[] = [
  { value: 'dev', label: '개발 업무', description: '코드 리뷰, 개발 회의, 기술 문서' },
  { value: 'office', label: '일반 업무', description: '이메일, 회의, 보고' },
  { value: 'toeic', label: '토익 점수', description: '토익 문법·어휘 문제' },
];

export const SELF_LEVELS: Option<SelfLevel>[] = [
  { value: 1, label: '기초부터', description: '쉬운 문제부터 시작해요' },
  { value: 2, label: '어느 정도', description: '중급 문제를 섞어서 시작해요' },
  { value: 3, label: '자신 있어요', description: '어려운 문제를 많이 섞어서 시작해요' },
];

export const DAILY_GOALS: Option<DailyGoal>[] = [
  { value: 5, label: '5문제', description: '1~2분' },
  { value: 10, label: '10문제', description: '3~4분' },
  { value: 15, label: '15문제', description: '5~6분' },
  { value: 20, label: '20문제', description: '7~8분' },
];

export const DEFAULT_DAILY_GOAL: DailyGoal = 5;

/**
 * 맞춤 문제 설정마다 나오는 분류. 분류가 둘이면 하루 문제를 번갈아 낸다.
 * 설정 전(이전 버전 사용자)에는 처음 출시 때처럼 개발자 영어와 일상 영어를 낸다.
 */
export function profileCategories(profile: Pick<StudyProfile, 'reason' | 'careerFocus'> | null): Category[] {
  switch (profile?.reason) {
    case 'communication':
      return ['daily', 'office'];
    case 'career':
      if (profile.careerFocus === 'dev') return ['dev', 'office'];
      if (profile.careerFocus === 'toeic') return ['toeic', 'office'];
      return ['office', 'daily'];
    case 'hobby':
    case 'travel':
      return ['daily'];
    case 'study':
      return ['study', 'toeic'];
    default:
      return ['dev', 'daily'];
  }
}

/** 설정 메뉴 등에 보여 줄 한 줄 요약. 예: "경력 개발(토익 점수) · 어느 정도 · 하루 10문제" */
export function profileSummary(profile: StudyProfile): string {
  const reason = REASONS.find((r) => r.value === profile.reason)!.label;
  const focus = CAREER_FOCUSES.find((f) => f.value === profile.careerFocus)?.label;
  const level = SELF_LEVELS.find((l) => l.value === profile.selfLevel)!.label;
  return `${focus ? `${reason}(${focus})` : reason} · ${level} · 하루 ${profile.dailyGoal}문제`;
}

/** 스스로 고른 실력에 맞춘 시작 레벨. difficultyMix의 구간(1~2, 3~4, 5~7)에 맞췄다. */
const START_LEVEL: Record<SelfLevel, number> = { 1: 1, 2: 3, 3: 5 };

/** 문제 난이도를 정할 때 쓰는 레벨. XP 레벨과 시작 레벨 중 높은 쪽이다. */
export function studyLevel(progress: Pick<Progress, 'xp' | 'profile'>): number {
  const start = progress.profile ? START_LEVEL[progress.profile.selfLevel] : 1;
  return Math.max(levelFromXp(progress.xp), start);
}

/** 하루 목표 문제 수. 설정 전에는 5문제다. */
export function dailyGoalOf(progress: Pick<Progress, 'profile'>): DailyGoal {
  return progress.profile?.dailyGoal ?? DEFAULT_DAILY_GOAL;
}
