/**
 * Procedural 3D campus scene for the /campus route (#370, visuals #385).
 *
 * Renders a reference-aligned reconstruction of the completed Merul Badda
 * campus: the park/lake ground plane, porous civic stack, WOHA's elevated
 * academic ring and atrium, façade screens, garden terraces, lift/escalator
 * circulation, university green, pool, jogging loop and PV canopy. The public
 * Campus 360 programme and official project photography support those layers;
 * exact plan positions remain deliberately schematic until BRACU releases the
 * indexed as-built drawings.
 *
 * Selecting a floor "explodes" the stack — floors above lift and fade — and
 * the selected slab grows room boxes, one per room, clustered by zone in a
 * ring around the slab's center (the tower is built around a central void).
 * Room boxes recolor live from the free/busy status map.
 *
 * The scene stays procedural: PBR materials under a sun + sky rig with soft
 * shadows, a translucent interactive floor locator inside the architecture,
 * and a landscaped campus base. The
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
    ACESFilmicToneMapping,
    AdditiveBlending,
    AmbientLight,
    BackSide,
    BoxGeometry,
    CanvasTexture,
    CircleGeometry,
    Color,
    CylinderGeometry,
    DirectionalLight,
    EdgesGeometry,
    Group,
    HemisphereLight,
    InstancedMesh,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    PCFSoftShadowMap,
    PerspectiveCamera,
    Raycaster,
    RingGeometry,
    Scene,
    Shape,
    ShapeGeometry,
    ShaderMaterial,
    Sprite,
    SpriteMaterial,
    SRGBColorSpace,
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

// World units are schematic, but the proportions and architectural hierarchy
// follow the public WOHA/BRACU references instead of the former generic tower.
const SLAB_W = 48;
const SLAB_D = 34;
const SLAB_H = 0.42;
const FLOOR_GAP = 3.1;
const EXPLODE_LIFT = 8;
const ROOM_SIZE = 1.45;
const ROOM_H = 1.15;
const ZONE_RING_RADIUS = 12.2;
const PODIUM_FLOORS_MIN = 1;    // render context floors from 1 upward
const PUBLISHED_TOP_FLOOR = 13;
const GROUND_RADIUS = 62;
const SHELL_MARGIN = 1.6;
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
    targetLabelOpacity: number;
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

    const maxDataFloor = model.floors.length
        ? model.floors[model.floors.length - 1].floor
        : PODIUM_FLOORS_MIN;
    const maxFloor = Math.max(PUBLISHED_TOP_FLOOR, maxDataFloor);
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

    // --- Reference-aligned campus architecture -----------------------------
    // This visual layer never owns room data or click state. It gives the live
    // feed-driven locator the real campus hierarchy while remaining visually
    // subordinate whenever a floor is opened.
    const architecture = new Group();
    scene.add(architecture);
    const architectureMaterials: Array<{
        material: MeshStandardMaterial;
        baseOpacity: number;
    }> = [];
    let architectureTargetFactor = 1;

    function archMaterial(
        color: string,
        roughness: number,
        metalness = 0,
        opacity = 1,
        emissive?: string,
    ): MeshStandardMaterial {
        const material = new MeshStandardMaterial({
            color: new Color(color),
            roughness,
            metalness,
            transparent: true,
            opacity,
            // Every architecture material participates in the focus fade. A
            // transparent material must not keep writing an invisible wall to
            // the depth buffer while the live room layer is open.
            depthWrite: false,
            emissive: new Color(emissive ?? '#000000'),
            emissiveIntensity: emissive ? 0.12 : 0,
        });
        architectureMaterials.push({ material, baseOpacity: opacity });
        return material;
    }

    const arch = {
        concrete: archMaterial('#d8d6ca', 0.76),
        concreteLight: archMaterial('#ece9df', 0.68),
        frame: archMaterial('#46534f', 0.52, 0.4),
        glass: archMaterial('#557f82', 0.2, 0.12, 0.45),
        glassDark: archMaterial('#294f53', 0.22, 0.22, 0.82),
        screen: archMaterial('#3e7468', 0.46, 0.38),
        screenDark: archMaterial('#254f49', 0.42, 0.42),
        bronze: archMaterial('#aa9b78', 0.58, 0.2),
        rail: archMaterial('#68756f', 0.38, 0.55),
        green: archMaterial('#477b50', 0.94),
        greenLight: archMaterial('#78a258', 0.96),
        earth: archMaterial('#80694f', 1),
        water: archMaterial('#3d8589', 0.18, 0.05, 0.82),
        paver: archMaterial('#a7a39a', 0.9),
        road: archMaterial('#4b5351', 0.98),
        track: archMaterial('#9b6249', 0.88),
        field: archMaterial('#426c59', 0.9),
        solar: archMaterial('#183c4e', 0.25, 0.72),
        light: archMaterial('#ddd39f', 0.42, 0, 1, '#f3be63'),
    };

    function addBox(
        size: [number, number, number],
        position: [number, number, number],
        material: MeshStandardMaterial,
        parent: Group = architecture,
        cast = true,
        receive = true,
    ): Mesh<BoxGeometry, MeshStandardMaterial> {
        const mesh = new Mesh(new BoxGeometry(...size), material);
        mesh.position.set(...position);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        parent.add(mesh);
        return mesh;
    }

    type BoxInstance = {
        size: [number, number, number];
        position: [number, number, number];
        rotation?: [number, number, number];
    };

    const instanceTransform = new Object3D();

    function addInstancedBoxes(
        instances: BoxInstance[],
        material: MeshStandardMaterial,
        cast = true,
        receive = true,
    ): InstancedMesh<BoxGeometry, MeshStandardMaterial> | null {
        if (instances.length === 0) return null;
        const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, instances.length);
        for (const [index, instance] of instances.entries()) {
            instanceTransform.position.set(...instance.position);
            instanceTransform.rotation.set(...(instance.rotation ?? [0, 0, 0]));
            instanceTransform.scale.set(...instance.size);
            instanceTransform.updateMatrix();
            mesh.setMatrixAt(index, instanceTransform.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        architecture.add(mesh);
        return mesh;
    }

    // Road edge, lake and cleansing-biotope cells around the raised park.
    addBox([128, 0.24, 15], [0, -0.55, 43], arch.road, architecture, false, true);
    const roadMarkings: BoxInstance[] = [];
    for (let x = -56; x <= 56; x += 13) {
        roadMarkings.push({ size: [6, 0.025, 0.18], position: [x, -0.4, 43] });
    }
    addInstancedBoxes(roadMarkings, arch.concreteLight, false, false);
    const lakeShape = new Shape();
    lakeShape.moveTo(-37, 27);
    lakeShape.bezierCurveTo(-49, 14, -48, -23, -30, -30);
    lakeShape.bezierCurveTo(-10, -37, 25, -34, 39, -23);
    lakeShape.bezierCurveTo(49, -7, 47, 17, 35, 29);
    lakeShape.bezierCurveTo(14, 36, -20, 36, -37, 27);
    const lake = new Mesh(new ShapeGeometry(lakeShape, 16), arch.water);
    lake.rotation.x = -Math.PI / 2;
    lake.position.y = -0.4;
    lake.receiveShadow = true;
    architecture.add(lake);
    for (let i = 0; i < 5; i += 1) {
        addBox(
            [5.2, 0.12, 7.6],
            [-29 + i * 7.2, -0.2, -30 + (i % 2) * 0.8],
            arch.water,
            architecture,
            false,
            true,
        );
        for (let reed = 0; reed < 3; reed += 1) {
            const stalk = new Mesh(
                new CylinderGeometry(0.08, 0.11, 0.85 + reed * 0.14, 5),
                arch.greenLight,
            );
            stalk.position.set(-30.4 + i * 7.2 + reed * 1.35, 0.18, -30.6);
            architecture.add(stalk);
        }
    }

    // Park island, public maidan and the shaded entrance stair.
    addBox([54, 0.62, 38], [0, -0.08, 0], arch.concrete, architecture, false, true);
    addBox([49, 0.25, 33], [0, 0.37, -0.5], arch.green, architecture, false, true);
    addBox([24, 0.12, 16], [0, 0.57, -4], arch.field, architecture, false, true);
    addBox([15, 0.12, 29], [0, 0.58, 5], arch.paver, architecture, false, true);
    addInstancedBoxes(
        Array.from({ length: 5 }, (_, step) => ({
            size: [19 - step * 1.35, 0.26, 1.7],
            position: [0, 0.75 + step * 0.24, 18 - step * 1.65],
        })),
        arch.concreteLight,
    );

    // G–6 civic stack: thin perimeter bars keep the multi-storey void porous.
    const lowerTop = 6 * FLOOR_GAP;
    const lowerSlabs: BoxInstance[] = [];
    const lowerGlass: BoxInstance[] = [];
    const lowerEarth: BoxInstance[] = [];
    const lowerGreenLight: BoxInstance[] = [];
    const lowerGreen: BoxInstance[] = [];
    for (let floor = 1; floor <= 6; floor += 1) {
        const y = (floor - 1) * FLOOR_GAP + 0.9;
        for (const z of [-13.1, 13.1]) {
            lowerSlabs.push({ size: [48, 0.25, 6.4], position: [0, y, z] });
            lowerGlass.push({
                size: [43.5, 2.35, 0.34],
                position: [0, y + 1.35, z + Math.sign(z) * 3.05],
            });
        }
        for (const x of [-20.8, 20.8]) {
            lowerSlabs.push({ size: [6.5, 0.25, 20], position: [x, y, 0] });
            lowerGlass.push({
                size: [0.34, 2.35, 17],
                position: [x + Math.sign(x) * 3.05, y + 1.35, 0],
            });
        }
        if (floor === 3 || floor === 5) {
            for (const x of [-16, -9, 9, 16]) {
                lowerEarth.push({ size: [5.2, 0.5, 1], position: [x, y + 0.47, 9.5] });
                (floor === 3 ? lowerGreenLight : lowerGreen).push({
                    size: [4.7, 0.42, 0.8],
                    position: [x, y + 0.87, 9.5],
                });
            }
        }
    }
    addInstancedBoxes(lowerSlabs, arch.concreteLight);
    addInstancedBoxes(lowerGlass, arch.glass, false, true);
    addInstancedBoxes(lowerEarth, arch.earth, false, true);
    addInstancedBoxes(lowerGreenLight, arch.greenLight, false, true);
    addInstancedBoxes(lowerGreen, arch.green, false, true);
    const lowerColumns: BoxInstance[] = [];
    for (let x = -21; x <= 21; x += 7) {
        for (const z of [-13, 13]) {
            lowerColumns.push({
                size: [0.58, lowerTop + 1.5, 0.58],
                position: [x, lowerTop / 2 + 0.8, z],
            });
        }
    }
    for (let z = -7; z <= 7; z += 7) {
        for (const x of [-21, 21]) {
            lowerColumns.push({
                size: [0.58, lowerTop + 1.5, 0.58],
                position: [x, lowerTop / 2 + 0.8, z],
            });
        }
    }
    addInstancedBoxes(lowerColumns, arch.frame);
    addBox([50, 0.72, 35], [0, lowerTop + 0.38, 0], arch.frame);

    // Floors 7–12: the elevated academic ring around the ventilated atrium.
    const academicSlabs: BoxInstance[] = [];
    const academicGlass: BoxInstance[] = [];
    const academicEarth: BoxInstance[] = [];
    const academicGreenLight: BoxInstance[] = [];
    const academicGreen: BoxInstance[] = [];
    for (let floor = 7; floor <= 12; floor += 1) {
        const y = (floor - 1) * FLOOR_GAP + 0.9;
        for (const z of [-12.4, 12.4]) {
            academicSlabs.push({ size: [50, 0.28, 8.4], position: [0, y, z] });
            academicGlass.push({ size: [47, 2.36, 6.6], position: [0, y + 1.38, z] });
        }
        for (const x of [-20.8, 20.8]) {
            academicSlabs.push({ size: [8.4, 0.28, 16.4], position: [x, y, 0] });
            academicGlass.push({ size: [6.6, 2.36, 14.5], position: [x, y + 1.38, 0] });
        }
        if (floor === 8 || floor === 11) {
            for (const x of [-17, -10, -3, 4, 11, 18]) {
                academicEarth.push({
                    size: [4.7, 0.55, 1.05],
                    position: [x, y + 0.5, 7.75],
                });
                (floor === 8 ? academicGreenLight : academicGreen).push({
                    size: [4.2, 0.46, 0.8],
                    position: [x, y + 0.93, 7.75],
                });
            }
        }
    }
    addInstancedBoxes(academicSlabs, arch.concreteLight);
    addInstancedBoxes(academicGlass, arch.glass, false, true);
    addInstancedBoxes(academicEarth, arch.earth, false, true);
    addInstancedBoxes(academicGreenLight, arch.greenLight, false, true);
    addInstancedBoxes(academicGreen, arch.green, false, true);

    // Deep green-bronze solar-control skin seen in the official elevations.
    const academiaBottom = 6 * FLOOR_GAP + 1;
    const academiaTop = 12 * FLOOR_GAP + 2.7;
    const academiaHeight = academiaTop - academiaBottom;
    const academiaMid = academiaBottom + academiaHeight / 2;
    const screenFins: BoxInstance[] = [];
    const bronzeFins: BoxInstance[] = [];
    const sideFins: BoxInstance[] = [];
    for (let x = -23.6; x <= 23.6; x += 2.1) {
        for (const z of [-16.95, 16.95]) {
            (Math.abs(x) < 3 ? bronzeFins : screenFins).push({
                size: [0.24, academiaHeight, 0.9],
                position: [x, academiaMid, z],
                rotation: [0, x % 4.2 === 0 ? 0.14 : -0.07, 0],
            });
        }
    }
    for (let z = -7.5; z <= 7.5; z += 2.1) {
        for (const x of [-25.05, 25.05]) {
            sideFins.push({
                size: [0.9, academiaHeight, 0.24],
                position: [x, academiaMid, z],
                rotation: [0, z % 4.2 === 0 ? -0.12 : 0.07, 0],
            });
        }
    }
    addInstancedBoxes(screenFins, arch.screen, true, false);
    addInstancedBoxes(bronzeFins, arch.bronze, true, false);
    addInstancedBoxes(sideFins, arch.screenDark, true, false);

    // Central bridges, visible lift cores and paired escalators. These elements
    // are deliberately unlabelled: exact positions await approved plan files.
    const bridgeDecks: BoxInstance[] = [];
    const bridgeRails: BoxInstance[] = [];
    for (const [index, floor] of [3, 5, 8, 10, 12].entries()) {
        const y = (floor - 1) * FLOOR_GAP + 1;
        const alongX = index % 2 === 0;
        bridgeDecks.push({
            size: alongX ? [15, 0.35, 2.5] : [2.5, 0.35, 17],
            position: [0, y, 0],
        });
        for (const side of [-1, 1]) {
            bridgeRails.push({
                size: alongX ? [15, 0.1, 0.1] : [0.1, 0.1, 17],
                position: alongX ? [0, y + 1, side * 1.15] : [side * 1.15, y + 1, 0],
            });
        }
    }
    addInstancedBoxes(bridgeDecks, arch.concreteLight);
    addInstancedBoxes(bridgeRails, arch.rail, false, false);
    const liftCores: BoxInstance[] = [];
    const liftGlass: BoxInstance[] = [];
    const liftLights: BoxInstance[] = [];
    for (const x of [-13.5, 13.5]) {
        liftCores.push({
            size: [5.4, towerHeight + 1.8, 5.4],
            position: [x, towerHeight / 2 + 0.7, 0],
        });
        liftGlass.push({
            size: [3.9, towerHeight - 0.5, 5.55],
            position: [x, towerHeight / 2 + 0.9, 0.05],
        });
        for (let floor = 2; floor <= 12; floor += 1) {
            liftLights.push({
                size: [2.7, 0.1, 0.1],
                position: [x, (floor - 1) * FLOOR_GAP + 2.05, 2.82],
            });
        }
    }
    addInstancedBoxes(liftCores, arch.concrete);
    addInstancedBoxes(liftGlass, arch.glassDark, false, true);
    addInstancedBoxes(liftLights, arch.light, false, false);
    function addEscalator(x: number, y: number, direction: 1 | -1): void {
        const rise = FLOOR_GAP;
        const run = 6.1;
        const length = Math.hypot(rise, run);
        const escalator = new Group();
        const ramp = addBox([1.55, 0.28, length], [0, 0, 0], arch.frame, escalator);
        ramp.rotation.x = direction * Math.atan2(rise, run);
        for (const side of [-0.8, 0.8]) {
            const rail = addBox(
                [0.09, 0.42, length],
                [side, 0.28, 0],
                arch.rail,
                escalator,
                false,
                false,
            );
            rail.rotation.x = direction * Math.atan2(rise, run);
        }
        escalator.position.set(x, y + rise / 2, direction * -1.1);
        architecture.add(escalator);
    }
    for (const floor of [1, 3, 5, 7, 9, 11]) {
        const y = (floor - 1) * FLOOR_GAP + 1.1;
        addEscalator(-1.55, y, 1);
        addEscalator(1.55, y + FLOOR_GAP, -1);
    }

    // 13th-floor university green and upper photovoltaic roof.
    const roofY = (PUBLISHED_TOP_FLOOR - 1) * FLOOR_GAP + 1;
    addBox([50, 0.72, 35], [0, roofY, 0], arch.concreteLight);
    addBox([45.5, 0.2, 30.5], [0, roofY + 0.5, 0], arch.green, architecture, false, true);
    addBox([27, 0.12, 16], [-4, roofY + 0.67, -1], arch.field, architecture, false, true);
    addBox(
        [14.8, 0.3, 7.4],
        [16, roofY + 0.73, 5.5],
        arch.concreteLight,
        architecture,
        false,
        true,
    );
    addBox([13.6, 0.18, 6.2], [16, roofY + 0.94, 5.5], arch.water, architecture, false, true);
    const poolLaneMarkers: BoxInstance[] = [];
    for (let lane = -4.5; lane <= 4.5; lane += 3) {
        poolLaneMarkers.push({
            size: [0.04, 0.02, 5.7],
            position: [16 + lane, roofY + 1.05, 5.5],
        });
    }
    addInstancedBoxes(poolLaneMarkers, arch.concreteLight, false, false);
    addBox([10.5, 3, 6.5], [-17, roofY + 2.1, -8], arch.glassDark);
    addBox([11.3, 0.28, 7.2], [-17, roofY + 3.72, -8], arch.concreteLight);
    const yogaPosts: BoxInstance[] = [];
    for (const x of [-19.5, -15.8, -12.1]) {
        for (const z of [7.4, 11.5]) {
            yogaPosts.push({ size: [0.18, 2.5, 0.18], position: [x, roofY + 1.9, z] });
        }
    }
    addInstancedBoxes(yogaPosts, arch.frame);
    addBox([10, 0.25, 6.6], [-15.8, roofY + 3.2, 9.5], arch.bronze);
    const joggingTrack = new Mesh(new RingGeometry(18, 19, 72), arch.track);
    joggingTrack.scale.y = 0.67;
    joggingTrack.rotation.x = -Math.PI / 2;
    joggingTrack.position.y = roofY + 0.87;
    architecture.add(joggingTrack);

    const canopyY = roofY + 6;
    const canopyPosts: BoxInstance[] = [];
    for (const x of [-20, -10, 0, 10, 20]) {
        for (const z of [-14.5, 14.5]) {
            canopyPosts.push({ size: [0.28, 5.3, 0.28], position: [x, roofY + 3.2, z] });
        }
    }
    addInstancedBoxes(canopyPosts, arch.frame);
    const solarPanels: BoxInstance[] = [];
    for (let row = 0; row < 6; row += 1) {
        for (let col = 0; col < 10; col += 1) {
            solarPanels.push({
                size: [4.5, 0.14, 4.45],
                position: [-21.3 + col * 4.72, canopyY, -11.8 + row * 4.72],
                rotation: [-0.065, 0, 0],
            });
        }
    }
    addInstancedBoxes(solarPanels, arch.solar, false, false);

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
            targetOpacity: 0.1,
            targetLabelOpacity: interactive ? 0.86 : 0.3,
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

    const SHELL_OPACITY = { tower: 0.025, focused: 0 };
    const SHELL_EDGE_OPACITY = { tower: 0.1, focused: 0 };
    const FRESNEL_OPACITY = { tower: 0.12, focused: 0 };
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
                focusedFloor === null ? 0.1 : isFocused ? 0.78 : lifted ? 0.04 : 0.07;
            f.targetLabelOpacity =
                focusedFloor === null
                    ? f.interactive ? 0.86 : 0.3
                    : isFocused ? 1 : lifted ? 0.08 : 0.18;
            // Faded slabs must not throw full-strength shadows (shadow maps
            // ignore opacity), so shadow casting follows the settled state.
            f.mesh.castShadow = f.targetOpacity > 0.5;
            f.targetColor.copy(slabTargetColor(f));
        }
        const focused = focusedFloor !== null;
        architectureTargetFactor = focused ? 0.1 : 1;
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
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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
    camera.position.set(68, 54, 68);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, towerHeight / 2 + 4, 0);
    controls.enableDamping = !reducedMotion;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minDistance = 18;
    controls.maxDistance = 190;

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
            f.labelMaterial.opacity +=
                (f.targetLabelOpacity - f.labelMaterial.opacity) * k;
        }
        for (const entry of architectureMaterials) {
            const targetOpacity = entry.baseOpacity * architectureTargetFactor;
            entry.material.opacity += (targetOpacity - entry.material.opacity) * k;
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
            architecture.traverse((object) => {
                if (object instanceof Mesh) object.geometry.dispose();
            });
            for (const entry of architectureMaterials) entry.material.dispose();
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
