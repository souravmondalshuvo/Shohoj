/**
 * BRAC University's Residential Campus at Khagan, Savar, in 3D (#978).
 *
 * Every BRACU undergraduate spends the Residential Semester here. The page
 * shows the campus as public sources have it — OpenStreetMap's wall and
 * footprints, the RS handbooks' names, the satellite image's roofs — and says
 * for every building how much of it is known. Reached at
 * /campus/?campus=bracu-rs, linked from BRACU's Campus Map.
 *
 * The 3D view is presentation only: every building can be chosen from the
 * list, and the list carries everything the view does.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  RS_BUILDINGS,
  RS_GROUNDS,
  RS_TREES,
  RS_WALL,
  polygonArea,
  polygonCentre,
  rsBuilding,
  rsLevelsConfirmed,
  rsLevelsSourceLabel,
  rsToLatLon,
} from '../../core/campusBracuRs';
import { createRsCampusScene, type RsSceneHandle } from '../../features/campus/rsCampusScene';

const HANDBOOK_URL =
  'https://www.bracu.ac.bd/sites/default/files/uploads/2026/01/24/RS%20Handbook,%20Spring%202026.pdf';
const RS_PAGE_URL = 'https://www.bracu.ac.bd/student-life/residential-semester';
const OSM_CAMPUS_URL = 'https://www.openstreetmap.org/way/1236280123';

const ACRES = Math.abs(polygonArea(RS_WALL)) / 4046.86;

/** Named buildings first, then the rest by size. */
const BUILDING_ORDER = [...RS_BUILDINGS].sort((a, b) => {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  return Math.abs(polygonArea(b.footprint)) - Math.abs(polygonArea(a.footprint));
});

function storeys(n: number): string {
  return n === 1 ? '1 storey' : `${n} storeys`;
}

function osmMapUrl(id: string): string {
  const b = rsBuilding(id);
  if (!b) return OSM_CAMPUS_URL;
  if (b.osmWay !== null) return `https://www.openstreetmap.org/way/${b.osmWay}`;
  const { lat, lon } = rsToLatLon(polygonCentre(b.footprint));
  return `https://www.openstreetmap.org/#map=20/${lat.toFixed(6)}/${lon.toFixed(6)}`;
}

