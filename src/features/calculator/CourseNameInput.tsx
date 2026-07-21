// src/features/calculator/CourseNameInput.tsx
//
// Phase 5C: the course-name field as an accessible WAI-ARIA combobox, replacing
// the legacy suggestions.js portal. Like the legacy flow it does NOT commit to
// shared state on every keystroke — it holds local text and shows ranked
// suggestions, then commits on pick (fills name + credits) or on blur
// (resolveExactCourse snaps a typed value to a catalog course, else keeps free
// text). All suggestion state (open / active option) is component-local UI state:
// it never enters the calculator's academic state.
//
// Accessibility: implements the combobox/listbox pattern. The input is
// role="combobox" with aria-autocomplete="list", aria-expanded, aria-controls and
// aria-activedescendant; the popup is role="listbox"; each result is role="option"
// with a stable id and aria-selected. Keyboard: ArrowDown/Up move the active
// option (no wrap — stops at the ends), Enter selects the active option (and is
// swallowed so it never submits a surrounding form), Escape closes and clears the
// active option without erasing the input, Tab leaves focus handling to the
// browser. Mouse selection uses mousedown (not click) so it fires before the
// input's blur closes the popup.

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { prepareCatalog, resolveExactCourse, searchCoursesRanked } from './courseSearch';
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

export default function CourseNameInput({
  id,
  value,
  catalog,
  onPick,
  onResolve,
}: CourseNameInputProps) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The deferred blur commit below must call the LATEST resolve handler:
  // parents build onResolve as a closure over their current semester list, so
  // when another commit lands inside the defer window (e.g. the grade-point
  // onChange right after picking a course) the closure this timer captured is
  // stale — firing it would replace shared state with a pre-commit snapshot,
  // silently reverting that edit (#320).
  const onResolveRef = useRef(onResolve);
  useEffect(() => {
    onResolveRef.current = onResolve;
  }, [onResolve]);

  // Prepare the searchable view once per catalog identity (not per keystroke):
  // pre-lowercases ~850 codes/titles so typing stays responsive.
  const prepared = useMemo(() => prepareCatalog(catalog), [catalog]);

  // Stable ids for the listbox + its options (aria-controls / aria-activedescendant).
  const listboxId = `${useId()}-listbox`;
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  // Reflect external changes to the committed name (pick, reset, demo load).
  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const isOpen = open && suggestions.length > 0;

  function onChange(next: string) {
    setText(next);
    const matches = searchCoursesRanked(prepared, next).map((r) => r.course);
    setSuggestions(matches);
    setActiveIndex(-1);
    setOpen(matches.length > 0);
  }

  function choose(course: CourseSuggestion) {
    setText(course.full);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    onPick(course);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // Close + drop the active option; keep the typed text intact.
      if (open) e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Only act on an explicit active option; never submit a surrounding form.
      if (activeIndex >= 0) {
        e.preventDefault();
        choose(suggestions[activeIndex]);
      }
    }
    // Tab and everything else fall through to default browser handling.
  }

  function onBlur() {
    // Defer so a suggestion mousedown registers before we close + commit.
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setActiveIndex(-1);
      onResolveRef.current(resolveExactCourse(text, catalog), text);
    }, 150);
  }

  return (
    <>
      <input
        type="text"
        placeholder="Type course code / title"
        id={id}
        value={text}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {isOpen && (
        <div
          className="course-suggestions"
          id={listboxId}
          role="listbox"
          aria-label="Course suggestions"
          style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 50 }}
        >
          {suggestions.map((c, i) => (
            <div
              key={c.code}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={`suggestion-item${i === activeIndex ? ' active' : ''}`}
              // mousedown (not click) so it fires before the input blur closes us;
              // preventDefault keeps focus on the input (no blur/refocus flicker).
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
