/**
 * Procedural 3D campus scene for the /campus route (#370, visuals #385).
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
 * The v2 look (#385) stays procedural: PBR materials under a sun + sky rig
 * with soft shadows, a translucent glass envelope with a fresnel edge glow and
 * architectural edge lines, and a ground plaza that the tower casts onto. The
 * sky/sun mood follows the viewer's real clock (day / golden hour / night) —
 * honest, like the free/busy data. Floors carry canvas-drawn number labels and
 * a per-floor occupancy heat tint, and rooms answer to hover (a DOM tooltip)
 * and the "only free" glow filter. Every label/texture is generated in code,
 * so the "no binary 3D assets" constraint from #370 still holds.
 *
 * React-free on purpose: the route owns state and calls the returned handle;
 * the scene only reports clicks and asks the route to describe a hovered room.
 * The canvas is presentation-only — every interaction here is mirrored by
 * accessible DOM controls in the route.
 */

import {
    AdditiveBlending,
    AmbientLight,
    BackSide,
    BoxGeometry,
    CanvasTexture,
    CircleGeometry,
    Color,
    DirectionalLight,
    EdgesGeometry,
    Group,
    HemisphereLight,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshStandardMaterial,
    PCFSoftShadowMap,
    PerspectiveCamera,
    Raycaster,
    Scene,
    ShaderMaterial,
    Sprite,
    SpriteMaterial,
    Vector2,
    WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import type { CampusModel, ParsedRoom } from '../../core/campusRooms';

export type RoomStatus = 'free' | 'busy';

/**
 * What a hovered room shows in its tooltip. The route builds this from the
 * schedule feed (the scene has no access to it), so the "next class" line stays
 * honest and in one place.
 */
export interface RoomTooltip {
    /** Heading, e.g. "09G-31T · Theater". */
    title: string;
    status: RoomStatus | 'unknown';
    /** One-line status detail, e.g. "In class · CSE220 until 12:20 PM". */
    detail: string;
}

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
    /** Describe a room for its hover tooltip, or null to suppress it. */
    describeRoom?: (code: string) => RoomTooltip | null;
}

