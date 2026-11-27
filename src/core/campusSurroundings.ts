/**
 * What stands round a city campus, as data for its 3D map: the shape of the
 * OpenStreetMap extract (scripts/osm_surroundings.mjs writes it) and the pure
 * rules that turn it into a neighbourhood — how tall each mapped building is
 * drawn, where street trees stand, and the illustrative city that carries on
 * past the mapped area to the horizon.
 *
 * Only the footprints, roads, water and green land are mapped. Heights are
 * OSM's level count where it has one (few buildings do) and otherwise a
 * likely height for a Dhaka plot of that size; street trees and the city past
 * the mapped area are laid out to look right, not where anything really is.
 * Every map that uses this says so.
 *
 * Pure data and pure functions, no imports, so node tests can load it.
 */

/** A point in campus metres: [x east, y north] (turned into the campus frame). */
export type SPoint = readonly [number, number];

export interface SurroundingBuilding {
  outline: readonly SPoint[];
  /** OSM's `building:levels`, or null where OSM has none. */
  levels: number | null;
}

export interface SurroundingRoad {
  /** OSM's highway kind, or `water-<kind>` for a canal or drain. */
  kind: string;
  /** Drawing width in metres. */
  width: number;
  path: readonly SPoint[];
}

export interface Surroundings {
  buildings: readonly SurroundingBuilding[];
  roads: readonly SurroundingRoad[];
  water: readonly (readonly SPoint[])[];
  green: readonly { kind: string; outline: readonly SPoint[] }[];
  trees: readonly SPoint[];
  /** The campus's own plot, where OSM maps it (BRACU's: not the tower itself). */
  plot?: readonly SPoint[];
}

