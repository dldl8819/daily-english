'use client';

import { THEMES, type Theme } from '@/lib/theme';

/** 기본 / 고대비 / 어둡게 중 하나를 고르는 라디오 묶음 */
export default function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (next: Theme) => void }) {
  return (
    <fieldset className="theme-picker">
      <legend className="sub">화면</legend>
      <div className="theme-options">
        {THEMES.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => onChange(option.value)}
              aria-describedby={`theme-${option.value}-desc`}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {THEMES.map((option) => (
        <span key={option.value} id={`theme-${option.value}-desc`} hidden>
          {option.description}
        </span>
      ))}
    </fieldset>
  );
}
