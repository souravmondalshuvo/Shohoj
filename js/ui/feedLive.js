// ── js/ui/feedLive.js ─────────────────────────────────────────────────────────
// Shared live poller for the Connect feed. One interval serves every
// subscriber (routine, seats, free rooms): while the page is visible it
// re-fetches every FEED_LIVE_POLL_MS (ETag-aware, so an unchanged feed is a
// cheap 304), and while hidden it pauses — unless a subscriber asked to keep
// going (seat watches), in which case it slows to FEED_LIVE_HIDDEN_MS.
//
// Subscribers receive the same materialized result `fetchConnectFeed`
// returns ({ sections, summary, source, fetchedAt, etag, dropped }) and apply
// it to their own stores. Manual per-tab refreshes call broadcastFeedResult
// so one fetch updates every tab instead of leaving the others stale.

import { fetchConnectFeed } from '../core/connectFeedClient.js';

export const FEED_LIVE_POLL_MS = 90_000;
export const FEED_LIVE_HIDDEN_MS = 5 * 60_000;

const _feedLive = {
  listeners: new Set(),
  timer: null,
  period: 0,        // current interval period (ms) so we only reset on change
  inFlight: false,  // guard against overlapping fetches on slow networks
  hiddenPolling: false, // keep polling while hidden (seat watches need this)
  lastAt: 0,        // last poll attempt — gates the foreground catch-up tick
};

// Subscribe to live feed updates. Returns an unsubscribe function. The first
// subscriber starts the interval; the last one leaving stops it.
export function onFeedUpdate(listener) {
  _feedLive.listeners.add(listener);
  _feedLiveSync();
  return () => {
    _feedLive.listeners.delete(listener);
    _feedLiveSync();
  };
}

// Seat watches must keep alerting with the tab in the background; everything
// else can wait for the page to become visible again.
export function setFeedHiddenPolling(on) {
  _feedLive.hiddenPolling = !!on;
  _feedLiveSync();
}

// Fan a fetch result out to every subscriber except `except` (the tab that
// already applied it as part of its own refresh).
export function broadcastFeedResult(result, except = null) {
  for (const listener of _feedLive.listeners) {
    if (listener === except) continue;
    try { listener(result); }
    catch { /* one bad listener must not starve the rest */ }
  }
}

function _feedLivePeriodMs() {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (!hidden) return FEED_LIVE_POLL_MS;
  return _feedLive.hiddenPolling ? FEED_LIVE_HIDDEN_MS : 0; // 0 = paused
}

// Keep exactly one interval running while there's a subscriber, at the
// cadence for the current visibility. Re-creates the timer only when the
// cadence actually changes, so a no-op flip doesn't reset the countdown.
function _feedLiveSync() {
  const period = _feedLive.listeners.size > 0 ? _feedLivePeriodMs() : 0;
  if (period === _feedLive.period) return;
  if (_feedLive.timer) { clearInterval(_feedLive.timer); _feedLive.timer = null; }
  _feedLive.period = period;
  if (period > 0) _feedLive.timer = setInterval(_feedLiveTick, period);
}

async function _feedLiveTick() {
  if (_feedLive.inFlight || _feedLive.listeners.size === 0) return;
  _feedLive.inFlight = true;
  _feedLive.lastAt = Date.now();
  try {
    const result = await fetchConnectFeed({ forceRefresh: true });
    broadcastFeedResult(result);
  } catch { /* transient poll failure — keep prior data, next tick retries */ }
  finally { _feedLive.inFlight = false; }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    _feedLiveSync();
    // Catch up right away when the page returns to the foreground — but only
    // if a full visible period has actually elapsed, so alt-tabbing back and
    // forth doesn't hammer the CDN.
    if (
      document.visibilityState !== 'hidden' &&
      _feedLive.listeners.size > 0 &&
      Date.now() - _feedLive.lastAt >= FEED_LIVE_POLL_MS
    ) _feedLiveTick();
  });
}