export interface CampusSceneHandle {
    /** Focus a floor (explode the stack there) or null to show the tower. */
    setFloor(floor: number | null): void;
    /** Recolor the focused floor's rooms from a code → status map. */
    setRoomStatus(status: ReadonlyMap<string, RoomStatus>): void;
    /** Emphasize one room (deep link / selection), or clear with null. */
    setHighlight(code: string | null): void;
    /** Mirror the "only free rooms" filter: busy rooms dim, free rooms glow. */
    setOnlyFree(onlyFree: boolean): void;
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
const GROUND_RADIUS = 46;       // plaza disk the tower shadows onto
const SHELL_MARGIN = 2.4;       // glass envelope overhang past the slabs
const EASE_RATE = 7;            // exponential-damping rate for all transitions
const ROOM_POP_SECONDS = 0.35;  // per-room pop-in duration
const ROOM_STAGGER_SECONDS = 0.018; // spawn delay between successive rooms
const IDLE_ORBIT_AFTER_MS = 9000;   // idle time before the camera starts drifting
const HEAT_MAX_MIX = 0.55;      // how far a fully-busy floor tints toward "hot"

function easeOutCubic(x: number): number {
    return 1 - Math.pow(1 - x, 3);
}

/**
 * Blend a floor's base slab color toward a "hot" color by its busy fraction —
 * the per-floor occupancy heat tint (#385 liveness). Pure and exported so the
 * ramp can be unit-tested without WebGL. `fraction` is clamped to [0, 1] and
 * never mixes past HEAT_MAX_MIX, so even a packed floor stays legibly green.
 */
export function floorHeatColor(baseHex: string, hotHex: string, fraction: number): string {
    const mix = Math.max(0, Math.min(1, fraction)) * HEAT_MAX_MIX;
    return `#${new Color(baseHex).lerp(new Color(hotHex), mix).getHexString()}`;
}

/**
 * Sky/sun mood for the viewer's local hour — day, golden hour, night. Pure
 * and exported so the palette can be unit-tested without WebGL.
 */
export interface SkyMood {
    /** Hemisphere sky color (also tints the glass envelope). */
    sky: string;
    /** Hemisphere ground bounce color. */
    horizon: string;
    sunColor: string;
    sunIntensity: number;
}

export function skyMoodForHour(hour: number): SkyMood {
    if (hour >= 20 || hour < 5) {
        return { sky: '#42507a', horizon: '#232a3d', sunColor: '#b9ccff', sunIntensity: 0.55 };
    }
    if (hour < 8 || hour >= 17) {
        return { sky: '#ffd9a0', horizon: '#efe6da', sunColor: '#ffc37a', sunIntensity: 1.05 };
    }
    return { sky: '#cfe8ff', horizon: '#edf4ee', sunColor: '#fff6e2', sunIntensity: 1.3 };
}

interface FloorEntry {
    floor: number;
    interactive: boolean;
    baseY: number;
    mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
    // Edge label sprite ("7", "9", …) parented to the slab so it lifts with it.
    label: Sprite;
    labelMaterial: SpriteMaterial;
    labelTexture: CanvasTexture;
    // Animation targets — the render loop eases position/opacity/color here.
    targetY: number;
    targetOpacity: number;
    targetColor: Color;
}

interface RoomEntry {
    room: ParsedRoom;
    mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
    // Pop-in animation state (ms clock of the render loop) and pulse phase.
    spawnAt: number;
    stagger: number;
    phase: number;
    pulsing: boolean;
}

/** Draw "N" onto a small canvas texture for a floor's edge label sprite. */
function makeFloorLabelTexture(floor: number, interactive: boolean): CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const r = size * 0.36;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
        ctx.fillStyle = interactive ? 'rgba(18,40,26,0.82)' : 'rgba(60,66,62,0.55)';
        ctx.fill();
        ctx.lineWidth = size * 0.045;
        ctx.strokeStyle = interactive ? 'rgba(94,203,139,0.9)' : 'rgba(210,216,210,0.5)';
        ctx.stroke();
        ctx.fillStyle = '#f2f7f3';
        ctx.font = `700 ${size * 0.44}px "DM Sans", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(floor), size / 2, size / 2 + size * 0.03);
    }
    const texture = new CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
}

const FRESNEL_VERTEX = /* glsl */ `
    varying vec3 vNormalView;
    varying vec3 vViewDir;
    void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
    }
`;

const FRESNEL_FRAGMENT = /* glsl */ `
    uniform vec3 uColor;
    uniform float uPower;
    uniform float uOpacity;
    varying vec3 vNormalView;
    varying vec3 vViewDir;
    void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir))), uPower);
        gl_FragColor = vec4(uColor, rim * uOpacity);
    }