export interface SiteRect {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** Seeded generator in [0, 1): the same sequence for the same seed. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shoelace area, signed (positive counter-clockwise). */
export function outlineArea(points: readonly SPoint[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    if (p && q) a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function insidePolygon(p: SPoint, poly: readonly SPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

/**
 * How many storeys a mapped Dhaka building is drawn with: OSM's count where
 * it has one; otherwise by plot size, as the city builds — a shop or shack on
 * a scrap of land, four to nine storeys of flats on a residential plot, a
 * taller block on a large one. Seeded by the building's index.
 */
export function urbanStoreys(area: number, levels: number | null, seed: number): number {
  if (levels !== null && levels >= 1) return Math.min(levels, 40);
  const r = seeded(4100 + seed);
  const p = r();
  if (area < 45) return 1;
  if (area < 120) return 2 + Math.floor(p * 4); // 2–5
  if (area < 450) return 5 + Math.floor(p * 5); // 5–9
  if (area < 2000) return 6 + Math.floor(p * 7); // 6–12
  return 4 + Math.floor(p * 6); // a market or a hall: broad, not tall
}

function segmentDistance(p: SPoint, a: SPoint, b: SPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Roads that carry street trees (not footways, service lanes or canals). */
const TREE_ROADS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'trunk',
  'residential',
  'unclassified',
  'living_street',
]);

interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  outline: readonly SPoint[];
}

function boxes(list: readonly (readonly SPoint[])[], grow: number): Box[] {
  return list.map((outline) => {
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    return {
      x1: Math.min(...xs) - grow,
      x2: Math.max(...xs) + grow,
      y1: Math.min(...ys) - grow,
      y2: Math.max(...ys) + grow,
      outline,
    };
  });
}

function inSite(p: SPoint, site: SiteRect, margin: number): boolean {
  return (
    p[0] > site.x1 - margin &&
    p[0] < site.x2 + margin &&
    p[1] > site.y1 - margin &&
    p[1] < site.y2 + margin
  );
}

/**
 * Street trees: OSM's mapped trees, then a tree every 11–17 m along both
 * sides of each street, just off the carriageway, where there is room — not
 * on another road, in a building, in water or on the campus. `density` thins
 * them (1 = all, 2 = about half). Seeded and deterministic.
 */
export function streetTrees(data: Surroundings, site: SiteRect, density = 1): SPoint[] {
  const thin = Number.isFinite(density) && density > 0 ? density : 1;
  const r = seeded(4200);
  const built = boxes(
    data.buildings.map((b) => b.outline),
    1.5,
  );
  const wet = boxes(data.water, 1);
  const roads = data.roads.filter((rd) => !rd.kind.startsWith('water-'));
  const blocked = (p: SPoint): boolean =>
    inSite(p, site, 3) ||
    built.some(
      (b) =>
        p[0] > b.x1 &&
        p[0] < b.x2 &&
        p[1] > b.y1 &&
        p[1] < b.y2 &&
        (insidePolygon(p, b.outline) || nearOutline(p, b.outline, 1.5)),
    ) ||
    wet.some(
      (w) =>
        p[0] > w.x1 && p[0] < w.x2 && p[1] > w.y1 && p[1] < w.y2 && insidePolygon(p, w.outline),
    ) ||
    roads.some((rd) => {
      for (let i = 1; i < rd.path.length; i++) {
        const a = rd.path[i - 1];
        const b = rd.path[i];
        if (a && b && segmentDistance(p, a, b) < rd.width / 2 + 0.8) return true;
      }
      return false;
    });
  const out: SPoint[] = data.trees.filter((t) => !inSite(t, site, 3));
  for (const rd of data.roads) {
    if (!TREE_ROADS.has(rd.kind)) continue;
    const off = rd.width / 2 + 1.8;
    // Distance along the street to the next tree, carried round its bends.
    let next = r() * 12;
    for (let i = 1; i < rd.path.length; i++) {
      const a = rd.path[i - 1];
      const b = rd.path[i];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.01) continue;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      for (; next < len; next += (11 + r() * 6) * thin) {
        for (const side of [-1, 1]) {
          if (r() < 0.35) continue; // gaps: a gate, a shop front, a lost tree
          const p: SPoint = [
            a[0] + ux * next - uy * off * side,
            a[1] + uy * next + ux * off * side,
          ];
          if (!blocked(p)) out.push(p);
        }
      }
      next -= len;
    }
  }
  for (const g of data.green) {
    if (g.kind === 'pitch') continue;
    const xs = g.outline.map((p) => p[0]);
    const ys = g.outline.map((p) => p[1]);
    const step = 9 * Math.sqrt(thin);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += step) {
      for (let y = Math.min(...ys); y < Math.max(...ys); y += step) {
        const p: SPoint = [x + (r() - 0.5) * step, y + (r() - 0.5) * step];
        if (r() < 0.45 && insidePolygon(p, g.outline) && !blocked(p)) out.push(p);
      }
    }
  }
  return out;
}

function nearOutline(p: SPoint, outline: readonly SPoint[], d: number): boolean {
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (a && b && segmentDistance(p, a, b) < d) return true;
  }
  return false;
}

export interface FarBlock {
  x: number;
  y: number;
  /** Along and across, metres. */
  length: number;
  width: number;
  storeys: number;
  /** Turn, radians. */
  turn: number;
  /** 0..1: which wash. */
  tone: number;
}

/**
 * The city past the mapped area, to the horizon: a street grid of blocks
 * 70–110 m by 50–80 m, each built up plot by plot with four- to ten-storey
 * buildings and the odd taller tower, from `inner` metres out to `outer`.
 * Illustrative only — no block stands where a real one does. Seeded.
 */
