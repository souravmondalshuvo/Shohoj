/**
 * Procedural 3D campus scene for the /campus route (#370).
 *
 * Renders the Merul Badda tower as stacked floor slabs generated purely from
 * the CampusModel (no hand-authored 3D asset): every floor that has rooms in
 * the live feed is interactive; podium floors below the first data floor are
 * inert context so the shape still reads as the real 13-story building.
 *
 * Selecting a floor "explodes" the stack — floors above lift and fade — and
 * the selected slab grows room boxes, one per room, clustered by zone in a
 * ring around the slab's center (the tower is built around a central void).
 * Room boxes recolor live from the free/busy status map.
 *
 * React-free on purpose: the route owns state and calls the returned handle;
 * the scene only reports clicks. The canvas is presentation-only — every
 * interaction here is mirrored by accessible DOM controls in the route.
 */

import {
    AmbientLight,
    BoxGeometry,
    Color,
    DirectionalLight,
    Group,
    Mesh,
    MeshLambertMaterial,
    PerspectiveCamera,
    Raycaster,
    Scene,
    Vector2,
    WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { CampusModel, ParsedRoom } from '../../core/campusRooms';

export type RoomStatus = 'free' | 'busy';

export interface CampusSceneColors {
    slab: string;
    slabInactive: string;
    slabSelected: string;
    roomFree: string;
    roomBusy: string;
    roomUnknown: string;
    highlight: string;
}

export interface CampusSceneOptions {
    colors: CampusSceneColors;
    onFloorClick?: (floor: number) => void;
    onRoomClick?: (code: string) => void;
}

export interface CampusSceneHandle {
    /** Focus a floor (explode the stack there) or null to show the tower. */
    setFloor(floor: number | null): void;
    /** Recolor the focused floor's rooms from a code → status map. */
    setRoomStatus(status: ReadonlyMap<string, RoomStatus>): void;
    /** Emphasize one room (deep link / selection), or clear with null. */
    setHighlight(code: string | null): void;
    dispose(): void;
}

// Slab / layout constants (world units; the tower footprint is ~30 wide).
const SLAB_W = 30;
const SLAB_D = 30;
const SLAB_H = 0.7;
const FLOOR_GAP = 2.4;          // vertical distance between slab centers
const EXPLODE_LIFT = 7;         // extra lift for floors above the focused one
const ROOM_SIZE = 1.7;
const ROOM_H = 1.3;
const ZONE_RING_RADIUS = 10;    // zone clusters sit on this ring
const PODIUM_FLOORS_MIN = 1;    // render context floors from 1 upward

interface FloorEntry {
    floor: number;
    interactive: boolean;
    baseY: number;
    mesh: Mesh<BoxGeometry, MeshLambertMaterial>;
}

interface RoomEntry {
    room: ParsedRoom;
    mesh: Mesh<BoxGeometry, MeshLambertMaterial>;
}

/**
 * Create the scene inside `container`. Returns null when WebGL is
 * unavailable — the route then keeps only the DOM list view.
 */
export function createCampusScene(
    container: HTMLElement,
    model: CampusModel,
    options: CampusSceneOptions,
): CampusSceneHandle | null {
    let renderer: WebGLRenderer;
    try {
        renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
        return null;
    }

    const colors = options.colors;
    const scene = new Scene();

    const maxFloor = model.floors.length
        ? model.floors[model.floors.length - 1].floor
        : PODIUM_FLOORS_MIN;
    const dataFloors = new Map(model.floors.map((f) => [f.floor, f]));
    const towerHeight = (maxFloor - PODIUM_FLOORS_MIN) * FLOOR_GAP;

    // --- Lights ------------------------------------------------------------
    scene.add(new AmbientLight(0xffffff, 0.9));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(40, 70, 25);
    scene.add(sun);

    // --- Floor slabs ---------------------------------------------------------
    const slabGeometry = new BoxGeometry(SLAB_W, SLAB_H, SLAB_D);
    const floorGroup = new Group();
    scene.add(floorGroup);

    const floors: FloorEntry[] = [];
    for (let floor = PODIUM_FLOORS_MIN; floor <= maxFloor; floor++) {
        const interactive = dataFloors.has(floor);
        const material = new MeshLambertMaterial({
            color: new Color(interactive ? colors.slab : colors.slabInactive),
            transparent: true,
        });
        const mesh = new Mesh(slabGeometry, material);
        const baseY = (floor - PODIUM_FLOORS_MIN) * FLOOR_GAP;
        mesh.position.set(0, baseY, 0);
        mesh.userData.floor = floor;
        mesh.userData.interactive = interactive;
        floorGroup.add(mesh);
        floors.push({ floor, interactive, baseY, mesh });
    }

    // --- Rooms (built per focused floor) ------------------------------------
    const roomGeometry = new BoxGeometry(ROOM_SIZE, ROOM_H, ROOM_SIZE);
    const roomGroup = new Group();
    scene.add(roomGroup);

    let roomEntries: RoomEntry[] = [];
    let focusedFloor: number | null = null;
    let statusByCode: ReadonlyMap<string, RoomStatus> = new Map();
    let highlightCode: string | null = null;

    function roomColor(room: ParsedRoom): string {
        if (room.code === highlightCode) return colors.highlight;
        const status = statusByCode.get(room.code);
        if (status === 'free') return colors.roomFree;
        if (status === 'busy') return colors.roomBusy;
        return colors.roomUnknown;
    }

    function clearRooms(): void {
        for (const entry of roomEntries) {
            roomGroup.remove(entry.mesh);
            entry.mesh.material.dispose();
        }
        roomEntries = [];
    }

    /** Zone clusters ring the slab; rooms grid up in twos inside a cluster. */
    function buildRooms(floor: number): void {
        clearRooms();
        const data = dataFloors.get(floor);
        const slab = floors.find((f) => f.floor === floor);
        if (!data || !slab) return;

        const zoneCount = data.zones.length;
        data.zones.forEach((zone, zoneIndex) => {
            const angle = (zoneIndex / zoneCount) * Math.PI * 2 - Math.PI / 2;
            const cx = Math.cos(angle) * ZONE_RING_RADIUS;
            const cz = Math.sin(angle) * ZONE_RING_RADIUS;
            zone.rooms.forEach((room, roomIndex) => {
                const col = roomIndex % 2;
                const row = Math.floor(roomIndex / 2);
                const material = new MeshLambertMaterial({
                    color: new Color(roomColor(room)),
                });
                const mesh = new Mesh(roomGeometry, material);
                mesh.position.set(
                    cx + (col - 0.5) * (ROOM_SIZE + 0.5),
                    slab.mesh.position.y + SLAB_H / 2 + ROOM_H / 2,
                    cz + (row - (zone.rooms.length / 2 - 0.5) / 2) * (ROOM_SIZE + 0.5),
                );
                mesh.userData.roomCode = room.code;
                roomGroup.add(mesh);
                roomEntries.push({ room, mesh });
            });
        });
    }

    function refreshRoomColors(): void {
        for (const entry of roomEntries) {
            entry.mesh.material.color.set(roomColor(entry.room));
        }
    }

    function applyFloorFocus(): void {
        for (const f of floors) {
            const isFocused = focusedFloor !== null && f.floor === focusedFloor;
            const lifted = focusedFloor !== null && f.floor > focusedFloor;
            f.mesh.position.y = f.baseY + (lifted ? EXPLODE_LIFT : 0);
            f.mesh.material.opacity =
                focusedFloor === null ? 1 : isFocused ? 1 : lifted ? 0.18 : 0.55;
            f.mesh.material.color.set(
                isFocused ? colors.slabSelected
                    : f.interactive ? colors.slab : colors.slabInactive,
            );
        }
        if (focusedFloor !== null) buildRooms(focusedFloor);
        else clearRooms();
    }

    // --- Renderer / camera / controls ---------------------------------------
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    const camera = new PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(46, towerHeight * 0.9 + 18, 46);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, towerHeight / 2, 0);
    controls.enableDamping = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minDistance = 18;
    controls.maxDistance = 160;

    function resize(): void {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(resize)
        : null;
    resizeObserver?.observe(container);

    renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
    });

    // --- Picking -------------------------------------------------------------
    // Click = pointerdown/up pair that barely moved, so orbit drags don't pick.
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let downAt: { x: number; y: number } | null = null;

    function pick(event: PointerEvent): void {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);

        const roomHit = raycaster.intersectObjects(roomGroup.children, false)[0];
        const code = roomHit?.object.userData.roomCode;
        if (typeof code === 'string') {
            options.onRoomClick?.(code);
            return;
        }
        const floorHit = raycaster
            .intersectObjects(floorGroup.children, false)
            .find((hit) => hit.object.userData.interactive === true);
        const floor = floorHit?.object.userData.floor;
        if (typeof floor === 'number') options.onFloorClick?.(floor);
    }

    const onPointerDown = (event: PointerEvent) => {
        downAt = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
        if (!downAt) return;
        const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
        downAt = null;
        if (moved < 6) pick(event);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    applyFloorFocus();

    return {
        setFloor(floor) {
            focusedFloor = floor !== null && dataFloors.has(floor) ? floor : null;
            applyFloorFocus();
        },
        setRoomStatus(status) {
            statusByCode = status;
            refreshRoomColors();
        },
        setHighlight(code) {
            highlightCode = code ? code.trim().toUpperCase() : null;
            refreshRoomColors();
        },
        dispose() {
            renderer.setAnimationLoop(null);
            resizeObserver?.disconnect();
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            renderer.domElement.removeEventListener('pointerup', onPointerUp);
            controls.dispose();
            clearRooms();
            for (const f of floors) f.mesh.material.dispose();
            slabGeometry.dispose();
            roomGeometry.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}
