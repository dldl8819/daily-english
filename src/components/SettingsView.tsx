'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Progress, StudyProfile } from '@/lib/types';
import { levelFromXp } from '@/lib/level';
import { NICKNAME_MAX, checkNickname } from '@/lib/profile';
import { type ReminderResult, type ReminderState, loadReminder, reminderTemplateCode, requestReminder } from '@/lib/reminder';
import { profileSummary } from '@/lib/study';
import { THEMES, type Theme } from '@/lib/theme';
import ReminderSection from './ReminderSection';
import StudyWizard from './StudyWizard';
import ThemePicker from './ThemePicker';

/** 설정 안의 세부 화면. null이면 메뉴다. */
export type SettingsSection = 'profile' | 'study' | 'display' | 'reminder';

const SECTION_TITLE: Record<SettingsSection, string> = {
  profile: '프로필 설정',
  study: '맞춤 문제 설정',
  display: '화면 설정',
  reminder: '학습 알림 설정',
};

type Props = {
  section: SettingsSection | null;
  progress: Progress;
  onOpen: (section: SettingsSection) => void;
  onSaveNickname: (nickname: string) => void;
  onSaveStudyProfile: (profile: StudyProfile) => void;
  theme: Theme;
  onThemeChange: (next: Theme) => void;
};

/** 설정: 메뉴(프로필, 맞춤 문제, 화면, 학습 알림)와 각 세부 화면 */
export default function SettingsView({ section, ...props }: Props) {
  return section ? <SettingsDetail section={section} {...props} /> : <SettingsMenu {...props} />;
}

function SettingsMenu({ progress, theme, onOpen }: Omit<Props, 'section'>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const items: { section: SettingsSection; summary: string }[] = [
    { section: 'profile', summary: `${progress.nickname ?? '닉네임 없음'} · Lv.${levelFromXp(progress.xp)}` },
    { section: 'study', summary: progress.profile ? profileSummary(progress.profile) : '아직 고르지 않았어요' },
    { section: 'display', summary: THEMES.find((t) => t.value === theme)?.label ?? '' },
  ];
  // 학습 알림: 발송 코드가 설정돼 있을 때만 보인다 (정기 발송 템플릿은 출시 후에 만들 수 있다).
  if (reminderTemplateCode()) items.push({ section: 'reminder', summary: '매일 저녁 학습 알림' });

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        설정
      </h1>
      <ul className="settings-menu">
        {items.map((item) => (
          <li key={item.section}>
            <button type="button" className="settings-item" onClick={() => onOpen(item.section)}>
              <strong>{SECTION_TITLE[item.section]}</strong>
              <span className="sub">{item.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function SettingsDetail({ section, ...props }: Omit<Props, 'onOpen'> & { section: SettingsSection }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        {SECTION_TITLE[section]}
      </h1>
      {section === 'profile' && <ProfileSettings progress={props.progress} onSaveNickname={props.onSaveNickname} />}
      {section === 'study' && <StudySettings progress={props.progress} onSave={props.onSaveStudyProfile} />}
      {section === 'display' && (
        <section className="card" aria-label="화면 모드">
          <p className="sub">눈부심이 있으면 어둡게, 글자가 흐리게 보이면 고대비를 골라 보세요.</p>
          <ThemePicker theme={props.theme} onChange={props.onThemeChange} />
        </section>
      )}
      {section === 'reminder' && <ReminderSettings />}
    </>
  );
}

function ProfileSettings({ progress, onSaveNickname }: Pick<Props, 'progress' | 'onSaveNickname'>) {
  const [draft, setDraft] = useState(progress.nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  // 저장된 닉네임과 같으면(앞뒤·연속 공백 차이 포함) 저장 버튼을 비활성으로 둔다.
  const changed = draft.trim().replace(/\s+/g, ' ') !== (progress.nickname ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    const result = checkNickname(draft);
    if (!result.ok) {
      setError(result.error);
      setSavedMessage('');
      return;
    }
    setError(null);
    setDraft(result.value);
    onSaveNickname(result.value);
    setSavedMessage('닉네임을 저장했어요.');
  }

  return (
    <section className="card" aria-label="프로필">
      <p className="sub">현재 레벨: Lv.{levelFromXp(progress.xp)}</p>
      <form onSubmit={submit} noValidate className="nickname-form">
        <label htmlFor={inputId}>닉네임</label>
        <input
          id={inputId}
          type="text"
          value={draft}
          maxLength={NICKNAME_MAX + 5}
          autoComplete="nickname"
          onChange={(e) => {
            setDraft(e.target.value);
            setSavedMessage('');
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        />
        <p id={hintId} className="sub">
          한글·영문·숫자 2~{NICKNAME_MAX}자. 나에게만 보여요.
        </p>
        {error && (
          <p id={errorId} className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" aria-disabled={!changed}>
          저장
        </button>
        <p className="sub" role="status">
          {savedMessage}
        </p>
      </form>
    </section>
  );
}

function StudySettings({ progress, onSave }: { progress: Progress; onSave: Props['onSaveStudyProfile'] }) {
  const [message, setMessage] = useState('');
  return (
    <section className="card" aria-label="맞춤 문제">
      <p className="sub">오늘 문제를 아직 풀지 않았으면 바로 바뀌고, 풀기 시작했으면 내일부터 바뀌어요.</p>
      <StudyWizard
        initial={progress.profile}
        onComplete={(profile) => {
          onSave(profile);
          setMessage(`저장했어요. ${profileSummary(profile)}`);
        }}
      />
      <p className="sub" role="status">
        {message}
      </p>
    </section>
  );
}

function ReminderSettings() {
  const templateCode = reminderTemplateCode();
  const [reminder, setReminder] = useState<ReminderState>(null);
  useEffect(() => {
    if (!templateCode) return;
    let cancelled = false;
    void loadReminder().then((state) => {
      if (!cancelled) setReminder(state);
    });
    return () => {
      cancelled = true;
    };
  }, [templateCode]);

  async function requestDailyReminder(code: string): Promise<ReminderResult> {
    const result = await requestReminder(code);
    if (result === 'agreed') setReminder('agreed');
    return result;
  }

  return templateCode ? <ReminderSection state={reminder} onRequest={() => requestDailyReminder(templateCode)} /> : null;
}