export function farCity(inner: number, outer: number, density = 1): FarBlock[] {
  const thin = Number.isFinite(density) && density > 0 ? density : 1;
  const r = seeded(4300);
  const out: FarBlock[] = [];
  const turn = 0.12;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const street = 12;
  for (let gx = -outer; gx < outer;) {
    const bw = 70 + r() * 40;
    for (let gy = -outer; gy < outer;) {
      const bd = 50 + r() * 30;
      // Plots along the block's long side, two rows back to back.
      for (let px = gx + 2; px < gx + bw - 6;) {
        const pw = 12 + r() * 12;
        for (const row of [0, 1]) {
          const depth = bd / 2 - 3;
          const lx = px + pw / 2;
          const ly = gy + (row === 0 ? depth / 2 + 1 : bd - depth / 2 - 1);
          const x = lx * c - ly * s;
          const y = lx * s + ly * c;
          const d = Math.hypot(x, y);
          // Thinner toward the horizon, where haze hides the gaps.
          const keep = d >= inner && d <= outer && r() < (d < outer * 0.6 ? 0.82 : 0.6) / thin;
          const tall = r();
          if (keep) {
            out.push({
              x,
              y,
              length: pw - 1.5,
              width: depth - 1 - r() * 4,
              storeys: tall < 0.04 ? 14 + Math.floor(r() * 10) : 4 + Math.floor(r() * 7),
              turn,
              tone: r(),
            });
          }
        }
        px += pw;
      }
      gy += bd + street;
    }
    gx += bw + street;
  }
  return out;
}

export type VehicleKind = 'car' | 'cng' | 'rickshaw' | 'bus';

export interface Vehicle {
  x: number;
  y: number;
  /** Heading, radians from +x (east in the campus frame) toward +y. */
  turn: number;
  kind: VehicleKind;
  /** 0..1: which paint. */
  tone: number;
}

/** How busy each kind of road is: vehicles per 10 m of road, both sides together. */
const TRAFFIC: Record<string, number> = {
  trunk: 2.2,
  primary: 2.2,
  secondary: 1.8,
  tertiary: 1.4,
  residential: 0.9,
  unclassified: 0.8,
  living_street: 0.6,
  service: 0.35,
};

/**
 * Traffic on the mapped roads: cars, green CNG auto-rickshaws, cycle
 * rickshaws and, on the main roads, buses — some parked at the kerb, most in
 * the lanes, the busier the road the more. Illustrative, not a count. Kept
 * off the campus site. `density` thins it (1 = all, 2 = about half). Seeded.
 */
export function roadTraffic(data: Surroundings, site: SiteRect, density = 1): Vehicle[] {
  const thin = Number.isFinite(density) && density > 0 ? density : 1;
  const r = seeded(4500);
  const out: Vehicle[] = [];
  for (const rd of data.roads) {
    const rate = TRAFFIC[rd.kind];
    if (rate === undefined || rd.width < 4) continue;
    const main = rd.width >= 10;
    for (let i = 1; i < rd.path.length; i++) {
      const a = rd.path[i - 1];
      const b = rd.path[i];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 2) continue;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      const count = Math.floor((len / 10) * (rate / thin) + r());
      for (let k = 0; k < count; k++) {
        const s = 2 + r() * Math.max(0, len - 4);
        const side = r() < 0.5 ? -1 : 1;
        const parked = r() < (main ? 0.1 : 0.35);
        const p = r();
        const kind: VehicleKind =
          main && p < 0.12
            ? 'bus'
            : p < (main ? 0.55 : 0.4)
              ? 'car'
              : p < 0.75
                ? 'cng'
                : 'rickshaw';
        const half = rd.width / 2;
        // In a lane: a quarter of the way out from the middle; parked: at the kerb.
        const off = parked ? half - (kind === 'bus' ? 1.6 : 1.1) : half / 2;
        const x = a[0] + ux * s - uy * off * side;
        const y = a[1] + uy * s + ux * off * side;
        if (inSite([x, y], site, 4)) continue;
        // Traffic keeps left in Bangladesh: side +1 is the left of the path's
        // direction, so it runs along the path; side -1 runs back against it.
        const heading = Math.atan2(uy, ux) + (side < 0 ? Math.PI : 0) + (r() - 0.5) * 0.08;
        out.push({ x, y, turn: heading, kind, tone: r() });
      }
    }
  }
  return out;
}

export interface Pole {
  x: number;
  y: number;
}

