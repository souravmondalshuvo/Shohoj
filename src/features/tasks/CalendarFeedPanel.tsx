// src/features/tasks/CalendarFeedPanel.tsx
//
// Subscribing a calendar to Shohoj (#744).
//
// The download beside this is a snapshot: a calendar that imported it never
// learns about a deadline that moves. This is the live version — and the whole
// difference is a URL that works without the student being signed in, which is
// exactly what makes it worth being careful about.
//
// THE WARNING COMES FIRST
//
// Anyone holding the link can read this student's deadlines, for as long as it
// is valid. That is the actual payload — task titles, course codes, the shape
// of their term — not metadata. So the panel says so BEFORE it will produce a
// URL, and the button that creates one is the student's decision rather than
// something that happened while they were looking at a calendar.
//
// Revocation lives in the same place as the link, because a student who needs
// it is a student who has just realised the link escaped, and that is the worst
// possible moment to go looking for a settings page.

import { useState } from 'react';

import type { CalendarFeedState } from './useCalendarFeed.ts';

export interface CalendarFeedPanelProps {
  readonly state: CalendarFeedState;
}

export function CalendarFeedPanel({ state }: CalendarFeedPanelProps) {
  const { feed, loading, busy, error, create, revoke } = state;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (feed === null) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
      // The input is selectable either way, so a clipboard the browser refuses
      // costs the student nothing but this acknowledgement.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <section className="tasks-feed" data-testid="tasks-feed" aria-busy="true">
        <p className="shell-muted">Checking…</p>
      </section>
    );
  }

  return (
    <section className="tasks-feed" data-testid="tasks-feed" aria-label="Calendar subscription">
      <h3 className="tasks-feed-title">Subscribe in your calendar</h3>

      {feed === null ? (
        <>
          <p className="tasks-feed-copy shell-muted">
            A subscription keeps your deadlines up to date in Google Calendar, Apple Calendar or
            Outlook — unlike the download, which is a snapshot.
          </p>
          <p className="tasks-feed-warning" data-testid="tasks-feed-warning">
            The link works without signing in, so{' '}
            <strong>anyone who has it can read your deadlines</strong> — the titles, the courses,
            the dates. Keep it to yourself, and replace it if it gets out.
          </p>
          <button
            type="button"
            className="tasks-feed-create"
            data-testid="tasks-feed-create"
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? 'Creating…' : 'Create a subscription link'}
          </button>
        </>
      ) : (
        <>
          <label className="tasks-field tasks-field-grow" htmlFor="tasks-feed-url">
            <span className="tasks-label">Your link</span>
            <input
              id="tasks-feed-url"
              className="tasks-input tasks-feed-url"
              data-testid="tasks-feed-url"
              value={feed.url}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>

          <p className="tasks-feed-copy shell-muted">
            Add it in your calendar app as a subscription — in Google Calendar that is{' '}
            <em>Other calendars → From URL</em>. Calendars refresh on their own schedule, so a
            change in Shohoj can take a few hours to appear.
          </p>

          <p className="tasks-feed-warning" data-testid="tasks-feed-warning">
            <strong>Anyone with this link can read your deadlines.</strong> Replacing it makes the
            old one stop working straight away.
          </p>

          <div className="tasks-feed-actions">
            <button type="button" className="tasks-feed-copy-btn" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              className="tasks-feed-rotate"
              data-testid="tasks-feed-rotate"
              disabled={busy}
              onClick={() => void create()}
            >
              Replace link
            </button>
            <button
              type="button"
              className="tasks-feed-revoke"
              data-testid="tasks-feed-revoke"
              disabled={busy}
              onClick={() => void revoke()}
            >
              Turn off
            </button>
          </div>
        </>
      )}

      {error !== null && (
        <p className="tasks-feed-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