`;

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
    const heatHot = new Color(colors.roomBusy);
    const scene = new Scene();

    // One flag drives every animation decision: under prefers-reduced-motion
    // all transitions snap, rooms appear at full size, nothing pulses, and the
    // camera never drifts on its own.
    const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const maxFloor = model.floors.length
        ? model.floors[model.floors.length - 1].floor
        : PODIUM_FLOORS_MIN;
    const dataFloors = new Map(model.floors.map((f) => [f.floor, f]));
    const towerHeight = (maxFloor - PODIUM_FLOORS_MIN) * FLOOR_GAP;

    // --- Lights ------------------------------------------------------------
    // Low ambient so the sun + hemisphere carry the modeling; the mood tracks
    // the viewer's clock, so the building looks different at night than noon.
    const mood = skyMoodForHour(new Date().getHours());
    scene.add(new AmbientLight(0xffffff, 0.35));
    const hemi = new HemisphereLight(new Color(mood.sky), new Color(mood.horizon), 0.7);
    scene.add(hemi);
    const sun = new DirectionalLight(new Color(mood.sunColor), mood.sunIntensity);
    sun.position.set(40, 70, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 64;
    sun.shadow.camera.bottom = -48;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // --- Ground plaza --------------------------------------------------------
    const groundGeometry = new CircleGeometry(GROUND_RADIUS, 56).rotateX(-Math.PI / 2);
    const groundMaterial = new MeshStandardMaterial({
        color: new Color('#f2f7f3'),
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.55,
    });
    const ground = new Mesh(groundGeometry, groundMaterial);
    ground.position.y = -SLAB_H * 1.6;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- Floor slabs ---------------------------------------------------------
    const slabGeometry = new RoundedBoxGeometry(SLAB_W, SLAB_H, SLAB_D, 2, 0.28);
    const floorGroup = new Group();
    scene.add(floorGroup);

    // Per-floor busy fraction, filled by setRoomStatus and drives the heat tint.
    let floorBusyFraction = new Map<number, number>();

    const floors: FloorEntry[] = [];
    for (let floor = PODIUM_FLOORS_MIN; floor <= maxFloor; floor++) {
        const interactive = dataFloors.has(floor);
        const material = new MeshStandardMaterial({
            color: new Color(interactive ? colors.slab : colors.slabInactive),
            roughness: 0.8,
            metalness: 0.05,
            transparent: true,
        });
        const mesh = new Mesh(slabGeometry, material);
        const baseY = (floor - PODIUM_FLOORS_MIN) * FLOOR_GAP;
        mesh.position.set(0, baseY, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.floor = floor;
        mesh.userData.interactive = interactive;
        floorGroup.add(mesh);

        // Number label billboarded at the slab's front-right edge — always
        // camera-facing so it stays readable as the view orbits.
        const labelTexture = makeFloorLabelTexture(floor, interactive);
        const labelMaterial = new SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthWrite: false,
        });
        const label = new Sprite(labelMaterial);
        label.scale.set(3, 3, 1);
        label.position.set(SLAB_W / 2 + 1.4, 0.2, SLAB_D / 2 + 1.4);
        mesh.add(label);

        floors.push({
            floor,
            interactive,
            baseY,
            mesh,
            label,
            labelMaterial,
            labelTexture,
            targetY: baseY,
            targetOpacity: 1,
            targetColor: material.color.clone(),
        });
    }

    // --- Glass envelope ------------------------------------------------------
    // A translucent skin + a fresnel edge glow + crisp architectural edge lines
    // make the slab stack read as one building. All three fade almost out when
    // a floor is focused so the exploded view stays legible. Kept out of
    // floorGroup/roomGroup so the click raycaster never sees them.
    const shellGeometry = new BoxGeometry(
        SLAB_W + SHELL_MARGIN,
        towerHeight + FLOOR_GAP * 2,
        SLAB_D + SHELL_MARGIN,
    );
    const shellMaterial = new MeshStandardMaterial({
        color: new Color(mood.sky),
        transparent: true,
        opacity: 0.1,
        roughness: 0.15,
        metalness: 0.25,
        depthWrite: false,
    });
    const shell = new Mesh(shellGeometry, shellMaterial);
    shell.position.y = towerHeight / 2;
    shell.renderOrder = 2;
    scene.add(shell);

    // Fresnel rim: a back-side additive skin that lights up at grazing angles,
    // giving the glass a lit edge instead of a flat wash. Shares the shell
    // geometry (disposed once, with the shell).
    const fresnelMaterial = new ShaderMaterial({
        uniforms: {
            uColor: { value: new Color(mood.sunColor) },
            uPower: { value: 2.4 },
            uOpacity: { value: 0.5 },
        },
        vertexShader: FRESNEL_VERTEX,
        fragmentShader: FRESNEL_FRAGMENT,
        transparent: true,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
    });
    const fresnel = new Mesh(shellGeometry, fresnelMaterial);
    fresnel.position.copy(shell.position);
    fresnel.renderOrder = 2;
    scene.add(fresnel);

    const shellEdgesGeometry = new EdgesGeometry(shellGeometry);
    const shellEdgesMaterial = new LineBasicMaterial({
        color: new Color('#7fa9c9'),
        transparent: true,
        opacity: 0.35,
    });
    const shellEdges = new LineSegments(shellEdgesGeometry, shellEdgesMaterial);
    shellEdges.position.copy(shell.position);
    shellEdges.renderOrder = 3;
    scene.add(shellEdges);

    const SHELL_OPACITY = { tower: 0.1, focused: 0.03 };
    const SHELL_EDGE_OPACITY = { tower: 0.35, focused: 0.1 };
    const FRESNEL_OPACITY = { tower: 0.5, focused: 0.12 };
    let shellTargetOpacity = SHELL_OPACITY.tower;
    let shellEdgesTargetOpacity = SHELL_EDGE_OPACITY.tower;
    let fresnelTargetOpacity = FRESNEL_OPACITY.tower;

    // --- Rooms (built per focused floor) ------------------------------------
    const roomGeometry = new RoundedBoxGeometry(ROOM_SIZE, ROOM_H, ROOM_SIZE, 2, 0.18);
    const roomGroup = new Group();
    scene.add(roomGroup);

    let roomEntries: RoomEntry[] = [];
    let focusedFloor: number | null = null;
    let statusByCode: ReadonlyMap<string, RoomStatus> = new Map();
    let highlightCode: string | null = null;
    let onlyFree = false;

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
                const color = new Color(roomColor(room));
                const material = new MeshStandardMaterial({
                    color,
                    roughness: 0.55,
                    metalness: 0.05,
                    emissive: color.clone(),
                    emissiveIntensity: 0.12,
                    transparent: true,
                });
                const mesh = new Mesh(roomGeometry, material);
                mesh.position.set(
                    cx + (col - 0.5) * (ROOM_SIZE + 0.5),
                    // Rooms ride the slab's TARGET height so they land where
                    // the eased slab settles instead of its mid-flight position.
                    slab.targetY + SLAB_H / 2 + ROOM_H / 2,
                    cz + (row - (zone.rooms.length / 2 - 0.5) / 2) * (ROOM_SIZE + 0.5),
                );
                mesh.castShadow = true;
                mesh.userData.roomCode = room.code;
                if (!reducedMotion) mesh.scale.setScalar(0.001);
                roomGroup.add(mesh);
                roomEntries.push({
                    room,
                    mesh,
                    spawnAt: performance.now(),
                    stagger: Math.min(roomEntries.length * ROOM_STAGGER_SECONDS, 0.5),
                    phase: roomEntries.length * 0.7,
                    pulsing: false,
                });
            });
        });
        refreshRoomColors();
    }

    function refreshRoomColors(): void {
        for (const entry of roomEntries) {
            const color = roomColor(entry.room);
            const highlighted = entry.room.code === highlightCode;
            const status = statusByCode.get(entry.room.code);
            // "Only free" glow filter: busy (or unknown) rooms dim right back so
            // the free ones read at a glance; free rooms glow a touch brighter.
            const dimmed = onlyFree && status !== 'free' && !highlighted;
            entry.mesh.material.color.set(color);
            entry.mesh.material.emissive.set(color);
            entry.mesh.material.opacity = dimmed ? 0.12 : 1;
            entry.mesh.material.emissiveIntensity = dimmed
                ? 0
                : highlighted
                    ? 0.55
                    : onlyFree && status === 'free'
                        ? 0.4
                        : 0.12;
            // "In class" rooms breathe gently (render loop); highlight beats it,
            // and a dimmed room never pulses.
            entry.pulsing = !highlighted && !dimmed && status === 'busy';
        }
    }

    /** Slab color for the current state: selected > inactive > heat-tinted. */
    function slabTargetColor(f: FloorEntry): Color {
        if (focusedFloor !== null && f.floor === focusedFloor) {
            return new Color(colors.slabSelected);
        }
        if (!f.interactive) return new Color(colors.slabInactive);
        const fraction = floorBusyFraction.get(f.floor) ?? 0;
        return new Color(floorHeatColor(colors.slab, `#${heatHot.getHexString()}`, fraction));
    }

    /** Re-target every slab's color (used after a status refresh, no rebuild). */
    function refreshFloorTints(): void {
        for (const f of floors) f.targetColor.copy(slabTargetColor(f));
    }

    function applyFloorFocus(): void {
        for (const f of floors) {
            const lifted = focusedFloor !== null && f.floor > focusedFloor;
            f.targetY = f.baseY + (lifted ? EXPLODE_LIFT : 0);
            const isFocused = focusedFloor !== null && f.floor === focusedFloor;
            f.targetOpacity =
                focusedFloor === null ? 1 : isFocused ? 1 : lifted ? 0.18 : 0.55;
            // Faded slabs must not throw full-strength shadows (shadow maps
            // ignore opacity), so shadow casting follows the settled state.
            f.mesh.castShadow = f.targetOpacity > 0.5;
            f.targetColor.copy(slabTargetColor(f));
        }
        const focused = focusedFloor !== null;
        shellTargetOpacity = focused ? SHELL_OPACITY.focused : SHELL_OPACITY.tower;
        shellEdgesTargetOpacity = focused ? SHELL_EDGE_OPACITY.focused : SHELL_EDGE_OPACITY.tower;
        fresnelTargetOpacity = focused ? FRESNEL_OPACITY.focused : FRESNEL_OPACITY.tower;
        if (focusedFloor !== null) buildRooms(focusedFloor);
        else clearRooms();
        hideTooltip();
    }

    // --- Renderer / camera / controls ---------------------------------------
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    // Hover tooltip: a DOM overlay above the canvas (the accessible room list
    // carries the same facts). Positioned inside `container`, which the CSS
    // makes position:relative.
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
        if (!tooltip.hidden) {
            tooltip.hidden = true;
            renderer.domElement.style.cursor = '';
        }
    }

    const camera = new PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(46, towerHeight * 0.9 + 18, 46);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, towerHeight / 2, 0);
    controls.enableDamping = !reducedMotion;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minDistance = 18;
    controls.maxDistance = 160;

    // Idle drift: after a quiet spell the camera orbits slowly so the scene
    // feels alive; any user touch (or a floor/room selection) parks it again.
    controls.autoRotateSpeed = 0.5;
    let lastInteraction = performance.now();
    const markActive = () => { lastInteraction = performance.now(); };
    controls.addEventListener('start', markActive);

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

    let lastTime = performance.now();
    renderer.setAnimationLoop((time: number) => {
        // Frame-rate-independent exponential damping; snaps under reduced motion.
        const dt = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;
        const k = reducedMotion ? 1 : 1 - Math.exp(-dt * EASE_RATE);

        for (const f of floors) {
            f.mesh.position.y += (f.targetY - f.mesh.position.y) * k;
            f.mesh.material.opacity += (f.targetOpacity - f.mesh.material.opacity) * k;
            f.mesh.material.color.lerp(f.targetColor, k);
            // Labels ride their slab's opacity so they fade with the exploded view.
            f.labelMaterial.opacity = f.mesh.material.opacity;
        }
        shellMaterial.opacity += (shellTargetOpacity - shellMaterial.opacity) * k;
        shellEdgesMaterial.opacity +=
            (shellEdgesTargetOpacity - shellEdgesMaterial.opacity) * k;
        const fresnelOpacity = fresnelMaterial.uniforms.uOpacity as { value: number };
        fresnelOpacity.value += (fresnelTargetOpacity - fresnelOpacity.value) * k;

        if (!reducedMotion) {
            for (const entry of roomEntries) {
                const age = (time - entry.spawnAt) / 1000 - entry.stagger;
                const scale = easeOutCubic(Math.min(Math.max(age / ROOM_POP_SECONDS, 0), 1));
                entry.mesh.scale.setScalar(Math.max(0.001, scale));
                if (entry.pulsing) {
                    entry.mesh.material.emissiveIntensity =
                        0.1 + 0.08 * (0.5 + 0.5 * Math.sin(time / 420 + entry.phase));
                }
            }
        }

        controls.autoRotate =
            !reducedMotion && time - lastInteraction > IDLE_ORBIT_AFTER_MS;
        controls.update();
        renderer.render(scene, camera);
    });

    // --- Picking -------------------------------------------------------------
    // Click = pointerdown/up pair that barely moved, so orbit drags don't pick.
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let downAt: { x: number; y: number } | null = null;

    function roomCodeAt(event: PointerEvent): string | null {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const roomHit = raycaster.intersectObjects(roomGroup.children, false)[0];
        const code = roomHit?.object.userData.roomCode;
        return typeof code === 'string' ? code : null;
    }

    function pick(event: PointerEvent): void {
        const code = roomCodeAt(event);
        if (code !== null) {
            options.onRoomClick?.(code);
            return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
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
    // Hover: only meaningful over a focused floor's rooms. A drag (button held)
    // is an orbit, not a hover, so the tooltip stays hidden then.
    const onPointerMove = (event: PointerEvent) => {
        if (downAt || focusedFloor === null || roomEntries.length === 0) {
            hideTooltip();
            return;
        }
        const code = roomCodeAt(event);
        const info = code !== null ? options.describeRoom?.(code) ?? null : null;
        if (!info) {
            hideTooltip();
            return;
        }
        tooltipTitle.textContent = info.title;
        tooltipDetail.textContent = info.detail;
        tooltip.dataset.status = info.status;
        const rect = renderer.domElement.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left}px`;
        tooltip.style.top = `${event.clientY - rect.top}px`;
        tooltip.hidden = false;
        renderer.domElement.style.cursor = 'pointer';
    };
    const onPointerLeave = () => hideTooltip();
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    applyFloorFocus();

    return {
        setFloor(floor) {
            focusedFloor = floor !== null && dataFloors.has(floor) ? floor : null;
            markActive();
            applyFloorFocus();
        },
        setRoomStatus(status) {
            statusByCode = status;
            // Recompute each floor's busy fraction for the heat tint, then
            // recolor the focused floor's rooms.
            const fractions = new Map<number, number>();
            for (const [floor, data] of dataFloors) {
                let total = 0;
                let busy = 0;
                for (const zone of data.zones) {
                    for (const room of zone.rooms) {
                        const s = statusByCode.get(room.code);
                        if (s === 'free' || s === 'busy') {
                            total += 1;
                            if (s === 'busy') busy += 1;
                        }
                    }
                }
                fractions.set(floor, total > 0 ? busy / total : 0);
            }
            floorBusyFraction = fractions;
            refreshFloorTints();
            refreshRoomColors();
        },
        setHighlight(code) {
            highlightCode = code ? code.trim().toUpperCase() : null;
            markActive();
            refreshRoomColors();
        },
        setOnlyFree(next) {
            onlyFree = next;
            refreshRoomColors();
        },
        dispose() {
            renderer.setAnimationLoop(null);
            resizeObserver?.disconnect();
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            renderer.domElement.removeEventListener('pointerup', onPointerUp);
            renderer.domElement.removeEventListener('pointermove', onPointerMove);
            renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
            controls.dispose();
            clearRooms();
            for (const f of floors) {
                f.mesh.material.dispose();
                f.labelMaterial.dispose();
                f.labelTexture.dispose();
            }
            slabGeometry.dispose();
            roomGeometry.dispose();
            groundGeometry.dispose();
            groundMaterial.dispose();
            shellGeometry.dispose();
            shellMaterial.dispose();
            fresnelMaterial.dispose();
            shellEdgesGeometry.dispose();
            shellEdgesMaterial.dispose();
            tooltip.remove();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}
