// Twin of src/core/connectFeedClient.ts — hand-maintained, not generated.
// src/core/connectFeedClient.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Thin wrapper around `usis-cdn.eniamza.com/connect.json` with a localStorage
// TTL cache, ETag-aware refresh, and stale-cache fallback on network failure.
// I/O-free helpers live in ./connectFeed.js; this module composes them.

import { parseFeed, summarizeFeed } from './connectFeed.js';

export const DEFAULT_FEED_URL = 'https://usis-cdn.eniamza.com/connect.json';
export const DEFAULT_CACHE_KEY = 'shohoj_connect_feed_v1';
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

function safeRead(storage, key) {
    if (!storage) return null;
    let raw;
    try { raw = storage.getItem(key); }
    catch { return null; }
    if (typeof raw !== 'string' || raw.length === 0) return null;

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.payload)) return null;

    const etag = typeof parsed.etag === 'string' ? parsed.etag : null;
    return { fetchedAt: parsed.fetchedAt, etag, payload: parsed.payload };
}

function safeWrite(storage, key, entry) {
    if (!storage) return;
    try { storage.setItem(key, JSON.stringify(entry)); }
    catch { /* QuotaExceeded etc. — silent on purpose */ }
}

function safeRemove(storage, key) {
    if (!storage) return;
    try { storage.removeItem(key); }
    catch { /* ignore */ }
}

function materialize(payload, source, fetchedAt, etag) {
    const { sections, dropped } = parseFeed(payload);
    const summary = summarizeFeed(sections);
    return { sections, summary, source, fetchedAt, etag, dropped };
}

export async function fetchConnectFeed(options = {}) {
    const url = options.url ?? DEFAULT_FEED_URL;
    const cacheKey = options.cacheKey ?? DEFAULT_CACHE_KEY;
    const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_CACHE_TTL_MS;
    const storage =
        options.storage === undefined
            ? (typeof localStorage !== 'undefined' ? localStorage : null)
            : options.storage;
    const fetcher =
        options.fetcher === undefined
            ? (typeof fetch !== 'undefined' ? fetch : null)
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

    const headers = { Accept: 'application/json' };
    if (cache !== null && cache.etag) headers['If-None-Match'] = cache.etag;

    try {
        const response = await fetcher(url, { headers, signal: options.signal });
        if (response.status === 304 && cache !== null) {
            const refreshed = {
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
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    cacheKey = DEFAULT_CACHE_KEY,
) {
    safeRemove(storage, cacheKey);
}

export function peekConnectFeedCache(
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    cacheKey = DEFAULT_CACHE_KEY,
) {
    const entry = safeRead(storage, cacheKey);
    return entry === null ? null : { fetchedAt: entry.fetchedAt, etag: entry.etag };
}