export function RsCampus() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = rsBuilding(searchParams.get('building'));
  const [selected, setSelected] = useState<string | null>(requested?.id ?? null);
  const [labels, setLabels] = useState(true);
  const [webglOk, setWebglOk] = useState(true);
  const canvasHost = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RsSceneHandle | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const select = useCallback(
    (id: string | null, reframe: boolean) => {
      setSelected(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('building', id);
          else next.delete('building');
          return next;
        },
        { replace: true },
      );
      if (reframe) sceneRef.current?.frame(id);
    },
    [setSearchParams],
  );
  const selectRef = useRef(select);
  selectRef.current = select;

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    // Through a ref: setSearchParams changes with every URL change, and the
    // scene must not be torn down (and its camera reset) on each selection.
    const handle = createRsCampusScene(host, { onSelect: (id) => selectRef.current(id, false) });
    if (!handle) {
      setWebglOk(false);
      return;
    }
    sceneRef.current = handle;
    const initial = selectedRef.current;
    if (initial) {
      handle.setSelected(initial);
      handle.frame(initial);
    }
    return () => {
      sceneRef.current = null;
      handle.dispose();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setSelected(selected);
  }, [selected]);
  useEffect(() => {
    sceneRef.current?.setLabels(labels);
  }, [labels]);

  const current = rsBuilding(selected);
  const confirmed = current ? rsLevelsConfirmed(current) : false;

  return (
    <section className="shell-page campus-page" data-testid="campus-page" data-campus="bracu-rs">
      <h1>Campus Map</h1>
      <p className="shell-muted">
        BRAC University&apos;s Residential Campus at Khagan, Birulia, Savar, where every BRACU
        undergraduate spends the Residential Semester. Pick a building to see what it is and how
        much of it is known.
      </p>

      <div className="campus-meta">
        <span className="campus-meta-item" data-testid="campus-site">
          {ACRES.toFixed(1)} acres inside the wall · {RS_BUILDINGS.length} buildings ·{' '}
          {RS_TREES.length} trees
        </span>
        <a className="shell-btn campus-meta-btn" href="./" data-testid="campus-other-site">
          Merul Badda campus
        </a>
      </div>

      <div
        className="campus-floors"
        role="group"
        aria-label="Building"
        data-testid="campus-buildings"
      >
        <button
          type="button"
          className={
            selected === null ? 'campus-floor-btn campus-floor-btn--active' : 'campus-floor-btn'
          }
          aria-pressed={selected === null}
          onClick={() => select(null, true)}
        >
          Whole campus
        </button>
        {BUILDING_ORDER.map((b) => (
          <button
            key={b.id}
            type="button"
            className={
              selected === b.id ? 'campus-floor-btn campus-floor-btn--active' : 'campus-floor-btn'
            }
            aria-pressed={selected === b.id}
            data-building={b.id}
            onClick={() => select(b.id, true)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="campus-controls">
        <button
          type="button"
          className="shell-btn campus-meta-btn"
          aria-pressed={labels}
          data-testid="campus-labels"
          onClick={() => setLabels((on) => !on)}
        >
          {labels ? 'Hide names' : 'Show names'}
        </button>
        <button
          type="button"
          className="shell-btn campus-meta-btn"
          data-testid="campus-reset-view"
          onClick={() => sceneRef.current?.frame(selected)}
        >
          Reset view
        </button>
      </div>

      {webglOk ? (
        <div
          className="campus-canvas"
          ref={canvasHost}
          aria-hidden="true"
          data-testid="campus-canvas"
        />
      ) : (
        <p className="shell-muted" data-testid="campus-no-webgl">
          3D view isn&apos;t available on this device — the building list shows everything the map
          does.
        </p>
      )}
      <p className="shell-muted" data-testid="campus-attribution">
        Map data © OpenStreetMap contributors · satellite reading: Esri World Imagery
      </p>

      {current ? (
        <div
          className="campus-room-panel"
          data-testid="campus-building-panel"
          data-building={current.id}
        >
          <div className="campus-room-head">
            <strong>{current.label}</strong>
            {current.aka && <span className="shell-muted">also written {current.aka}</span>}
          </div>
          <p className="campus-room-status" data-testid="campus-building-levels">
            {storeys(current.levels)} — {rsLevelsSourceLabel(current.levelsFrom)}
            {confirmed ? '' : ' (not confirmed)'}
          </p>
          <p>{current.about}</p>
          <p className="shell-muted">
            Footprint about {Math.round(Math.abs(polygonArea(current.footprint)))} m² ·{' '}
            <a href={osmMapUrl(current.id)} target="_blank" rel="noreferrer">
              {current.osmWay !== null ? 'Outline on OpenStreetMap' : 'Place on OpenStreetMap'}
            </a>
          </p>
        </div>
      ) : (
        <p className="shell-muted" data-testid="campus-hint">
          Drag to turn the campus, scroll or pinch to zoom, and click a building to read about it.
        </p>
      )}

      <details className="campus-other" data-testid="campus-grounds">
        <summary>Fields and grounds</summary>
        <ul className="campus-room-schedule">
          {RS_GROUNDS.filter((g) => g.kind !== 'garden').map((g) => (
            <li key={g.id}>
              <strong>{g.name ?? 'Unnamed'}</strong> — {g.about}
            </li>
          ))}
          <li>
            <strong>Gardens</strong> — three, between the dormitories and round the water tower.
          </li>
          <li>
            <strong>Water tower and two sculptures</strong> — where OpenStreetMap has them; their
            shapes are not published, so the map draws plain stand-ins.
          </li>
        </ul>
      </details>

      <details className="campus-evidence" data-testid="campus-evidence">
        <summary>How accurate is this map?</summary>
        <p>
          <strong>Measured:</strong> the campus wall, the buildings&apos; outlines and where they
          stand, the fields, the court, the gardens and the roads, from OpenStreetMap. Two small
          sheds OpenStreetMap does not have are traced from the satellite image (5 February 2026),
          and trees are placed where that image shows a canopy.
        </p>
        <p>
          <strong>Read from sources:</strong> the names Nikunja, Maloncho, Anandapur, Duronto and
          Durbar, from OpenStreetMap and the RS handbook. Roof shapes and colours come from the
          satellite image, and wall finishes from the handbook&apos;s photographs. They are right in
          kind, not in every dimension.
        </p>
        <p>
          <strong>Estimated:</strong> any storey count not marked as from OpenStreetMap. A building
          with no name in any source is described, not named, and what most buildings are used for
          is not published. Interiors are not drawn, and the buildings outside the wall are drawn at
          one uniform height because none of their heights is known. Do not use this map to find an
          exit.
        </p>
        <div className="campus-evidence-links">
          <a href={OSM_CAMPUS_URL} target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>
          <a href={HANDBOOK_URL} target="_blank" rel="noreferrer">
            RS handbook (Spring 2026)
          </a>
          <a href={RS_PAGE_URL} target="_blank" rel="noreferrer">
            BRACU Residential Semester
          </a>
        </div>
        <p className="shell-muted">
          Map data © OpenStreetMap contributors. Satellite reading: Esri World Imagery (Maxar
          WorldView-2).
        </p>
      </details>
    </section>
  );
}
