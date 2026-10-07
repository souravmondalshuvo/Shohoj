/**
 * 3D scene for North South University's Campus Map.
 *
 * BRACU's map (campusScene.ts) is one tower; NSU is five buildings round a
 * courtyard, so this scene is organised by building, then floor:
 *
 *   - the whole campus: every building drawn storey by storey on the real
 *     site outline, each storey clickable;
 *   - one building: the others fade back;
 *   - one floor: the storeys above it lift away, and the floor shows a box
 *     for every scheduled room, coloured by whether a class is in it now and
 *     labelled with its number.
 *
 * Footprints, floor counts and the site are measured (src/core/campusNsu.ts).
 * Room positions are a number-order diagram, not a plan, and the page says so.
 *
 * Drawn entirely in code — no model file. Nothing animates: a change of focus
 * is a cut, and a frame is drawn only when something changed. The canvas is
 * presentation-only; the route mirrors every interaction in the DOM.
 */

import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  NSU_COURTYARD,
  NSU_FLOOR_HEIGHT,
  NSU_PLAYGROUND,
  NSU_SITE,
  layoutNsuFloor,
  type NsuBuildingId,
  type NsuCampusModel,
  type NsuRect,
} from '../../core/campusNsu.ts';
import type { RoomStatus, RoomTooltip } from './campusScene.ts';

export interface NsuSceneColors {
  roomFree: string;
  roomBusy: string;
  roomUnknown: string;
  highlight: string;
  floorPlate: string;
}

export interface NsuSceneOptions {
  colors: NsuSceneColors;
  /** A storey of a building was clicked. */
  onFloorClick?: (building: NsuBuildingId, floor: number) => void;
  onRoomClick?: (code: string) => void;
  /** Describe a room for its hover tooltip, or null to suppress it. */
  describeRoom?: (code: string) => RoomTooltip | null;
}

export interface NsuSceneHandle {
  /** Show the campus (null, null), one building (id, null) or one floor. */
  setFocus(building: NsuBuildingId | null, floor: number | null): void;
  setRoomStatus(status: ReadonlyMap<string, RoomStatus>): void;
  setHighlight(code: string | null): void;
  dispose(): void;
}

const H = NSU_FLOOR_HEIGHT;
const STOREY_HEIGHT = H * 0.8; // the gap between storeys reads as a floor line
const ROOM_HEIGHT = 2.4;
const PLATE_HEIGHT = 0.3;
const FADED_OPACITY = 0.07;
const BRICK = '#c9ab85';
const BRICK_SHADE = '#b89a76';
const GLASS = '#4f6f78';
const WINDOW_BAND_HEIGHT = 1.3;
const CLICK_SLOP_PX = 5;

/** Campus metres (x east, y north) to scene space (x east, y up, z south). */
function centre(rect: NsuRect): { x: number; z: number; width: number; depth: number } {
  return {
    x: (rect.x1 + rect.x2) / 2,
    z: -(rect.y1 + rect.y2) / 2,
    width: rect.x2 - rect.x1,
    depth: rect.y2 - rect.y1,
  };
}

