// src/features/calculator/CourseNameInput.tsx
//
// Phase 5B: the course-name field with autocomplete, replacing the legacy
// suggestions.js portal. Like the legacy flow it does NOT commit to shared state
// on every keystroke — it holds local text and shows ranked suggestions, then
// commits on pick (fills name + credits) or on blur (resolveExactCourse snaps a
// typed value to a catalog course, else keeps free text). Keyboard nav mirrors
// onCourseKey (Arrow/Enter/Escape).

import { useEffect, useRef, useState } from 'react';

import { resolveExactCourse, searchCourses } from './courseSearch';
import type { CourseSuggestion } from './courseSearch';

export interface CourseNameInputProps {
  readonly id: string;
  readonly value: string;
  readonly catalog: readonly CourseSuggestion[];
  /** A suggestion was chosen — fill name + credits. */
  readonly onPick: (course: CourseSuggestion) => void;
  /** Field blurred — commit the typed text (resolved to a catalog course if exact). */
  readonly onResolve: (course: CourseSuggestion | null, text: string) => void;
}

export default function CourseNameInput({ id, value, catalog, onPick, onResolve }: CourseNameInputProps) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect external changes to the committed name (pick, reset, demo load).
  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  function onChange(next: string) {
    setText(next);
    const matches = searchCourses(next, catalog);
    setSuggestions(matches);
    setActiveIndex(-1);
    setOpen(matches.length > 0);
  }

  function choose(course: CourseSuggestion) {
    setText(course.full);
    setOpen(false);
    setSuggestions([]);
    onPick(course);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function onBlur() {
    // Defer so a suggestion mousedown registers before we close + commit.
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      onResolve(resolveExactCourse(text, catalog), text);
    }, 150);
  }

  return (
    <>
      <input
        type="text"
        placeholder="Type course code / title"
        id={id}
        value={text}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {open && suggestions.length > 0 && (
        <div
          className="course-suggestions"
          style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 50 }}
        >
          {suggestions.map((c, i) => (
            <div
              key={c.code}
              className={`suggestion-item${i === activeIndex ? ' active' : ''}`}
              // mousedown (not click) so it fires before the input blur closes us.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
            >
              <span className="suggestion-code">{c.code}</span>
              <span className="suggestion-name">{c.name}</span>
              <span className="suggestion-credits">{c.credits} cr</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
