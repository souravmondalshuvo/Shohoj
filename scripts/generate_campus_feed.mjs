#!/usr/bin/env node
// scripts/generate_campus_feed.mjs
//
// Generates the section feed the legacy Routine tab reads for a campus whose
// sections come from the campus database, and the small module that tells the
// bundle where that feed is and what it is:
//
//   feeds/nsu-<term>.json              the sections, in the CONNECT feed's raw
//                                      shape, fetched on demand — never bundled
//   js/core/campusFeeds.generated.js   one entry per campus: the URL, the
//                                      semester, and how old the snapshot is
//
// The mapping is scripts/campus_feed.mjs; this file only chooses the term and
// serialises.
//
// Run:     npm run generate:campus-feed
// Verify:  npm run check:campus-feed   (regenerates and diffs; the unit suite
//                                       runs it, so neither file can fall
//                                       behind data/campuses/)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCampuses } from './campus_data.mjs';
import { buildCampusFeed } from './campus_feed.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Which snapshot each campus's Routine tab is built from.
 *
 * `capturedOn` is the day the snapshot was true, which the section file states
 * only in prose (its `note`), so it is restated here where code can read it;
 * tests/campusFeed.test.js holds the two together. It is what the tab shows
 * the student, because this data goes stale: NSU's Fall 2026 page had changed
 * in about one section in eight five days after this copy was taken.
 */
export const CAMPUS_FEEDS = [{ campus: 'nsu', termKey: '263-trimester', capturedOn: '2026-09-23' }];

export const META_PATH = resolve(repoRoot, 'js/core/campusFeeds.generated.js');
export const feedPath = (campus, term) => resolve(repoRoot, `feeds/${campus}-${term}.json`);
const feedUrl = (campus, term) => `feeds/${campus}-${term}.json`;

/** One section per line: a regenerated feed diffs by section, not as one blob. */
const renderSections = (sections) =>
  `[\n${sections.map((s) => JSON.stringify(s)).join(',\n')}\n]\n`;

export function renderCampusFeeds() {
  const { campuses, errors } = loadCampuses();
  if (errors.length > 0) {
    throw new Error(
      `data/campuses has errors; refusing to generate from it:\n${errors.join('\n')}`,
    );
  }

  const files = [];
  const entries = [];
  for (const { campus: id, termKey, capturedOn } of CAMPUS_FEEDS) {
    const campus = campuses.find((c) => c.id === id);
    if (!campus) throw new Error(`no campus '${id}' in data/campuses`);
    const snapshot = campus.sections?.[termKey];
    if (!snapshot) throw new Error(`${id} has no sections for '${termKey}'`);
    const { sections, meta } = buildCampusFeed(
      snapshot,
      campus.calendars?.[termKey] ?? null,
      campus.courses?.records ?? [],
    );
    if (sections.length === 0) throw new Error(`refusing to generate an empty feed for ${id}`);

    files.push({ path: feedPath(id, meta.term), text: renderSections(sections) });
    entries.push([id, { url: feedUrl(id, meta.term), capturedOn, ...meta }]);
  }

  const body = entries
    .map(([id, entry]) => `  ${JSON.stringify(id)}: ${JSON.stringify(entry)},`)
    .join('\n');
  const meta = `// js/core/campusFeeds.generated.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: npm run generate:campus-feed
// Source of truth: data/campuses/<id>/sections/ and calendar/
//
// The section feed for each campus whose routine is built from a snapshot in
// the campus database rather than from a live feed. \`url\` is relative to the
// page; the file is fetched on demand and is not part of the bundle.
//
// \`capturedOn\` is the day the snapshot was true. Nothing here is live: no
// seat count is carried, and faculty and rooms are as published on that day.

/** campus id → { url, capturedOn, term, semesterSessionId, source, … }. */
export const CAMPUS_FEED_SNAPSHOTS = {
${body}
};
`;
  files.push({ path: META_PATH, text: meta });
  return files;
}

function main() {
  const files = renderCampusFeeds();
  if (process.argv.includes('--check')) {
    const stale = files.filter(({ path, text }) => {
      try {
        return readFileSync(path, 'utf8') !== text;
      } catch {
        return true; // a missing file is out of date
      }
    });
    if (stale.length > 0) {
      console.error(
        `Out of date with data/campuses/:\n${stale.map((f) => `  ${f.path.slice(repoRoot.length + 1)}`).join('\n')}\n` +
          'Run: npm run generate:campus-feed',
      );
      process.exit(1);
    }
    console.log(`${files.length} campus feed file(s) are up to date.`);
    return;
  }
  for (const { path, text } of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    console.log(
      `wrote ${path.slice(repoRoot.length + 1)} (${(Buffer.byteLength(text) / 1024).toFixed(1)} kB)`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