/**
 * Electricity poles along the streets, 28–36 m apart on one side, just off
 * the carriageway, and the runs of cable strung between neighbours on the
 * same street (as index pairs into the poles). Not on the campus or in a
 * building. Illustrative and seeded.
 */
export function streetPoles(
  data: Surroundings,
  site: SiteRect,
): { poles: Pole[]; spans: Array<[number, number]> } {
  const r = seeded(4600);
  const built = boxes(
    data.buildings.map((b) => b.outline),
    0.5,
  );
  const poles: Pole[] = [];
  const spans: Array<[number, number]> = [];
  for (const rd of data.roads) {
    if (!TREE_ROADS.has(rd.kind) && rd.kind !== 'service') continue;
    const side = r() < 0.5 ? -1 : 1;
    const off = rd.width / 2 + 0.7;
    let next = r() * 20;
    let prev = -1;
    for (let i = 1; i < rd.path.length; i++) {
      const a = rd.path[i - 1];
      const b = rd.path[i];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.01) continue;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      for (; next < len; next += 28 + r() * 8) {
        const p: SPoint = [a[0] + ux * next - uy * off * side, a[1] + uy * next + ux * off * side];
        const blocked =
          inSite(p, site, 3) ||
          built.some(
            (bb) =>
              p[0] > bb.x1 &&
              p[0] < bb.x2 &&
              p[1] > bb.y1 &&
              p[1] < bb.y2 &&
              insidePolygon(p, bb.outline),
          );
        if (blocked) {
          prev = -1;
          continue;
        }
        poles.push({ x: p[0], y: p[1] });
        if (prev >= 0) spans.push([prev, poles.length - 1]);
        prev = poles.length - 1;
      }
      next -= len;
    }
  }
  return { poles, spans };
}

/**
 * Roads bucketed on a 20 m grid, and a test for whether a point is within
 * `reach` of a carriageway's edge (0: on the carriageway itself).
 */
function roadIndex(roads: readonly SurroundingRoad[]): (p: SPoint, reach: number) => boolean {
  const CELL = 20;
  const grid = new Map<string, Array<{ a: SPoint; b: SPoint; half: number }>>();
  for (const rd of roads) {
    const half = rd.width / 2;
    for (let i = 1; i < rd.path.length; i++) {
      const a = rd.path[i - 1];
      const b = rd.path[i];
      if (!a || !b) continue;
      const seg = { a, b, half };
      // Every cell the segment's box (grown by the road's half width) touches.
      const x1 = Math.floor((Math.min(a[0], b[0]) - half) / CELL);
      const x2 = Math.floor((Math.max(a[0], b[0]) + half) / CELL);
      const y1 = Math.floor((Math.min(a[1], b[1]) - half) / CELL);
      const y2 = Math.floor((Math.max(a[1], b[1]) + half) / CELL);
      for (let gx = x1; gx <= x2; gx++) {
        for (let gy = y1; gy <= y2; gy++) {
          const key = `${gx},${gy}`;
          const list = grid.get(key) ?? [];
          list.push(seg);
          grid.set(key, list);
        }
      }
    }
  }
  return (p, reach) => {
    const gx1 = Math.floor((p[0] - reach) / CELL);
    const gx2 = Math.floor((p[0] + reach) / CELL);
    const gy1 = Math.floor((p[1] - reach) / CELL);
    const gy2 = Math.floor((p[1] + reach) / CELL);
    for (let gx = gx1; gx <= gx2; gx++) {
      for (let gy = gy1; gy <= gy2; gy++) {
        for (const s of grid.get(`${gx},${gy}`) ?? []) {
          if (segmentDistance(p, s.a, s.b) <= s.half + reach) return true;
        }
      }
    }
    return false;
  };
}

/**
 * Whether a point is on a street front: within `reach` metres of the kerb of
 * a road that carries shops (the roads that carry street trees, not service
 * lanes, footways or canals). The mapped roads are bucketed on a 20 m grid
 * once, so asking for every side of every block stays cheap.
 */
