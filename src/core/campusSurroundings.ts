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
