#!/usr/bin/env node
/**
 * scripts/osm_surroundings.mjs
 *
 * Turns an Overpass API response (JSON, `out geom`) into the surroundings
 * data a campus map draws round its own site: neighbouring building
 * footprints (with OSM's level count where it has one), roads by kind, water,
 * green land and mapped trees, projected to the campus's own metres.
 *
 *   node scripts/osm_surroundings.mjs <overpass.json> <campus> > src/core/<file>.generated.ts
 *
 * <campus> picks the frame from FRAMES below: where the campus origin is,
 * how far the campus frame is turned from true north, which rectangle is the
 * campus itself (left out: the map draws it), and how far round it to keep.
 *
 * Fetch the input with this query, the bounding box covering FRAMES' radius:
 *
 *   [out:json][timeout:120];(way["building"](bbox);way["highway"](bbox);
 *   way["natural"="water"](bbox);way["waterway"](bbox);way["landuse"](bbox);
 *   way["leisure"](bbox);node["natural"="tree"](bbox););out geom;
 *
 * The output is deterministic for a given input: ways sorted by id,
 * coordinates rounded to 0.1 m.
 */

import { readFileSync } from 'node:fs';

const FRAMES = {
  // NSU: src/core/campusNsu.ts — origin the middle of the site, x east and
  // y north turned 5.7° so the academic bars run along x. Fitted to OSM's
  // outline of the university (way 659138250): turned 5.7° about this
  // origin, it lands on NSU_SITE to within a metre.
  nsu: {
    lat: 23.81535,
    lon: 90.4261,
    turnDeg: 5.7,
    site: { x1: -120, x2: 121, y1: -68, y2: 71 },
    radius: 520,
    name: 'NSU_SURROUNDINGS',
  },
};

const ROAD_WIDTHS = {
  motorway: 14,
  trunk: 14,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  unclassified: 6,
  residential: 6,
  service: 4,
  living_street: 5,
  pedestrian: 4,
  footway: 2,
  path: 1.5,
  cycleway: 2,
};

const GREEN_LANDUSE = new Set([
  'grass',
  'meadow',
  'recreation_ground',
  'village_green',
  'forest',
  'orchard',
  'farmland',
]);
const GREEN_LEISURE = new Set([
  'park',
  'garden',
  'pitch',
  'playground',
  'golf_course',
  'sports_centre',
]);

const [, , inputPath, campus] = process.argv;
const frame = FRAMES[campus];
if (!inputPath || !frame) {
  console.error(`usage: osm_surroundings.mjs <overpass.json> <${Object.keys(FRAMES).join('|')}>`);
  process.exit(1);
}

const R = 6378137;
const cosLat = Math.cos((frame.lat * Math.PI) / 180);
const turn = (frame.turnDeg * Math.PI) / 180;
const c = Math.cos(turn);
const s = Math.sin(turn);

/** Latitude/longitude to campus metres: east/north, then turned into the frame. */
function project(lat, lon) {
  const e = ((lon - frame.lon) * Math.PI * R * cosLat) / 180;
  const n = ((lat - frame.lat) * Math.PI * R) / 180;
  return [Math.round((e * c + n * s) * 10) / 10, Math.round((-e * s + n * c) * 10) / 10];
}

const inSite = ([x, y]) =>
  x > frame.site.x1 && x < frame.site.x2 && y > frame.site.y1 && y < frame.site.y2;
const near = ([x, y]) => Math.hypot(x, y) <= frame.radius;

function closed(points) {
  const a = points[0];
  const b = points[points.length - 1];
  return points.length > 3 && a[0] === b[0] && a[1] === b[1] ? points.slice(0, -1) : points;
}

function centroid(points) {
  const sx = points.reduce((t, p) => t + p[0], 0);
  const sy = points.reduce((t, p) => t + p[1], 0);
  return [sx / points.length, sy / points.length];
}

function levelsOf(tags) {
  const raw = tags['building:levels'];
  if (raw === undefined) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null;
}

const data = JSON.parse(readFileSync(inputPath, 'utf8'));
const elements = [...data.elements].sort((a, b) => a.id - b.id);