export function streetFront(data: Surroundings): (p: SPoint, reach: number) => boolean {
  return roadIndex(data.roads.filter((rd) => TREE_ROADS.has(rd.kind)));
}

/** Someone on foot: where, which way they face, how tall, and seeds for their clothes and skin. */
export interface Person {
  x: number;
  y: number;
  turn: number;
  height: number;
  tone: number;
  skin: number;
}

function person(x: number, y: number, turn: number, r: () => number): Person {
  return { x, y, turn, height: 1.5 + r() * 0.28, tone: r(), skin: r() };
}

function inBuilding(p: SPoint, built: readonly Box[]): boolean {
  return built.some(
    (bb) =>
      p[0] > bb.x1 && p[0] < bb.x2 && p[1] > bb.y1 && p[1] < bb.y2 && insidePolygon(p, bb.outline),
  );
}

/**
 * People on the footpaths within `reach` of the campus: walking along both
 * sides of each street, the busier the street the more, and a few stopped
 * and facing the road. Never on a carriageway, in a building or on the
 * campus site. Illustrative, not a count. `density` thins them. Seeded.
 */
export function pedestrians(
  data: Surroundings,
  site: SiteRect,
  reach: number,
  density = 1,
): Person[] {
  const thin = Number.isFinite(density) && density > 0 ? density : 1;
  const r = seeded(4800);
  const built = boxes(
    data.buildings.map((b) => b.outline),
    0.3,
  );
  const onRoad = roadIndex(data.roads.filter((rd) => !rd.kind.startsWith('water-')));
  const out: Person[] = [];
  for (const rd of data.roads) {
    const rate = TRAFFIC[rd.kind];
    if (rate === undefined) continue;
    for (let i = 1; i < rd.path.length; i++) {
      const a = rd.path[i - 1];
      const b = rd.path[i];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 2) continue;
      if (segmentDistance([0, 0], a, b) > reach) continue;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      const count = Math.floor((len / 9) * (rate / thin) + r());
      for (let k = 0; k < count; k++) {
        const s = r() * len;
        const side = r() < 0.5 ? -1 : 1;
        const off = rd.width / 2 + 0.6 + r() * 1.4;
        const p: SPoint = [a[0] + ux * s - uy * off * side, a[1] + uy * s + ux * off * side];
        const stopped = r() < 0.2;
        const along = Math.atan2(uy, ux) + (r() < 0.5 ? Math.PI : 0);
        const turn = stopped
          ? Math.atan2(uy, ux) - (side * Math.PI) / 2
          : along + (r() - 0.5) * 0.3;
        if (
          Math.hypot(p[0], p[1]) > reach ||
          inSite(p, site, 1) ||
          onRoad(p, 0) ||
          inBuilding(p, built)
        )
          continue;
        out.push(person(p[0], p[1], turn, r));
      }
    }
  }
  return out;
}

/**
 * About `count` people on an open plaza: inside `area`, clear of every rect
 * in `avoid` (buildings, grown a little) and of `keepOut`. Some stand in
 * twos and threes, facing each other. Seeded by `seed`.
 */
export function plazaPeople(
  area: readonly SPoint[],
  avoid: readonly SiteRect[],
  keepOut: SiteRect | null,
  count: number,
  seed: number,
): Person[] {
  const r = seeded(seed);
  const xs = area.map((p) => p[0]);
  const ys = area.map((p) => p[1]);
  const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const clear = (p: SPoint): boolean =>
    insidePolygon(p, area) &&
    !avoid.some((a) => inSite(p, a, 0)) &&
    !(keepOut && inSite(p, keepOut, 0));
  const out: Person[] = [];
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    const c: SPoint = [x1 + r() * (x2 - x1), y1 + r() * (y2 - y1)];
    if (!clear(c)) continue;
    const group = r() < 0.3 ? 2 + Math.floor(r() * 2) : 1;
    for (let g = 0; g < group && out.length < count; g++) {
      const ang = (g / group) * Math.PI * 2 + r();
      const p: SPoint = group > 1 ? [c[0] + Math.cos(ang) * 0.6, c[1] + Math.sin(ang) * 0.6] : c;
      if (!clear(p)) continue;
      // In a group, face its middle; alone, any way.
      const turn = group > 1 ? Math.atan2(c[1] - p[1], c[0] - p[0]) : r() * Math.PI * 2;
      out.push(person(p[0], p[1], turn, r));
    }
  }
  return out;
}

