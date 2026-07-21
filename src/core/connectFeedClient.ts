/**
 * Connect Feed runtime client — thin wrapper around `usis-cdn.eniamza.com/connect.json`
 * with a localStorage TTL cache, ETag-aware refresh, and stale-cache fallback
 * when the network is unreachable.
 *
 * The CDN is run by a student. Be polite:
 *   - cache aggressively (default TTL: 10 minutes)
 *   - send the previous `etag` so the CDN can answer 304 Not Modified
 *   - never poll on a tight loop
 *
 * I/O-free helpers live in `./connectFeed`; this module composes them.
 */

import { parseFeed, summarizeFeed, type NormalizedSection, type FeedSummary } from './connectFeed';

export const DEFAULT_FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
export const DEFAULT_CACHE_KEY = 'shohoj_connect_feed_v1';
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type FeedSource = 'live' | 'cache' | 'fallback';

export interface FetchFeedResult {
  sections: NormalizedSection[];
  summary: FeedSummary;
  source: FeedSource;
  fetchedAt: number;
  etag: string | null;
  dropped: number[];
}

interface CacheEntry {
  fetchedAt: number;
  etag: string | null;
  payload: unknown;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface FetchFeedOptions {
  url?: string;
  cacheKey?: string;
  ttlMs?: number;
  forceRefresh?: boolean;
  storage?: StorageLike | null;
  fetcher?: FetchLike;
  now?: () => number;
  signal?: AbortSignal;
}

function safeRead(storage: StorageLike | null, key: string): CacheEntry | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (typeof raw !== 'string' || raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.fetchedAt !== 'number' || !Array.isArray(obj.payload)) return null;

  const etag = typeof obj.etag === 'string' ? obj.etag : null;
  return { fetchedAt: obj.fetchedAt, etag, payload: obj.payload };
}

function safeWrite(storage: StorageLike | null, key: string, entry: CacheEntry): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // QuotaExceeded etc. — caller already has the live data, so the failure
    // is silent on purpose; next fetch just won't see a cache hit.
  }
}

function safeRemove(storage: StorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

function materialize(
  payload: unknown,
  source: FeedSource,
  fetchedAt: number,
  etag: string | null,
): FetchFeedResult {
  const { sections, dropped } = parseFeed(payload);
  const summary = summarizeFeed(sections);
  return { sections, summary, source, fetchedAt, etag, dropped };
}

export async function fetchConnectFeed(options: FetchFeedOptions = {}): Promise<FetchFeedResult> {
  const url = options.url ?? DEFAULT_FEED_URL;
  const cacheKey = options.cacheKey ?? DEFAULT_CACHE_KEY;
  const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_CACHE_TTL_MS;
  const storage =
    options.storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : options.storage;
  const fetcher =
    options.fetcher === undefined
      ? typeof fetch !== 'undefined'
        ? (fetch as unknown as FetchLike)
        : null
      : options.fetcher;
  const now = options.now ?? (() => Date.now());

  const cache = safeRead(storage, cacheKey);
  const cacheFresh = cache !== null && now() - cache.fetchedAt < ttlMs;

  if (cache !== null && cacheFresh && !options.forceRefresh) {
    return materialize(cache.payload, 'cache', cache.fetchedAt, cache.etag);
  }

  if (fetcher === null) {
    if (cache !== null) {
      return materialize(cache.payload, 'fallback', cache.fetchedAt, cache.etag);
    }
    throw new Error('Connect feed: no fetcher available and no cache.');
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cache !== null && cache.etag) headers['If-None-Match'] = cache.etag;

  try {
    const response = await fetcher(url, { headers, signal: options.signal });
    if (response.status === 304 && cache !== null) {
      // Refresh fetchedAt so the cache TTL window restarts even though the
      // payload didn't change. Avoids re-hitting the CDN on the next tick.
      const refreshed: CacheEntry = {
        fetchedAt: now(),
        etag: cache.etag,
        payload: cache.payload,
      };
      safeWrite(storage, cacheKey, refreshed);
      return materialize(cache.payload, 'cache', refreshed.fetchedAt, refreshed.etag);
    }
    if (!response.ok) {
      throw new Error(`Connect feed: HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Connect feed: response was not a JSON array.');
    }
    const etag = response.headers.get('etag');
    const fetchedAt = now();
    safeWrite(storage, cacheKey, { fetchedAt, etag, payload });
    return materialize(payload, 'live', fetchedAt, etag);
  } catch (err) {
    if (cache !== null) {
      return materialize(cache.payload, 'fallback', cache.fetchedAt, cache.etag);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function clearConnectFeedCache(
  storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null,
  cacheKey: string = DEFAULT_CACHE_KEY,
): void {
  safeRemove(storage, cacheKey);
}

export function peekConnectFeedCache(
  storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null,
  cacheKey: string = DEFAULT_CACHE_KEY,
): { fetchedAt: number; etag: string | null } | null {
  const entry = safeRead(storage, cacheKey);
  return entry === null ? null : { fetchedAt: entry.fetchedAt, etag: entry.etag };
}