/** A room number drawn onto a small texture, for the sprite above its box. */
function makeRoomLabel(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(14,26,19,0.86)';
    ctx.beginPath();
    ctx.roundRect(4, 8, 248, 80, 22);
    ctx.fill();
    ctx.fillStyle = '#f2f7f3';
    ctx.font = '700 44px "DM Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 50);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

interface StoreyEntry {
  building: NsuBuildingId;
  floor: number;
  mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  /** The storey's window band — dropped while the building is faded back. */
  band: Mesh;
}

interface RoomEntry {
  code: string;
  mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  label: Sprite;
}

/**
 * Create the scene inside `container`. Returns null when WebGL is unavailable
 * — the route then keeps only its DOM lists, which carry everything.
 */
export function createNsuCampusScene(
  container: HTMLElement,
  model: NsuCampusModel,
  options: NsuSceneOptions,
): NsuSceneHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const colors = options.colors;
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.75));
  scene.add(new HemisphereLight(new Color('#ffffff'), new Color('#c9ccc6'), 0.9));
  const sun = new DirectionalLight(0xffffff, 1.5);
  sun.position.set(-90, 160, 110);
  scene.add(sun);

  // Geometry and materials made here are tracked so dispose() frees them all.
  const disposables: Array<{ dispose(): void }> = [];
  function track<T extends { dispose(): void }>(item: T): T {
    disposables.push(item);
    return item;
  }
  function flat(color: string, opacity = 1): MeshStandardMaterial {
    return track(
      new MeshStandardMaterial({
        color: new Color(color),
        roughness: 0.9,
        metalness: 0,
        transparent: opacity < 1,
        opacity,
      }),
    );
  }
  function slab(rect: NsuRect, y: number, height: number, material: MeshStandardMaterial): Mesh {
    const c = centre(rect);
    const mesh = new Mesh(track(new BoxGeometry(c.width, height, c.depth)), material);
    mesh.position.set(c.x, y, c.z);
    scene.add(mesh);
    return mesh;
  }

  // --- Site ----------------------------------------------------------------
  slab(NSU_SITE, -0.35, 0.5, flat('#dcdad0'));
  slab(NSU_COURTYARD, -0.05, 0.12, flat('#b9b3a4'));
  slab(NSU_PLAYGROUND, -0.05, 0.12, flat('#6f9d62'));

  // --- Buildings -----------------------------------------------------------
  const storeyGroup = new Group();
  scene.add(storeyGroup);
  const storeys: StoreyEntry[] = [];
  const roofs = new Map<NsuBuildingId, Mesh[]>();
  const nameLabels = new Map<NsuBuildingId, Sprite>();

  /** Fade a material back, or restore it. `transparent` is baked into the
   *  compiled shader, so flipping it needs a recompile. */
  function setFaded(material: MeshStandardMaterial, faded: boolean): void {
    if (material.transparent !== faded) {
      material.transparent = faded;
      material.needsUpdate = true;
    }
    material.opacity = faded ? FADED_OPACITY : 1;
    material.depthWrite = !faded;
  }

  for (const { building } of model.buildings) {
    const c = centre(building.rect);
    const geometry = track(new BoxGeometry(c.width, STOREY_HEIGHT, c.depth));
    // A ribbon of glass round each storey, proud of the brick by a hand's width.
    const bandGeometry = track(new BoxGeometry(c.width + 0.3, WINDOW_BAND_HEIGHT, c.depth + 0.3));
    for (let floor = 1; floor <= building.levels; floor += 1) {
      // Materials per storey: each fades or hides on its own.
      const material = flat(floor % 2 === 0 ? BRICK : BRICK_SHADE);
      const mesh = new Mesh(geometry, material);
      mesh.position.set(c.x, (floor - 1) * H + STOREY_HEIGHT / 2, c.z);
      mesh.userData['building'] = building.id;
      mesh.userData['floor'] = floor;
      const bandMaterial = flat(GLASS);
      bandMaterial.roughness = 0.35;
      // A child, so it hides with its storey; the raycaster is not recursive,
      // so a click still lands on the storey itself.
      const band = new Mesh(bandGeometry, bandMaterial);
      mesh.add(band);
      storeyGroup.add(mesh);
      storeys.push({ building: building.id, floor, mesh, band });
    }
    const top = building.levels * H;
    const roofMeshes: Mesh[] = [];
    const roofMaterial = flat('#e3e0d6');
    const roof = new Mesh(track(new BoxGeometry(c.width + 0.6, 0.5, c.depth + 0.6)), roofMaterial);
    roof.position.set(c.x, top - (H - STOREY_HEIGHT) + 0.25, c.z);
    scene.add(roof);
    roofMeshes.push(roof);
    if (building.id === 'OAT') {
      // The auditorium's curved roof: the one silhouette on campus that is
      // not a box, and how the building is recognised from the air.
      const vault = new Mesh(
        track(new CylinderGeometry(c.width / 2, c.width / 2, c.depth * 0.7, 24, 1, false, 0, Math.PI)),
        flat('#8f9aa0'),
      );
      vault.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      vault.scale.set(1, 1, 0.22);
      vault.position.set(c.x, top, c.z);
      scene.add(vault);
      roofMeshes.push(vault);
    }
    if (building.id === 'ADM') {
      // The entrance front: rust-red cladding facing the main road.
      const front = new Mesh(track(new BoxGeometry(1.2, top - 1, c.depth * 0.82)), flat('#8a4a2f'));
      front.position.set(building.rect.x1 - 0.7, (top - 1) / 2, c.z);
      scene.add(front);
      roofMeshes.push(front);
    }
    roofs.set(building.id, roofMeshes);

    const nameLabel = new Sprite(
      track(
        new SpriteMaterial({
          map: track(makeRoomLabel(building.shortName)),
          transparent: true,
          depthTest: false,
        }),
      ),
    );
    nameLabel.scale.set(26, 9.75, 1);
    nameLabel.position.set(c.x, top + 9, c.z);
    nameLabel.renderOrder = 4;
    scene.add(nameLabel);
    nameLabels.set(building.id, nameLabel);
  }

  // --- Focused floor: plate + rooms ---------------------------------------
  const roomGroup = new Group();
  scene.add(roomGroup);
  const plate = new Mesh(track(new BoxGeometry(1, PLATE_HEIGHT, 1)), flat(colors.floorPlate));
  plate.visible = false;
  scene.add(plate);

  let focusBuilding: NsuBuildingId | null = null;
  let focusFloor: number | null = null;
  let statusByCode: ReadonlyMap<string, RoomStatus> = new Map();
  let highlightCode: string | null = null;
  let roomEntries: RoomEntry[] = [];

  function roomColor(code: string): string {
    if (code === highlightCode) return colors.highlight;
    const status = statusByCode.get(code);
    return status === 'free'
      ? colors.roomFree
      : status === 'busy'
        ? colors.roomBusy
        : colors.roomUnknown;
  }

  function clearRooms(): void {
    for (const entry of roomEntries) {
      roomGroup.remove(entry.mesh, entry.label);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
      entry.label.material.map?.dispose();
      entry.label.material.dispose();
    }
    roomEntries = [];
  }

  function buildRooms(): void {
    clearRooms();
    const entry = model.buildings.find((b) => b.building.id === focusBuilding);
    const floor = entry?.floors.find((f) => f.floor === focusFloor);
    if (!entry || !floor) return;
    const base = (floor.floor - 1) * H + PLATE_HEIGHT;
    for (const slot of layoutNsuFloor(entry.building, floor.rooms)) {
      const material = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 });
      const mesh = new Mesh(new BoxGeometry(slot.width, ROOM_HEIGHT, slot.depth), material);
      mesh.position.set(slot.x, base + ROOM_HEIGHT / 2, -slot.y);
      mesh.userData['roomCode'] = slot.code;
      // The label shows the number within the building: "210", not "NAC210".
      const label = new Sprite(
        new SpriteMaterial({
          map: makeRoomLabel(slot.code.slice(3)),
          transparent: true,
          depthTest: false,
        }),
      );
      label.scale.set(8, 3, 1);
      label.position.set(slot.x, base + ROOM_HEIGHT + 1.9, -slot.y);
      label.renderOrder = 5;
      roomGroup.add(mesh, label);
      roomEntries.push({ code: slot.code, mesh, label });
    }
    paintRooms();
  }

  function paintRooms(): void {
    for (const entry of roomEntries) {
      const color = roomColor(entry.code);
      entry.mesh.material.color.set(color);
      entry.mesh.material.emissive.set(color);
      entry.mesh.material.emissiveIntensity = entry.code === highlightCode ? 0.5 : 0.1;
    }
  }

  // --- Camera --------------------------------------------------------------
  const camera = new PerspectiveCamera(42, 1, 0.5, 1200);
  const controls = new OrbitControls(camera, renderer.domElement);
  // No damping: without an animation loop there is nothing to carry it.
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 25;
  controls.maxDistance = 520;

  // The viewing direction is the viewer's once they orbit; a change of focus
  // moves what is looked at and how far away, never the bearing.
  const bearing = new Vector3(-0.42, 0.62, 0.66).normalize();
  function frame(target: Vector3, distance: number): void {
    const offset = camera.position.clone().sub(controls.target);
    const direction = offset.lengthSq() > 1 ? offset.normalize() : bearing.clone();
    // A portrait canvas sees less to either side: stand further back.
    const reach = distance * Math.min(Math.max(1.25 / camera.aspect, 1), 1.9);
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, reach);
    controls.update();
  }

  function applyFocus(): void {
    const focused = model.buildings.find((b) => b.building.id === focusBuilding) ?? null;
    for (const storey of storeys) {
      const own = storey.building === focusBuilding;
      // Above an open floor the building is lifted away entirely.
      const hidden = own && focusFloor !== null && storey.floor >= focusFloor;
      const faded = focusBuilding !== null && !own;
      storey.mesh.visible = !hidden;
      // Ten translucent storeys already read as a ghost of the building; ten
      // more layers of glass on top of them turn it to smoke.
      storey.band.visible = !faded;
      setFaded(storey.mesh.material, faded);
    }
    // Names orient the whole-campus view; once a building is open they are in
    // the way of it.
    for (const label of nameLabels.values()) label.visible = focusBuilding === null;
    for (const [id, meshes] of roofs) {
      const own = id === focusBuilding;
      const faded = focusBuilding !== null && !own;
      for (const mesh of meshes) {
        mesh.visible = !(own && focusFloor !== null);
        setFaded(mesh.material as MeshStandardMaterial, faded);
      }
    }

    if (focused && focusFloor !== null) {
      const c = centre(focused.building.rect);
      const y = (focusFloor - 1) * H;
      plate.visible = true;
      plate.scale.set(c.width, 1, c.depth);
      plate.position.set(c.x, y + PLATE_HEIGHT / 2, c.z);
      buildRooms();
      frame(new Vector3(c.x, y, c.z), Math.max(c.width, c.depth) * 1.05 + 30);
    } else {
      plate.visible = false;
      clearRooms();
      if (focused) {
        const c = centre(focused.building.rect);
        const height = focused.building.levels * H;
        frame(new Vector3(c.x, height / 2, c.z), Math.max(c.width, c.depth, height) * 1.25 + 40);
      } else {
        frame(new Vector3(0, 12, 0), 265);
      }
    }
    hideTooltip();
    invalidate();
  }

  // --- Tooltip (same DOM and classes as BRACU's scene) ---------------------
  const tooltip = document.createElement('div');
  tooltip.className = 'campus-tooltip';
  tooltip.setAttribute('data-testid', 'campus-tooltip');
  tooltip.setAttribute('role', 'status');
  tooltip.hidden = true;
  const tooltipTitle = document.createElement('strong');
  tooltipTitle.className = 'campus-tooltip-title';
  const tooltipDetail = document.createElement('span');
  tooltipDetail.className = 'campus-tooltip-detail';
  tooltip.append(tooltipTitle, tooltipDetail);
  container.appendChild(tooltip);

  function hideTooltip(): void {
    if (tooltip.hidden) return;
    tooltip.hidden = true;
    renderer.domElement.style.cursor = '';
  }

  // --- Render on demand ----------------------------------------------------
  let frameRequest = 0;
  let disposed = false;
  function invalidate(): void {
    if (disposed || frameRequest !== 0) return;
    frameRequest = requestAnimationFrame(() => {
      frameRequest = 0;
      renderer.render(scene, camera);
    });
  }
  controls.addEventListener('change', invalidate);

  function resize(): void {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  }
  resize();
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);

  // --- Picking -------------------------------------------------------------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  function aim(event: PointerEvent): void {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }
  function roomAt(event: PointerEvent): string | null {
    aim(event);
    const hit = raycaster.intersectObjects(
      roomEntries.map((entry) => entry.mesh),
      false,
    )[0];
    const code: unknown = hit?.object.userData['roomCode'];
    return typeof code === 'string' ? code : null;
  }

  let downX = 0;
  let downY = 0;
  const onPointerDown = (event: PointerEvent): void => {
    downX = event.clientX;
    downY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent): void => {
    // A drag is an orbit, not a click.
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_SLOP_PX) return;
    const code = roomAt(event);
    if (code !== null) {
      options.onRoomClick?.(code);
      return;
    }
    const hit = raycaster.intersectObjects(
      storeys.filter((storey) => storey.mesh.visible).map((storey) => storey.mesh),
      false,
    )[0];
    const building: unknown = hit?.object.userData['building'];
    const floor: unknown = hit?.object.userData['floor'];
    if (typeof building === 'string' && typeof floor === 'number') {
      options.onFloorClick?.(building as NsuBuildingId, floor);
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    const code = event.pointerType === 'mouse' ? roomAt(event) : null;
    const described = code !== null ? (options.describeRoom?.(code) ?? null) : null;
    if (!described) {
      hideTooltip();
      return;
    }
    const bounds = container.getBoundingClientRect();
    tooltipTitle.textContent = described.title;
    tooltipDetail.textContent = described.detail;
    tooltip.dataset['status'] = described.status;
    tooltip.style.left = `${event.clientX - bounds.left + 12}px`;
    tooltip.style.top = `${event.clientY - bounds.top + 12}px`;
    tooltip.hidden = false;
    renderer.domElement.style.cursor = 'pointer';
  };
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', hideTooltip);

  applyFocus();

  return {
    setFocus(building, floor) {
      const nextFloor = building === null ? null : floor;
      if (building === focusBuilding && nextFloor === focusFloor) return;
      focusBuilding = building;
      focusFloor = nextFloor;
      applyFocus();
    },
    setRoomStatus(status) {
      statusByCode = status;
      paintRooms();
      invalidate();
    },
    setHighlight(code) {
      highlightCode = code;
      paintRooms();
      invalidate();
    },
    dispose() {
      disposed = true;
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest);
      resizeObserver?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', hideTooltip);
      controls.dispose();
      clearRooms();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      canvas.remove();
      tooltip.remove();
    },
  };
}