/** How far a point is outside a rect (0 inside it). */
function outside(p: SPoint, rect: SiteRect): number {
  const dx = Math.max(rect.x1 - p[0], 0, p[0] - rect.x2);
  const dy = Math.max(rect.y1 - p[1], 0, p[1] - rect.y2);
  return Math.hypot(dx, dy);
}

/**
 * Cycle rickshaws waiting for fares where a street runs along the campus's
 * edge: up to `max` rows of them, each parked nose-in at an angle to the kerb
 * on the campus's side, at least 40 m apart. Out of buildings and off the
 * site. Seeded.
 */
export function rickshawStands(data: Surroundings, site: SiteRect, max = 6): Vehicle[] {
  const r = seeded(4900);
  const built = boxes(
    data.buildings.map((b) => b.outline),
    0.3,
  );
  // Each stretch of road that runs within 20 m of the site's edge.
  const runs: Array<{
    a: SPoint;
    ux: number;
    uy: number;
    from: number;
    to: number;
    side: number;
    half: number;
  }> = [];
  for (const rd of data.roads) {
    if (TRAFFIC[rd.kind] === undefined || rd.width < 4) continue;
    for (let i = 1; i < rd.path.length; i++) {
      const a = rd.path[i - 1];
      const b = rd.path[i];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 10) continue;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      let from = -1;
      const close = (s: number): boolean => {
        const d = outside([a[0] + ux * s, a[1] + uy * s], site);
        return d > 0 && d <= 20;
      };
      for (let s = 0; s <= len; s += 2) {
        if (close(s) && from < 0) from = s;
        if ((!close(s) || s + 2 > len) && from >= 0) {
          const to = close(s) ? s : s - 2;
          if (to - from >= 10) {
            // The kerb on the site's side: whichever side's kerb is nearer it.
            const m = (from + to) / 2;
            const at = (side: number): SPoint => [
              a[0] + ux * m - uy * side * rd.width,
              a[1] + uy * m + ux * side * rd.width,
            ];
            const side = outside(at(1), site) < outside(at(-1), site) ? 1 : -1;
            runs.push({ a, ux, uy, from, to, side, half: rd.width / 2 });
          }
          from = -1;
        }
      }
    }
  }
  runs.sort((p, q) => q.to - q.from - (p.to - p.from));
  const out: Vehicle[] = [];
  const stands: SPoint[] = [];
  for (const run of runs) {
    if (stands.length >= max) break;
    const mid: SPoint = [
      run.a[0] + run.ux * ((run.from + run.to) / 2),
      run.a[1] + run.uy * ((run.from + run.to) / 2),
    ];
    if (stands.some((s) => Math.hypot(s[0] - mid[0], s[1] - mid[1]) < 40)) continue;
    stands.push(mid);
    const n = Math.min(12, Math.floor((run.to - run.from - 2) / 1.7));
    const off = run.half - 1.1;
    const heading = Math.atan2(run.uy, run.ux);
    for (let k = 0; k < n; k++) {
      const s = run.from + 1 + k * 1.7 + (r() - 0.5) * 0.3;
      const p: SPoint = [
        run.a[0] + run.ux * s - run.uy * off * run.side,
        run.a[1] + run.uy * s + run.ux * off * run.side,
      ];
      if (inSite(p, site, 1) || inBuilding(p, built)) continue;
      // Nose to the kerb, at an angle.
      const turn = heading + run.side * 1.1 + (r() - 0.5) * 0.5;
      out.push({ x: p[0], y: p[1], turn, kind: 'rickshaw', tone: r() });
    }
  }
  return out;
}