const buildings = [];
const roads = [];
const water = [];
const green = [];
const trees = [];

for (const el of elements) {
  const tags = el.tags ?? {};
  if (el.type === 'node') {
    if (tags.natural === 'tree') {
      const p = project(el.lat, el.lon);
      if (near(p) && !inSite(p)) trees.push(p);
    }
    continue;
  }
  if (!el.geometry || el.geometry.length < 2) continue;
  const pts = el.geometry.map((g) => project(g.lat, g.lon));
  if (tags.building && tags.building !== 'no' && tags.building !== 'roof') {
    const outline = closed(pts);
    const mid = centroid(outline);
    if (outline.length >= 3 && near(mid) && !inSite(mid))
      buildings.push({ id: el.id, outline, levels: levelsOf(tags) });
  } else if (tags.highway && ROAD_WIDTHS[tags.highway] !== undefined) {
    if (pts.some(near))
      roads.push({ id: el.id, kind: tags.highway, width: ROAD_WIDTHS[tags.highway], path: pts });
  } else if (tags.natural === 'water' || tags.landuse === 'reservoir' || tags.landuse === 'basin') {
    const outline = closed(pts);
    if (outline.length >= 3 && outline.some(near)) water.push({ id: el.id, outline });
  } else if (tags.waterway === 'canal' || tags.waterway === 'river' || tags.waterway === 'drain') {
    if (pts.some(near))
      roads.push({
        id: el.id,
        kind: `water-${tags.waterway}`,
        width: tags.waterway === 'drain' ? 3 : 12,
        path: pts,
      });
  } else if (GREEN_LANDUSE.has(tags.landuse) || GREEN_LEISURE.has(tags.leisure)) {
    const outline = closed(pts);
    const kind = tags.leisure === 'pitch' ? 'pitch' : 'green';
    if (outline.length >= 3 && outline.some(near) && !inSite(centroid(outline)))
      green.push({ id: el.id, kind, outline });
  }
}

const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const pts = (list) => `[${list.map(([x, y]) => `[${num(x)}, ${num(y)}]`).join(', ')}]`;

const out = [];
out.push(`/**`);
out.push(` * GENERATED by scripts/osm_surroundings.mjs (${campus}) from an OpenStreetMap`);
out.push(
  ` * Overpass extract (OSM data as of ${data.osm3s?.timestamp_osm_base ?? 'unknown'}) — do not edit`,
);
out.push(` * by hand; regenerate instead.`);
out.push(` *`);
out.push(` * What stands round the campus, in its own metres (x east, y north, turned`);
out.push(` * ${frame.turnDeg}° into the campus frame): building footprints with OSM's level count`);
out.push(` * where it has one, roads by kind with a drawing width, water, green land`);
out.push(` * and mapped trees, within ${frame.radius} m of the origin. The campus's own site is`);
out.push(` * left out. Map data © OpenStreetMap contributors (ODbL).`);
out.push(` */`);
out.push(``);
out.push(`import type { Surroundings } from './campusSurroundings.ts';`);
out.push(``);
out.push(`export const ${frame.name}: Surroundings = {`);
out.push(`  buildings: [`);
for (const b of buildings)
  out.push(`    { outline: ${pts(b.outline)}, levels: ${b.levels ?? 'null'} },`);
out.push(`  ],`);
out.push(`  roads: [`);
for (const r of roads)
  out.push(`    { kind: '${r.kind}', width: ${r.width}, path: ${pts(r.path)} },`);
out.push(`  ],`);
out.push(`  water: [`);
for (const w of water) out.push(`    ${pts(w.outline)},`);
out.push(`  ],`);
out.push(`  green: [`);
for (const g of green) out.push(`    { kind: '${g.kind}', outline: ${pts(g.outline)} },`);
out.push(`  ],`);
out.push(`  trees: ${pts(trees)},`);
out.push(`};`);
process.stdout.write(`${out.join('\n')}\n`);
console.error(
  `${campus}: ${buildings.length} buildings, ${roads.length} roads, ${water.length} water, ${green.length} green, ${trees.length} trees`,
);
