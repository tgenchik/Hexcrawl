import { type ChangeEvent, type CSSProperties, type WheelEvent, useEffect, useMemo, useRef, useState } from 'react';

type AxialHex = {
  q: number;
  r: number;
};

type HexType = 'region' | 'candidate' | 'center';

type BiomeLandType = 'settled' | 'wild';
type RegionHeightLevel = 1 | 2 | 3;
type RiverFullness = 1 | 2 | 3 | 4 | 5;

type BiomeId =
  | 'plain_deciduous_forest'
  | 'plain_mixed_forest'
  | 'plain_coniferous_forest'
  | 'deciduous_forested_hills'
  | 'mixed_forested_hills'
  | 'coniferous_forested_hills'
  | 'open_hills'
  | 'coniferous_mountain_forest'
  | 'mixed_mountain_forest'
  | 'deciduous_mountain_forest'
  | 'mountains'
  | 'open_plains'
  | 'swamp_forest'
  | 'swamp'
  | 'hilly_woodland'
  | 'mountain_woodland'
  | 'deciduous_woodland'
  | 'mixed_woodland'
  | 'coniferous_woodland'
  | 'semi_desert';

type Region = {
  id: number;
  hexes: AxialHex[];
  centerHex: AxialHex;
  anchorHex: AxialHex;
  targetSize: number;
  finalSize: number;
  sizeCategory: 'locality' | 'small_region' | 'region' | 'large_region' | 'land' | 'vast_land';
  sizeLabel: 'Местность' | 'Малый регион' | 'Регион' | 'Большой регион' | 'Край' | 'Обширный край';
  biomeLandType: BiomeLandType;
  heightLevel: RegionHeightLevel;
  biomeId: BiomeId;
  biomeLabel: string;
  biomePrimaryEmoji: string;
  biomeSecondaryEmojis: string[];
  biomeEmojiLabel: string;
  pointsOfInterest: AxialHex[];
  // Прибрежный ли регион. Необязательное поле — старые сохранения без него
  // корректно читаются как "не прибрежный".
  isCoastal?: boolean;
};

type HexMeta = {
  regionId: number;
  isCenter: boolean;
  isAnchor: boolean;
};

type HexEdge = {
  from: RiverVertex;
  to: RiverVertex;
  neighborHex: AxialHex;
  edgeKey: string;
};

type RiverSectorReason = 'river_start' | 'river_confluence' | 'lake' | 'region_boundary' | 'split' | 'unknown';

type RiverSector = {
  id: string;
  riverId: number | string;
  sectorIndex: number;
  vertexPath: RiverVertex[];
  edgeKeys: string[];
  startVertexKey: string;
  endVertexKey: string;
  startReason: RiverSectorReason;
  endReason: Exclude<RiverSectorReason, 'river_start'> | 'river_end';
  fullness: RiverFullness;
  assignedRegionId?: number;
};

type River = {
  id: number;
  regionId: number;
  vertexPath: RiverVertex[];
  sectors: RiverSector[];
  controlPoints?: {
    startVertex: RiverVertex;
    middlePurpleVertex?: RiverVertex;
    endVertex: RiverVertex;
    startMode: 'existing river endpoint' | 'red vertex';
  };
};

type RiverConfluence = {
  id: string;
  tributaryRiverId: number;
  mainRiverId: number;
  vertexKey: string;
};

type RiverConnectorSplit = {
  vertex: RiverVertex;
  upstreamFullness: RiverFullness;
  downstreamFullness: RiverFullness;
};

type RoadKind = 'road' | 'trail';
type RoadSegment = { from: AxialHex; to: AxialHex; kind: RoadKind };
type Road = { id: number; regionId: number; segments: RoadSegment[] };
type RoadCandidatePath = {
  basePath: AxialHex[];
  extendedPath: AxialHex[];
  targetHex: AxialHex;
  targetIsPoi: boolean;
  crossedRiverCount: number;
  touchedPoiCount: number;
  touchedPoiKeys: Set<string>;
};

type WildRoadCandidate = {
  startRoadId: number;
  targetRoadId?: number;
  path: AxialHex[];
  crossedRiverCount: number;
  targetKind: 'candidate' | 'road';
  targetDistanceFromStartRoadCenter: number;
  startEndpointKey: string;
  targetEndpointKey: string;
};

type WildIncomingRoadPairCandidate = {
  startRoadId: number;
  targetRoadId: number;
  path: AxialHex[];
  crossedRiverCount: number;
};

type WildCandidateRoadCandidate = {
  path: AxialHex[];
  crossedRiverCount: number;
};

type RiverVertex = {
  x: number;
  y: number;
  key: string;
};

type LakeVertex = RiverVertex;

type Lake = {
  lakeId: number;
  hexes: AxialHex[];
  vertices: RiverVertex[];
};


type RiverConnectionType = 'start' | 'end';

type RiverConnection = {
  riverId: number;
  type: RiverConnectionType;
  vertex: RiverVertex;
};

type RiverEndpointTouch = {
  riverId: number;
  endpointType: RiverConnectionType;
  vertex: RiverVertex;
};

type VertexUsage = {
  vertex: RiverVertex;
  currentRegionCount: number;
  otherRegionCount: number;
  candidateCount: number;
};

type RiverHeightConstraint = {
  minHeight?: RegionHeightLevel;
  maxHeight?: RegionHeightLevel;
  reasons: string[];
};
type ChooseBiomeResult = {
  biomeId: BiomeId | null;
  reason?: 'river_height_constraint_failed';
};

const HEX_SIZE = 28;
const SQRT3 = Math.sqrt(3);
const SHOW_HEX_COORDINATES = false;
const SHOW_BIOME_EMOJI = true;
const REGION_CENTER_EMOJI = '★';
const POI_EMOJI = '◆';
const WATER_COLOR = 'var(--water-color)';
const LAKE_HEX_COLOR = WATER_COLOR;
// Море (прибрежные воды) — заметно темнее озёр и рек (BR-006).
const SEA_HEX_COLOR = '#143d5c';
const MOBILE_LAYOUT_QUERY = '(max-width: 900px)';


type HexTerrainOverride = 'lake' | 'sea';

type HexTerrainData = {
  terrainOverride?: HexTerrainOverride;
  lakeId?: number;
};

type Biome = {
  id: BiomeId;
  label: string;
  color: string;
  primaryEmoji: string;
  secondaryEmojis: string[];
  wildWeight: number;
  settledWeight: number;
  heightLevel: RegionHeightLevel;
};

type HexcrawlSaveData = {
  schema: 'hexcrawl-map';
  version: 1;
  savedAt: string;
  map: {
    regions: Region[];
    candidateHexes: AxialHex[];
    rivers: River[];
    roads: Road[];
    terrainByHexKey: Record<string, HexTerrainData>;
  };
  counters: {
    nextLakeId: number;
    nextRoadId: number;
  };
  ui: {
    selectedHex: AxialHex | null;
    isMapRotated: boolean;
    mapScale: number;
  };
};

type ValidatedHexcrawlSaveData = HexcrawlSaveData & {
  map: HexcrawlSaveData['map'] & {
    terrainByHexKey: Record<string, HexTerrainData>;
  };
};

const HEXCRAWL_SAVE_SCHEMA = 'hexcrawl-map';
const HEXCRAWL_SAVE_VERSION = 1;
const PNG_EXPORT_SCALE = 2;
const EXPORT_FILE_PREFIX = 'hexcrawl-map';
const SVG_EXPORT_STYLES = `
  svg { --water-color: #3ea2ff; background: #0c1423; }
  .hex { stroke:#617187; stroke-width:1; }
  .hex.center { stroke:#707f96; }
  .hex.candidate { fill:#4f5f72; stroke:#7f8ea3; cursor:pointer; stroke-dasharray:2 2; }
  .hex.click-prompt { stroke:#f7dc6f; stroke-width:2; }
  .click-prompt-label { fill:#fff7bf; stroke:#0c1423; stroke-width:3px; paint-order:stroke; font-size:12px; font-weight:800; pointer-events:none; }
  .hex-label { fill:#f4f8ff; font-size:11px; pointer-events:none; }
  .rivers-layer, .roads-layer, .river-debug-layer { pointer-events:none; }
  .river-polyline { fill:none; stroke:#3ea2ff; stroke-linecap:round; stroke-linejoin:round; }
  .river-direction-arrow { stroke:#ffffff; stroke-width:1.2; stroke-linecap:round; }
  .river-arrow-head { fill:#ffffff; }
  .road-line { stroke:#8b6a3f; stroke-width:3; stroke-linecap:round; }
  .road-trail-dot { fill:#8b6a3f; }
  .dbg-node-all { fill:#a0a7b2; opacity:.85; }
  .dbg-node-boundary { fill:#ffd84a; }
  .dbg-node-candidate { fill:#57df63; }
  .dbg-first-segment { stroke:#c17cff; stroke-width:4; stroke-linecap:round; }
  .dbg-last-segment { stroke:#ff9f40; stroke-width:4; stroke-linecap:round; }
  .dbg-start { fill:#3f83ff; }
  .dbg-end { fill:#ff4b4b; }
  .dbg-river-id { fill:#ffffff; font-size:10px; }
  .dbg-lake-vertex { fill:#ff4d00; stroke:#2b1200; stroke-width:0.6; }
  .dbg-node-exterior { fill:#ff2a2a; opacity:0.95; }
  .dbg-node-central { fill:#9b59ff; opacity:0.95; }
  .dbg-node-neighbor-region { fill:#ff9a2a; opacity:0.95; }
`;

const BIOMES: Record<BiomeId, Biome> = {
  plain_deciduous_forest: { id: 'plain_deciduous_forest', label: 'Равнинный лиственный лес', color: '#5F9E6E', primaryEmoji: '🌳', secondaryEmojis: [], wildWeight: 20, settledWeight: 11, heightLevel: 1 },
  plain_mixed_forest: { id: 'plain_mixed_forest', label: 'Равнинный смешанный лес', color: '#5B8F64', primaryEmoji: '🌳', secondaryEmojis: ['🌲'], wildWeight: 12, settledWeight: 5, heightLevel: 1 },
  plain_coniferous_forest: { id: 'plain_coniferous_forest', label: 'Равнинный хвойный лес', color: '#3F7F73', primaryEmoji: '🌲', secondaryEmojis: [], wildWeight: 6, settledWeight: 1, heightLevel: 1 },
  deciduous_forested_hills: { id: 'deciduous_forested_hills', label: 'Лиственные лесистые холмы', color: '#78945D', primaryEmoji: '〰️', secondaryEmojis: ['🌳'], wildWeight: 7, settledWeight: 10, heightLevel: 2 },
  mixed_forested_hills: { id: 'mixed_forested_hills', label: 'Смешанные лесистые холмы', color: '#6F8758', primaryEmoji: '〰️', secondaryEmojis: ['🌳', '🌲'], wildWeight: 5, settledWeight: 2, heightLevel: 2 },
  coniferous_forested_hills: { id: 'coniferous_forested_hills', label: 'Хвойные лесистые холмы', color: '#527B69', primaryEmoji: '〰️', secondaryEmojis: ['🌲'], wildWeight: 4, settledWeight: 1, heightLevel: 2 },
  open_hills: { id: 'open_hills', label: 'Открытые холмы', color: '#B49A5A', primaryEmoji: '〰️', secondaryEmojis: [], wildWeight: 6, settledWeight: 9, heightLevel: 2 },
  coniferous_mountain_forest: { id: 'coniferous_mountain_forest', label: 'Хвойный горный лес', color: '#4E6F68', primaryEmoji: '⛰', secondaryEmojis: ['🌲'], wildWeight: 4, settledWeight: 0, heightLevel: 3 },
  mixed_mountain_forest: { id: 'mixed_mountain_forest', label: 'Смешанный горный лес', color: '#667762', primaryEmoji: '⛰', secondaryEmojis: ['🌳', '🌲'], wildWeight: 3, settledWeight: 0, heightLevel: 3 },
  deciduous_mountain_forest: { id: 'deciduous_mountain_forest', label: 'Лиственный горный лес', color: '#6F8063', primaryEmoji: '⛰', secondaryEmojis: ['🌳'], wildWeight: 1, settledWeight: 0, heightLevel: 3 },
  mountains: { id: 'mountains', label: 'Горы', color: '#8A8375', primaryEmoji: '⛰', secondaryEmojis: [], wildWeight: 2, settledWeight: 0, heightLevel: 3 },
  open_plains: { id: 'open_plains', label: 'Открытые равнины', color: '#A7BE63', primaryEmoji: '🌱', secondaryEmojis: [], wildWeight: 14, settledWeight: 32, heightLevel: 1 },
  swamp_forest: { id: 'swamp_forest', label: 'Заболоченный лес', color: '#5E806E', primaryEmoji: '💧', secondaryEmojis: ['🌳'], wildWeight: 3, settledWeight: 0, heightLevel: 1 },
  swamp: { id: 'swamp', label: 'Болото', color: '#6F9278', primaryEmoji: '💧', secondaryEmojis: ['🌱'], wildWeight: 4, settledWeight: 0, heightLevel: 1 },
  hilly_woodland: { id: 'hilly_woodland', label: 'Холмистое редколесье', color: '#9A9861', primaryEmoji: '〰️', secondaryEmojis: ['🌱', '🌳'], wildWeight: 2, settledWeight: 2, heightLevel: 2 },
  mountain_woodland: { id: 'mountain_woodland', label: 'Горное редколесье', color: '#7D8069', primaryEmoji: '⛰', secondaryEmojis: ['🌱', '🌲'], wildWeight: 1, settledWeight: 0, heightLevel: 3 },
  deciduous_woodland: { id: 'deciduous_woodland', label: 'Лиственное редколесье', color: '#8CAF67', primaryEmoji: '🌱', secondaryEmojis: ['🌳'], wildWeight: 3, settledWeight: 19, heightLevel: 1 },
  mixed_woodland: { id: 'mixed_woodland', label: 'Смешанное редколесье', color: '#82A568', primaryEmoji: '🌱', secondaryEmojis: ['🌳', '🌲'], wildWeight: 1, settledWeight: 7, heightLevel: 1 },
  coniferous_woodland: { id: 'coniferous_woodland', label: 'Хвойное редколесье', color: '#6C9A78', primaryEmoji: '🌱', secondaryEmojis: ['🌲'], wildWeight: 1, settledWeight: 1, heightLevel: 1 },
  semi_desert: { id: 'semi_desert', label: 'Полупустыня', color: '#C4A96A', primaryEmoji: '🪨', secondaryEmojis: ['🌱'], wildWeight: 1, settledWeight: 0, heightLevel: 1 }
};
const FALLBACK_BIOME_ID: BiomeId = 'plain_deciduous_forest';
const FALLBACK_SETTLED_BIOME_ID: BiomeId = 'open_plains';
const FALLBACK_WILD_BIOME_ID: BiomeId = 'plain_deciduous_forest';
const START_HEX: AxialHex = { q: 0, r: 0 };
const START_PROMPT_HEX_SCALE = 1.45;
const START_PROMPT_HEX_PADDING = HEX_SIZE * (START_PROMPT_HEX_SCALE - 1);
const CLICK_PROMPT_INTERVAL_MS = 5000;
const CLICK_PROMPT_LABEL = 'Click Me!';
const NEIGHBOR_DIRECTIONS: AxialHex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];
const HEX_EDGE_DIRECTIONS: AxialHex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 }
];

function hexKey(hex: AxialHex): string {
  return `${hex.q},${hex.r}`;
}

function parseHexKey(key: string): AxialHex {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

function normalizeEdgeKey(hexA: AxialHex, hexB: AxialHex): string {
  const a = hexKey(hexA);
  const b = hexKey(hexB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function areHexesAdjacent(a: AxialHex, b: AxialHex): boolean {
  return getHexNeighbors(a).some((n) => n.q === b.q && n.r === b.r);
}
function normalizeRoadSegmentKey(a: AxialHex, b: AxialHex): string {
  const keyA = hexKey(a);
  const keyB = hexKey(b);
  return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}
function getRoadSegmentKeys(roads: Road[]): Set<string> {
  const keys = new Set<string>();
  for (const road of roads) for (const s of road.segments) keys.add(normalizeRoadSegmentKey(s.from, s.to));
  return keys;
}
function getRoadHexKeys(roads: Road[]): Set<string> {
  const keys = new Set<string>();
  for (const road of roads) for (const s of road.segments) { keys.add(hexKey(s.from)); keys.add(hexKey(s.to)); }
  return keys;
}
function cloneRoads(roads: Road[]): Road[] {
  return roads.map((road) => ({
    ...road,
    segments: road.segments.map((segment) => ({
      from: { ...segment.from },
      to: { ...segment.to },
      kind: segment.kind
    }))
  }));
}
function pruneRoadsToRegionHexes(roads: Road[], regions: Region[]): Road[] {
  const regionHexKeys = new Set(regions.flatMap((region) => region.hexes.map(hexKey)));
  return roads
    .map((road) => ({
      ...road,
      segments: road.segments.filter((segment) => regionHexKeys.has(hexKey(segment.from)) && regionHexKeys.has(hexKey(segment.to)))
    }))
    .filter((road) => road.segments.length > 0);
}
function getRoadEndpoints(road: Road, segmentKind?: RoadKind): AxialHex[] {
  const deg = new Map<string, { hex: AxialHex; d: number }>();
  for (const s of road.segments) {
    if (segmentKind && s.kind !== segmentKind) continue;
    for (const h of [s.from, s.to]) {
      const k = hexKey(h);
      const prev = deg.get(k) ?? { hex: h, d: 0 };
      prev.d += 1;
      deg.set(k, prev);
    }
  }
  return Array.from(deg.values()).filter((x) => x.d === 1).map((x) => x.hex);
}
function countRoadSegmentsTouchingHex(hex: AxialHex, roads: Road[]): number {
  const k = hexKey(hex);
  let count = 0;
  for (const road of roads) for (const s of road.segments) if (hexKey(s.from) === k || hexKey(s.to) === k) count += 1;
  return count;
}
function isLakeHex(hex: AxialHex, hexTerrainByKey: Map<string, HexTerrainData>): boolean {
  return hexTerrainByKey.get(hexKey(hex))?.terrainOverride === 'lake';
}
function isSeaHex(hex: AxialHex, hexTerrainByKey: Map<string, HexTerrainData>): boolean {
  return hexTerrainByKey.get(hexKey(hex))?.terrainOverride === 'sea';
}
// Все ключи гексов-моря из карты terrain-данных.
function getSeaHexKeys(hexTerrainByKey: Map<string, HexTerrainData>): Set<string> {
  const keys = new Set<string>();
  for (const [key, terrain] of hexTerrainByKey) {
    if (terrain.terrainOverride === 'sea') keys.add(key);
  }
  return keys;
}
function getBoundaryHexes(region: Region): AxialHex[] {
  const regionKeys = new Set(region.hexes.map(hexKey));
  return region.hexes.filter((h) => getHexNeighbors(h).some((n) => !regionKeys.has(hexKey(n))));
}

function toPixel(q: number, r: number) {
  return {
    x: HEX_SIZE * SQRT3 * (q + r / 2),
    y: HEX_SIZE * 1.5 * r
  };
}

// Расстояние В ТАЙЛАХ (число гексов) от центра карты по гексовой метрике.
function hexDistanceFromCenter(hex: AxialHex): number {
  return (Math.abs(hex.q) + Math.abs(hex.q + hex.r) + Math.abs(hex.r)) / 2;
}

function hexPoints(cx: number, cy: number, size: number) {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return points.join(' ');
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAxialHex(value: unknown): value is AxialHex {
  return isRecord(value) && typeof value.q === 'number' && Number.isFinite(value.q) && typeof value.r === 'number' && Number.isFinite(value.r);
}

function isHexTerrainData(value: unknown): value is HexTerrainData {
  if (!isRecord(value)) return false;
  const terrainOverride = value.terrainOverride;
  const lakeId = value.lakeId;
  return (
    (terrainOverride === undefined || terrainOverride === 'lake' || terrainOverride === 'sea') &&
    (lakeId === undefined || (typeof lakeId === 'number' && Number.isFinite(lakeId)))
  );
}

function assertHexcrawlSaveData(value: unknown): asserts value is ValidatedHexcrawlSaveData {
  if (!isRecord(value)) throw new Error('Файл сохранения должен быть JSON-объектом.');
  if (value.schema !== HEXCRAWL_SAVE_SCHEMA) throw new Error('Это не файл сохранения Hexcrawl.');
  if (value.version !== HEXCRAWL_SAVE_VERSION) throw new Error(`Неподдерживаемая версия сохранения: ${String(value.version)}.`);
  if (!isRecord(value.map)) throw new Error('В сохранении отсутствует объект map.');
  if (!Array.isArray(value.map.regions)) throw new Error('В сохранении отсутствует список regions.');
  if (!Array.isArray(value.map.rivers)) throw new Error('В сохранении отсутствует список rivers.');
  if (!Array.isArray(value.map.roads)) throw new Error('В сохранении отсутствует список roads.');
  if (!isRecord(value.map.terrainByHexKey)) throw new Error('В сохранении отсутствует объект terrainByHexKey.');
  for (const [key, terrain] of Object.entries(value.map.terrainByHexKey)) {
    if (!isAxialHex(parseHexKey(key))) throw new Error(`Некорректный ключ terrain-гекса ${key}.`);
    if (!isHexTerrainData(terrain)) throw new Error(`Некорректные terrain-данные для гекса ${key}.`);
  }
  for (const region of value.map.regions) {
    if (!isRecord(region)) throw new Error('Некорректная запись региона.');
    if (typeof region.id !== 'number' || !Number.isFinite(region.id)) throw new Error('У региона отсутствует числовой id.');
    if (!Array.isArray(region.hexes) || !region.hexes.every(isAxialHex)) throw new Error(`Некорректные гексы региона #${region.id}.`);
    if (!isAxialHex(region.centerHex)) throw new Error(`Некорректный centerHex региона #${region.id}.`);
    if (!isAxialHex(region.anchorHex)) throw new Error(`Некорректный anchorHex региона #${region.id}.`);
    if (!Array.isArray(region.pointsOfInterest) || !region.pointsOfInterest.every(isAxialHex)) throw new Error(`Некорректные точки интереса региона #${region.id}.`);
  }
  if (value.map.candidateHexes !== undefined && !Array.isArray(value.map.candidateHexes)) throw new Error('Некорректный список candidateHexes.');
  if (!isRecord(value.counters)) throw new Error('В сохранении отсутствует объект counters.');
  if (typeof value.counters.nextLakeId !== 'number' || !Number.isFinite(value.counters.nextLakeId)) throw new Error('Некорректный счетчик nextLakeId.');
  if (typeof value.counters.nextRoadId !== 'number' || !Number.isFinite(value.counters.nextRoadId)) throw new Error('Некорректный счетчик nextRoadId.');
  if (!isRecord(value.ui)) throw new Error('В сохранении отсутствует объект ui.');
  if (value.ui.selectedHex !== null && value.ui.selectedHex !== undefined && !isAxialHex(value.ui.selectedHex)) throw new Error('Некорректный selectedHex.');
}

function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getTimestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function createExportSvgClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const viewBox = clone.viewBox.baseVal;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(viewBox.width));
  clone.setAttribute('height', String(viewBox.height));
  clone.style.width = '';
  clone.style.height = '';

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = SVG_EXPORT_STYLES;
  clone.insertBefore(style, clone.firstChild);

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(viewBox.width));
  background.setAttribute('height', String(viewBox.height));
  background.setAttribute('fill', '#0c1423');
  clone.insertBefore(background, style.nextSibling);

  return clone;
}

async function exportSvgToPng(svg: SVGSVGElement, filename: string, scale = PNG_EXPORT_SCALE): Promise<void> {
  const clone = createExportSvgClone(svg);
  const viewBox = clone.viewBox.baseVal;
  const svgText = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Не удалось подготовить SVG для PNG-экспорта.'));
      image.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewBox.width * scale));
    canvas.height = Math.max(1, Math.ceil(viewBox.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D недоступен в этом браузере.');
    context.fillStyle = '#0c1423';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не удалось создать PNG-файл.'))), 'image/png');
    });
    downloadBlob(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл.'));
    reader.readAsText(file);
  });
}

function randomInt(min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function shuffleArray<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getHexWidth(hexSize: number): number {
  return SQRT3 * hexSize;
}

function getNewRiverFullnessForHeight(heightLevel: RegionHeightLevel): RiverFullness {
  if (heightLevel === 1) return 3;
  if (heightLevel === 2) return 2;
  return 1;
}

function getTributaryRiverFullnessForHeight(heightLevel: RegionHeightLevel): RiverFullness {
  if (heightLevel === 1) return 2;
  if (heightLevel === 2) return 1;
  return 1;
}

function getRiverWidth(hexWidth: number, fullness: RiverFullness): number {
  return hexWidth * (0.04 + fullness * 0.035);
}

function getRiverArrowScale(fullness: RiverFullness): number {
  return 0.4 + fullness * 0.2;
}

function getRegionHeightLevelFromBiomeId(biomeId: BiomeId): RegionHeightLevel {
  return BIOMES[biomeId]?.heightLevel ?? 1;
}

function getRegionHeightLabel(heightLevel: RegionHeightLevel): string {
  if (heightLevel === 3) return '3 — горы';
  if (heightLevel === 2) return '2 — холмы';
  return '1 — равнина';
}

function getHexEmojiLayout(
  emojis: string[],
  centerX: number,
  centerY: number,
  hexRadius: number
): Array<{ emoji: string; x: number; y: number; fontSize: number }> {
  const visibleEmojis = emojis.slice(0, 4);

  if (visibleEmojis.length === 0) return [];

  if (visibleEmojis.length === 1) {
    return [{ emoji: visibleEmojis[0], x: centerX, y: centerY, fontSize: clamp(hexRadius * 0.55, 16, 28) }];
  }

  if (visibleEmojis.length === 2) {
    const fontSize = clamp(hexRadius * 0.42, 14, 22);
    return [
      { emoji: visibleEmojis[0], x: centerX - hexRadius * 0.18, y: centerY, fontSize },
      { emoji: visibleEmojis[1], x: centerX + hexRadius * 0.18, y: centerY, fontSize }
    ];
  }

  if (visibleEmojis.length === 3) {
    const fontSize = clamp(hexRadius * 0.34, 12, 18);
    return [
      { emoji: visibleEmojis[0], x: centerX, y: centerY - hexRadius * 0.18, fontSize },
      { emoji: visibleEmojis[1], x: centerX - hexRadius * 0.22, y: centerY + hexRadius * 0.16, fontSize },
      { emoji: visibleEmojis[2], x: centerX + hexRadius * 0.22, y: centerY + hexRadius * 0.16, fontSize }
    ];
  }

  const fontSize = clamp(hexRadius * 0.30, 11, 16);
  return [
    { emoji: visibleEmojis[0], x: centerX - hexRadius * 0.18, y: centerY - hexRadius * 0.16, fontSize },
    { emoji: visibleEmojis[1], x: centerX + hexRadius * 0.18, y: centerY - hexRadius * 0.16, fontSize },
    { emoji: visibleEmojis[2], x: centerX - hexRadius * 0.18, y: centerY + hexRadius * 0.17, fontSize },
    { emoji: visibleEmojis[3], x: centerX + hexRadius * 0.18, y: centerY + hexRadius * 0.17, fontSize }
  ];
}

function rotateMapPoint(x: number, y: number, sourceHeight: number): { x: number; y: number } {
  return { x: sourceHeight - y, y: x };
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function vertexKey(x: number, y: number): string {
  return `${round3(x)},${round3(y)}`;
}

function randomFrom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

type CoastalPreference = 'coast' | 'mainland';

// В проекте пока нет модели моря/океана, поэтому параметр "побережье / материк"
// влияет только на выбор высоты биома: побережье тянет генерацию к низинам
// (равнины, болота, редколесья), материк — к возвышенностям (холмы, горы).
function getCoastalHeightMultiplier(heightLevel: RegionHeightLevel, preference: CoastalPreference): number {
  if (preference === 'coast') {
    if (heightLevel === 1) return 2;
    if (heightLevel === 2) return 1;
    return 0.2;
  }
  // mainland
  if (heightLevel === 1) return 0.6;
  if (heightLevel === 2) return 1.3;
  return 1.7;
}

// Параметры ручного управления генерацией региона. Любое поле, оставленное
// пустым (undefined), означает "как раньше" — то есть случайный выбор.
type GenerationOptions = {
  targetSize?: number;
  landType?: BiomeLandType;
  biomeId?: BiomeId;
  coastalPreference?: CoastalPreference;
};

const REGION_SIZE_CATEGORY_RANGES: Record<Region['sizeCategory'], [number, number]> = {
  locality: [5, 10],
  small_region: [11, 20],
  region: [21, 30],
  large_region: [31, 40],
  land: [41, 50],
  vast_land: [51, 60]
};

function rollRegionSizeInCategory(category: Region['sizeCategory']): number {
  const [min, max] = REGION_SIZE_CATEGORY_RANGES[category];
  return randomInt(min, max);
}

// Полный снимок состояния карты до добавления очередного региона.
// Используется для удаления/перегенерации последнего региона: вместо того
// чтобы пытаться "откатить" все побочные эффекты генерации рек и дорог
// (которые могут менять соседние регионы), мы просто восстанавливаем снимок.
type MapSnapshot = {
  regions: Region[];
  candidateHexes: AxialHex[];
  rivers: River[];
  roads: Road[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  nextLakeId: number;
  nextRoadId: number;
};

function chooseBiomeLandType(regionCount: number): BiomeLandType {
  if (regionCount === 0) return 'settled';
  return Math.floor(Math.random() * 100) + 1 <= 20 ? 'settled' : 'wild';
}

type BiomeCompatibilityMatrix = Partial<Record<BiomeId, Partial<Record<BiomeId, boolean>>>>;

const BIOME_COMPATIBILITY_MATRIX: BiomeCompatibilityMatrix = {
  plain_deciduous_forest: { plain_deciduous_forest: true, plain_mixed_forest: true, deciduous_forested_hills: true, swamp_forest: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true },
  plain_mixed_forest: { plain_deciduous_forest: true, plain_mixed_forest: true, plain_coniferous_forest: true, deciduous_forested_hills: true, mixed_forested_hills: true, coniferous_forested_hills: true, swamp_forest: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true, coniferous_woodland: true },
  plain_coniferous_forest: { plain_mixed_forest: true, plain_coniferous_forest: true, mixed_forested_hills: true, coniferous_forested_hills: true, mixed_woodland: true, coniferous_woodland: true },
  deciduous_forested_hills: { plain_deciduous_forest: true, plain_mixed_forest: true, deciduous_forested_hills: true, mixed_forested_hills: true, mixed_mountain_forest: true, deciduous_mountain_forest: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true },
  mixed_forested_hills: { plain_deciduous_forest: true, plain_mixed_forest: true, plain_coniferous_forest: true, deciduous_forested_hills: true, mixed_forested_hills: true, coniferous_forested_hills: true, coniferous_mountain_forest: true, mixed_mountain_forest: true, deciduous_mountain_forest: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true, coniferous_woodland: true },
  coniferous_forested_hills: { plain_mixed_forest: true, plain_coniferous_forest: true, mixed_forested_hills: true, coniferous_forested_hills: true, coniferous_mountain_forest: true, mixed_mountain_forest: true, mountain_woodland: true, mixed_woodland: true, coniferous_woodland: true },
  open_hills: { open_hills: true, mountains: true, open_plains: true, hilly_woodland: true, mountain_woodland: true, deciduous_woodland: true, mixed_woodland: true, coniferous_woodland: true, semi_desert: true },
  coniferous_mountain_forest: { mixed_forested_hills: true, coniferous_forested_hills: true, coniferous_mountain_forest: true, mixed_mountain_forest: true, mountain_woodland: true },
  mixed_mountain_forest: { deciduous_forested_hills: true, mixed_forested_hills: true, coniferous_forested_hills: true, coniferous_mountain_forest: true, mixed_mountain_forest: true, deciduous_mountain_forest: true, hilly_woodland: true, mountain_woodland: true },
  deciduous_mountain_forest: { deciduous_forested_hills: true, mixed_forested_hills: true, mixed_mountain_forest: true, deciduous_mountain_forest: true, hilly_woodland: true, mountain_woodland: true },
  mountains: { open_hills: true, mountains: true, hilly_woodland: true, mountain_woodland: true },
  open_plains: { open_hills: true, open_plains: true, swamp: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true, coniferous_woodland: true, semi_desert: true },
  swamp_forest: { plain_deciduous_forest: true, plain_mixed_forest: true, swamp_forest: true, swamp: true, deciduous_woodland: true, mixed_woodland: true },
  swamp: { open_plains: true, swamp_forest: true, swamp: true, deciduous_woodland: true, mixed_woodland: true, coniferous_woodland: true },
  hilly_woodland: { plain_deciduous_forest: true, plain_mixed_forest: true, deciduous_forested_hills: true, mixed_forested_hills: true, open_hills: true, mixed_mountain_forest: true, deciduous_mountain_forest: true, mountains: true, open_plains: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true, semi_desert: true },
  mountain_woodland: { coniferous_forested_hills: true, open_hills: true, coniferous_mountain_forest: true, mixed_mountain_forest: true, deciduous_mountain_forest: true, mountains: true, mountain_woodland: true },
  deciduous_woodland: { plain_deciduous_forest: true, plain_mixed_forest: true, deciduous_forested_hills: true, mixed_forested_hills: true, open_hills: true, open_plains: true, swamp_forest: true, swamp: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true, semi_desert: true },
  mixed_woodland: { plain_deciduous_forest: true, plain_mixed_forest: true, plain_coniferous_forest: true, deciduous_forested_hills: true, mixed_forested_hills: true, coniferous_forested_hills: true, open_hills: true, open_plains: true, swamp_forest: true, swamp: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true, coniferous_woodland: true, semi_desert: true },
  coniferous_woodland: { plain_mixed_forest: true, plain_coniferous_forest: true, mixed_forested_hills: true, coniferous_forested_hills: true, open_hills: true, open_plains: true, swamp: true, mixed_woodland: true, coniferous_woodland: true, semi_desert: true },
  semi_desert: { open_hills: true, open_plains: true, hilly_woodland: true, deciduous_woodland: true, mixed_woodland: true, coniferous_woodland: true, semi_desert: true }
};

function isBiomesCompatible(biomeA: BiomeId, biomeB: BiomeId, compatibilityMatrix: BiomeCompatibilityMatrix): boolean {
  const direct = compatibilityMatrix[biomeA]?.[biomeB];
  if (typeof direct === 'boolean') return direct;
  const reverse = compatibilityMatrix[biomeB]?.[biomeA];
  if (typeof reverse === 'boolean') return reverse;
  return false;
}


function chooseWeightedRandom(weights: Record<BiomeId, number>): BiomeId {
  const total = Object.values(weights).reduce((acc, value) => acc + value, 0);
  if (total <= 0) return FALLBACK_BIOME_ID;
  let roll = Math.random() * total;
  for (const biomeId of Object.keys(weights) as BiomeId[]) {
    roll -= weights[biomeId];
    if (roll <= 0) return biomeId;
  }
  const biomeIds = Object.keys(weights) as BiomeId[];
  return biomeIds[biomeIds.length - 1] ?? FALLBACK_BIOME_ID;
}

function isBiomeAllowedByRiverHeightConstraint(
  biomeId: BiomeId,
  constraint: RiverHeightConstraint
): boolean {
  const height = BIOMES[biomeId]?.heightLevel ?? 1;

  if (constraint.minHeight !== undefined && height < constraint.minHeight) return false;
  if (constraint.maxHeight !== undefined && height > constraint.maxHeight) return false;

  return true;
}

function chooseBiomeId(
  landType: BiomeLandType,
  adjacentBiomeIds: BiomeId[],
  regionId?: number,
  riverHeightConstraint?: RiverHeightConstraint,
  coastalPreference?: CoastalPreference
): ChooseBiomeResult {
  const baseWeights = {} as Record<BiomeId, number>;
  for (const biome of Object.values(BIOMES)) {
    baseWeights[biome.id] = landType === 'settled' ? biome.settledWeight : biome.wildWeight;
  }

  if (coastalPreference) {
    for (const biome of Object.values(BIOMES)) {
      baseWeights[biome.id] *= getCoastalHeightMultiplier(biome.heightLevel, coastalPreference);
    }
  }

  const uniqueAdjacentBiomeIds = new Set(adjacentBiomeIds);
  const strictWeights = { ...baseWeights };

  for (const candidateBiomeId of Object.keys(strictWeights) as BiomeId[]) {
    if (
      riverHeightConstraint &&
      !isBiomeAllowedByRiverHeightConstraint(candidateBiomeId, riverHeightConstraint)
    ) {
      strictWeights[candidateBiomeId] = 0;
      continue;
    }

    if (uniqueAdjacentBiomeIds.has(candidateBiomeId)) {
      strictWeights[candidateBiomeId] = 0;
      continue;
    }

    const isIncompatibleWithAdjacent = adjacentBiomeIds.some(
      (adjacentBiomeId) => !isBiomesCompatible(candidateBiomeId, adjacentBiomeId, BIOME_COMPATIBILITY_MATRIX)
    );

    if (isIncompatibleWithAdjacent) strictWeights[candidateBiomeId] = 0;
  }

  const strictWeightSum = Object.values(strictWeights).reduce((acc, value) => acc + value, 0);
  if (strictWeightSum > 0) return { biomeId: chooseWeightedRandom(strictWeights) };

  if (adjacentBiomeIds.length > 0) {
    const relaxedWeights = { ...baseWeights };
    for (const adjacentBiomeId of uniqueAdjacentBiomeIds) relaxedWeights[adjacentBiomeId] = 0;
    for (const candidateBiomeId of Object.keys(relaxedWeights) as BiomeId[]) {
      if (
        riverHeightConstraint &&
        !isBiomeAllowedByRiverHeightConstraint(candidateBiomeId, riverHeightConstraint)
      ) {
        relaxedWeights[candidateBiomeId] = 0;
      }
    }
    const relaxedWeightSum = Object.values(relaxedWeights).reduce((acc, value) => acc + value, 0);

    console.log('Biome strict filter had no available weights; restored incompatible biome weights', {
      regionId,
      biomeLandType: landType,
      adjacentBiomeIds
    });

    if (relaxedWeightSum > 0) return { biomeId: chooseWeightedRandom(relaxedWeights) };
  }

  const fallbackBiomeId = landType === 'settled'
    ? FALLBACK_SETTLED_BIOME_ID
    : FALLBACK_WILD_BIOME_ID;

  if (
    riverHeightConstraint &&
    !isBiomeAllowedByRiverHeightConstraint(fallbackBiomeId, riverHeightConstraint)
  ) {
    return { biomeId: null, reason: 'river_height_constraint_failed' };
  }

  return { biomeId: fallbackBiomeId };
}

function getAdjacentRegionBiomes(regionHexes: AxialHex[], regionByHexKey: Map<string, Region>): BiomeId[] {
  const biomeIds = new Set<BiomeId>();

  for (const hex of regionHexes) {
    for (const neighbor of getHexNeighbors(hex)) {
      const neighborRegion = regionByHexKey.get(hexKey(neighbor));

      if (neighborRegion?.biomeId) {
        biomeIds.add(neighborRegion.biomeId);
      }
    }
  }

  return Array.from(biomeIds);
}

function getHexCornerPoints(hex: AxialHex): RiverVertex[] {
  const { x, y } = toPixel(hex.q, hex.r);
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const vx = x + HEX_SIZE * Math.cos(angle);
    const vy = y + HEX_SIZE * Math.sin(angle);
    return { x: vx, y: vy, key: vertexKey(vx, vy) };
  });
}

function getHexEdgesAsVertexPairs(hex: AxialHex): HexEdge[] {
  const corners = getHexCornerPoints(hex);
  return HEX_EDGE_DIRECTIONS.map((direction, i) => ({
    from: corners[i],
    to: corners[(i + 1) % 6],
    neighborHex: { q: hex.q + direction.q, r: hex.r + direction.r },
    edgeKey: [corners[i].key, corners[(i + 1) % 6].key].sort().join('|')
  }));
}

function getRiverVertexDistance(a: RiverVertex, b: RiverVertex): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getHexEdgeKeys(hex: AxialHex): Set<string> {
  return new Set(getHexEdgesAsVertexPairs(hex).map((edge) => edge.edgeKey));
}

function riverPathTouchesCenterHex(
  path: RiverVertex[],
  centerHex: AxialHex | undefined,
  riverGraph: RiverGraph
): boolean {
  if (!centerHex) return false;

  const centerHexEdgeKeys = getHexEdgeKeys(centerHex);
  const pathEdgeKeys = getRiverPathEdgeKeys(path, riverGraph);

  if (!pathEdgeKeys) return false;

  return pathEdgeKeys.some((pathEdgeKey) => centerHexEdgeKeys.has(pathEdgeKey));
}

function riverPathTouchesCenterHexVertex(
  path: RiverVertex[],
  centerHex: AxialHex | undefined
): boolean {
  if (!centerHex || path.length === 0) return false;
  const centerVertexKeys = new Set(getHexCornerPoints(centerHex).map((vertex) => vertex.key));
  return path.some((vertex) => centerVertexKeys.has(vertex.key));
}



function getAdjacentHexesForVertex(vertex: RiverVertex, sourceHex: AxialHex): AxialHex[] {
  const corners = getHexCornerPoints(sourceHex);
  const cornerIndex = corners.findIndex((corner) => corner.key === vertex.key);
  if (cornerIndex === -1) return [sourceHex];
  const leftDirection = (cornerIndex + 5) % 6;
  const rightDirection = cornerIndex;
  const adjacent = new Map<string, AxialHex>();
  adjacent.set(hexKey(sourceHex), sourceHex);
  const leftHex = getHexEdgeNeighbor(sourceHex, leftDirection);
  const rightHex = getHexEdgeNeighbor(sourceHex, rightDirection);
  if (leftHex) adjacent.set(hexKey(leftHex), leftHex);
  if (rightHex) adjacent.set(hexKey(rightHex), rightHex);
  return Array.from(adjacent.values());
}

function isRegionExteriorVertex(vertex: RiverVertex, regionHexes: AxialHex[]): boolean {
  if (regionHexes.length === 0) return false;
  const regionSet = new Set(regionHexes.map(hexKey));
  const sourceHexes = regionHexes.filter((hex) => getHexCornerPoints(hex).some((corner) => corner.key === vertex.key));
  if (sourceHexes.length === 0) return false;
  const adjacentHexes = new Map<string, AxialHex>();
  for (const sourceHex of sourceHexes) {
    for (const adjacentHex of getAdjacentHexesForVertex(vertex, sourceHex)) {
      adjacentHexes.set(hexKey(adjacentHex), adjacentHex);
    }
  }
  return Array.from(adjacentHexes.keys()).some((key) => !regionSet.has(key));
}

function getRegionExteriorVertices(regionHexes: AxialHex[]): RiverVertex[] {
  const unique = new Map<string, RiverVertex>();
  for (const hex of regionHexes) {
    for (const vertex of getHexCornerPoints(hex)) {
      if (isRegionExteriorVertex(vertex, regionHexes)) {
        unique.set(vertex.key, vertex);
      }
    }
  }
  return Array.from(unique.values());
}

function getRegionSharedVertices(
  region: Region,
  regions: Region[] = [],
  candidateHexes: AxialHex[] = []
): { candidateVertices: RiverVertex[]; neighborRegionVertices: RiverVertex[] } {
  if (!region?.hexes?.length) return { candidateVertices: [], neighborRegionVertices: [] };
  const currentRegionHexKeys = new Set(region.hexes.map(hexKey));
  const vertexUsageByKey = new Map<string, VertexUsage>();

  const addHexUsage = (hex: AxialHex, kind: 'current' | 'other' | 'candidate') => {
    for (const vertex of getHexCornerPoints(hex)) {
      const usage = vertexUsageByKey.get(vertex.key) ?? {
        vertex,
        currentRegionCount: 0,
        otherRegionCount: 0,
        candidateCount: 0
      };
      if (kind === 'current') usage.currentRegionCount += 1;
      if (kind === 'other') usage.otherRegionCount += 1;
      if (kind === 'candidate') usage.candidateCount += 1;
      vertexUsageByKey.set(vertex.key, usage);
    }
  };

  for (const hex of region.hexes) addHexUsage(hex, 'current');
  for (const otherRegion of regions) {
    if (otherRegion.id === region.id) continue;
    for (const hex of otherRegion.hexes) addHexUsage(hex, 'other');
  }
  for (const candidateHex of candidateHexes) {
    if (currentRegionHexKeys.has(hexKey(candidateHex))) continue;
    addHexUsage(candidateHex, 'candidate');
  }

  const uniqueCandidate = new Map<string, RiverVertex>();
  const uniqueNeighborRegion = new Map<string, RiverVertex>();
  for (const hex of region.hexes) {
    for (const vertex of getHexCornerPoints(hex)) {
      const usage = vertexUsageByKey.get(vertex.key) ?? {
        vertex,
        currentRegionCount: 0,
        otherRegionCount: 0,
        candidateCount: 0
      };
      if (usage.currentRegionCount > 0 && usage.candidateCount > 0) uniqueCandidate.set(vertex.key, vertex);
      if (usage.currentRegionCount > 0 && usage.otherRegionCount > 0) uniqueNeighborRegion.set(vertex.key, vertex);
    }
  }
  return { candidateVertices: Array.from(uniqueCandidate.values()), neighborRegionVertices: Array.from(uniqueNeighborRegion.values()) };
}

function getVertexUsageByKeyForRegion(
  region: Region,
  regions: Region[] = [],
  candidateHexes: AxialHex[] = []
): Map<string, VertexUsage> {
  const map = new Map<string, VertexUsage>();
  if (!region?.hexes?.length) return map;
  const currentRegionHexKeys = new Set(region.hexes.map(hexKey));
  const addHexUsage = (hex: AxialHex, kind: 'current' | 'other' | 'candidate') => {
    for (const vertex of getHexCornerPoints(hex)) {
      const usage = map.get(vertex.key) ?? {
        vertex,
        currentRegionCount: 0,
        otherRegionCount: 0,
        candidateCount: 0
      };
      if (kind === 'current') usage.currentRegionCount += 1;
      if (kind === 'other') usage.otherRegionCount += 1;
      if (kind === 'candidate') usage.candidateCount += 1;
      map.set(vertex.key, usage);
    }
  };
  for (const hex of region.hexes) addHexUsage(hex, 'current');
  for (const otherRegion of regions) {
    if (otherRegion.id === region.id) continue;
    for (const hex of otherRegion.hexes) addHexUsage(hex, 'other');
  }
  for (const candidateHex of candidateHexes) {
    if (currentRegionHexKeys.has(hexKey(candidateHex))) continue;
    addHexUsage(candidateHex, 'candidate');
  }
  return map;
}

function getLakesForRegion(
  region: Region,
  hexTerrainByKey: Map<string, HexTerrainData>
): Lake[] {
  const lakeHexesById = new Map<number, AxialHex[]>();
  for (const hex of region.hexes) {
    const terrain = hexTerrainByKey.get(hexKey(hex));
    if (terrain?.terrainOverride !== 'lake' || terrain.lakeId === undefined) continue;
    const hexes = lakeHexesById.get(terrain.lakeId) ?? [];
    hexes.push(hex);
    lakeHexesById.set(terrain.lakeId, hexes);
  }

  return Array.from(lakeHexesById.entries()).map(([lakeId, hexes]) => {
    const verticesByKey = new Map<string, RiverVertex>();
    for (const hex of hexes) {
      for (const vertex of getHexCornerPoints(hex)) verticesByKey.set(vertex.key, vertex);
    }
    return { lakeId, hexes, vertices: Array.from(verticesByKey.values()) };
  });
}

function getLakesForRegions(regions: Region[], hexTerrainByKey: Map<string, HexTerrainData>): Lake[] {
  return regions.flatMap((region) => getLakesForRegion(region, hexTerrainByKey));
}

function getRiverEdgeKey(a: RiverVertex, b: RiverVertex): string {
  return edgeKey(a, b);
}

function getRiverEndpointReason(
  index: number,
  lastIndex: number,
  vertexKey: string,
  lakeVertexKeys: Set<string>,
  confluenceVertexKeys: Set<string>,
  regionBoundaryVertexKeys: Set<string>,
  endpoint: 'start' | 'end'
): RiverSector['startReason'] | RiverSector['endReason'] {
  if (lakeVertexKeys.has(vertexKey)) return 'lake';
  if (confluenceVertexKeys.has(vertexKey)) return 'river_confluence';
  if (endpoint === 'start' && index === 0) return 'river_start';
  if (endpoint === 'end' && index === lastIndex) return 'river_end';
  if (regionBoundaryVertexKeys.has(vertexKey)) return 'region_boundary';
  return 'split';
}

function getRiverSimpleEdgeKeys(vertexPath: RiverVertex[]): string[] {
  const edgeKeys: string[] = [];
  for (let i = 1; i < vertexPath.length; i += 1) {
    edgeKeys.push(getRiverEdgeKey(vertexPath[i - 1], vertexPath[i]));
  }
  return edgeKeys;
}

function createInitialRiverSectors(
  riverId: number | string,
  vertexPath: RiverVertex[],
  fullness: RiverFullness = 1,
  reasons: Partial<Pick<RiverSector, 'startReason' | 'endReason'>> = {},
  assignedRegionId?: number
): RiverSector[] {
  if (vertexPath.length < 2) return [];

  return [{
    id: `${riverId}:sector:1`,
    riverId,
    sectorIndex: 1,
    vertexPath,
    edgeKeys: getRiverSimpleEdgeKeys(vertexPath),
    startVertexKey: vertexPath[0].key,
    endVertexKey: vertexPath[vertexPath.length - 1].key,
    startReason: reasons.startReason ?? 'river_start',
    endReason: reasons.endReason ?? 'river_end',
    fullness,
    assignedRegionId
  }];
}



function getRiverSectorFullnessByEdge(river: River): Map<string, RiverFullness> {
  const fullnessByEdge = new Map<string, RiverFullness>();
  for (const sector of river.sectors ?? []) {
    for (const edgeKey of sector.edgeKeys ?? []) {
      fullnessByEdge.set(edgeKey, sector.fullness ?? 1);
    }
  }
  return fullnessByEdge;
}

function getRiverSectorAssignedRegionByEdge(river: River): Map<string, number> {
  const assignedRegionByEdge = new Map<string, number>();
  for (const sector of river.sectors ?? []) {
    if (sector.assignedRegionId === undefined) continue;
    for (const edgeKey of sector.edgeKeys ?? []) {
      if (!assignedRegionByEdge.has(edgeKey)) {
        assignedRegionByEdge.set(edgeKey, sector.assignedRegionId);
      }
    }
  }
  return assignedRegionByEdge;
}

function getRiverSectorAssignedRegion(
  edgeKeys: string[],
  assignedRegionByEdge: Map<string, number>,
  fallbackRegionId: number
): number {
  for (const edgeKey of edgeKeys) {
    const assignedRegionId = assignedRegionByEdge.get(edgeKey);
    if (assignedRegionId !== undefined) return assignedRegionId;
  }
  return fallbackRegionId;
}

function getRiverFallbackFullness(river: River): RiverFullness {
  return river.sectors?.[0]?.fullness ?? 1;
}

function getRiverSectorFullness(edgeKeys: string[], fullnessByEdge: Map<string, RiverFullness>, fallback: RiverFullness): RiverFullness {
  for (const edgeKey of edgeKeys) {
    const fullness = fullnessByEdge.get(edgeKey);
    if (fullness) return fullness;
  }
  return fallback;
}

function getMaxRiverSectorIndex(river: River): number {
  return Math.max(0, ...(river.sectors ?? []).map((sector) => sector.sectorIndex));
}

function getMinRiverSectorIndex(river: River): number {
  return Math.min(1, ...(river.sectors ?? []).map((sector) => sector.sectorIndex));
}

function withRiverSectorOrder(riverId: number | string, sectors: RiverSector[], firstSectorIndex: number): RiverSector[] {
  return sectors.map((sector, index) => {
    const sectorIndex = firstSectorIndex + index;
    return {
      ...sector,
      id: `${riverId}:sector:${sectorIndex}:${sector.startVertexKey}:${sector.endVertexKey}`,
      riverId,
      sectorIndex
    };
  });
}

function getRegionBoundaryVertexKeys(regions: Region[]): Set<string> {
  const regionIdsByVertexKey = new Map<string, Set<number>>();

  for (const region of regions) {
    for (const hex of region.hexes) {
      for (const vertex of getHexCornerPoints(hex)) {
        const regionIds = regionIdsByVertexKey.get(vertex.key) ?? new Set<number>();
        regionIds.add(region.id);
        regionIdsByVertexKey.set(vertex.key, regionIds);
      }
    }
  }

  const boundaryVertexKeys = new Set<string>();
  for (const [vertexKey, regionIds] of regionIdsByVertexKey.entries()) {
    if (regionIds.size > 1) boundaryVertexKeys.add(vertexKey);
  }
  return boundaryVertexKeys;
}

function getRiverFullnessAtEndpointVertex(rivers: River[], vertexKey: string, excludedRiverId?: number): RiverFullness | null {
  let fullness: RiverFullness | null = null;

  for (const river of rivers) {
    if (excludedRiverId !== undefined && river.id === excludedRiverId) continue;
    const firstVertex = river.vertexPath[0];
    const lastVertex = river.vertexPath[river.vertexPath.length - 1];
    if (firstVertex?.key !== vertexKey && lastVertex?.key !== vertexKey) continue;

    const endpointFullness = getRiverFullnessAtVertex(river, vertexKey);
    if (fullness === null || endpointFullness > fullness) fullness = endpointFullness;
  }

  return fullness;
}

function chooseRiverFullnessFromAdjacentSectors(
  vertexPath: RiverVertex[],
  existingRivers: River[],
  fallbackFullness: RiverFullness,
  preferredFullness?: RiverFullness,
  excludedRiverId?: number
): RiverFullness {
  const startVertexKey = vertexPath[0]?.key;
  const endVertexKey = vertexPath[vertexPath.length - 1]?.key;
  const startFullness = startVertexKey ? getRiverFullnessAtEndpointVertex(existingRivers, startVertexKey, excludedRiverId) : null;
  const endFullness = endVertexKey ? getRiverFullnessAtEndpointVertex(existingRivers, endVertexKey, excludedRiverId) : null;

  if (startFullness !== null && endFullness !== null && startFullness !== endFullness) {
    return preferredFullness ?? startFullness;
  }
  return startFullness ?? endFullness ?? preferredFullness ?? fallbackFullness;
}

function getExistingRiverSectorBreakIndices(river: River, vertexPath: RiverVertex[]): Set<number> {
  const sectorBoundaryVertexKeys = new Set<string>();
  for (const sector of river.sectors ?? []) {
    sectorBoundaryVertexKeys.add(sector.startVertexKey);
    sectorBoundaryVertexKeys.add(sector.endVertexKey);
  }

  const breakIndices = new Set<number>();
  vertexPath.forEach((vertex, index) => {
    if (sectorBoundaryVertexKeys.has(vertex.key)) breakIndices.add(index);
  });
  return breakIndices;
}

function normalizeRiverSectorOrder(riverId: number | string, sectors: RiverSector[]): RiverSector[] {
  return sectors.map((sector, index) => {
    const sectorIndex = index + 1;
    return {
      ...sector,
      id: `${riverId}:sector:${sectorIndex}:${sector.startVertexKey}:${sector.endVertexKey}`,
      riverId,
      sectorIndex
    };
  });
}

function prependRiverPathSector(river: River, path: RiverVertex[], fullness: RiverFullness, assignedRegionId?: number): RiverSector[] {
  const createdSectors = createInitialRiverSectors(river.id, path, fullness, { endReason: 'region_boundary' }, assignedRegionId);
  if (createdSectors.length === 0) return river.sectors ?? [];

  const firstSectorIndex = getMinRiverSectorIndex(river) - createdSectors.length;
  return [
    ...withRiverSectorOrder(river.id, createdSectors, firstSectorIndex),
    ...(river.sectors ?? [])
  ];
}

function appendRiverPathSector(river: River, path: RiverVertex[], fullness: RiverFullness, assignedRegionId?: number): RiverSector[] {
  const createdSectors = createInitialRiverSectors(river.id, path, fullness, { startReason: 'region_boundary' }, assignedRegionId);
  if (createdSectors.length === 0) return river.sectors ?? [];

  const firstSectorIndex = getMaxRiverSectorIndex(river) + 1;
  return [
    ...(river.sectors ?? []),
    ...withRiverSectorOrder(river.id, createdSectors, firstSectorIndex)
  ];
}



function getRiverDownstreamFullness(river: River): RiverFullness {
  const downstreamVertexKey = river.vertexPath?.[river.vertexPath.length - 1]?.key;
  const downstreamSector = downstreamVertexKey
    ? [...(river.sectors ?? [])].reverse().find((sector) => sector.endVertexKey === downstreamVertexKey)
    : undefined;
  return downstreamSector?.fullness ?? river.sectors?.[river.sectors.length - 1]?.fullness ?? getRiverFallbackFullness(river);
}

function getRiverFullnessAtVertex(river: River, vertexKey: string): RiverFullness {
  let fullness: RiverFullness = getRiverFallbackFullness(river);

  for (const sector of river.sectors ?? []) {
    const touchesVertex = sector.startVertexKey === vertexKey
      || sector.endVertexKey === vertexKey
      || sector.vertexPath.some((vertex) => vertex.key === vertexKey);
    if (touchesVertex && sector.fullness > fullness) fullness = sector.fullness;
  }

  return fullness;
}

function getMaxTributaryFullnessAtVertex(
  river: River,
  vertexKey: string,
  riverIdsByVertexKey: Map<string, Set<number | string>>,
  riversById: Map<number | string, River>
): RiverFullness | null {
  const riverIds = riverIdsByVertexKey.get(vertexKey);
  if (!riverIds) return null;

  let maxFullness: RiverFullness | null = null;
  for (const riverId of riverIds) {
    if (riverId === river.id) continue;
    const tributary = riversById.get(riverId);
    if (!tributary) continue;
    const tributaryFullness = getRiverFullnessAtVertex(tributary, vertexKey);
    if (maxFullness === null || tributaryFullness > maxFullness) maxFullness = tributaryFullness;
  }

  return maxFullness;
}

function getIncreasedRiverFullnessAfterTributary(
  currentFullness: RiverFullness,
  maxTributaryFullness: RiverFullness | null
): RiverFullness {
  if (currentFullness === 4 && maxTributaryFullness !== null && maxTributaryFullness >= 3) return 5;
  if (currentFullness === 3 && maxTributaryFullness !== null && maxTributaryFullness >= 2) return 4;
  if (currentFullness === 2 && maxTributaryFullness !== null) return 3;
  return currentFullness;
}

type CandidateBoundaryByHeight = Map<RegionHeightLevel, { edgeKeys: Set<string>; vertexKeys: Set<string> }>;

type RiverFullnessRuleState = {
  confluenceTributaryFullnessByIndex: Map<number, RiverFullness>;
  allowConfluenceFullnessIncrease: boolean;
  reduceHeightTwoUpstreamBeforeConfluence: boolean;
  firstConfluenceIndex?: number;
};

function buildCandidateBoundaryByHeight(regions: Region[] = [], candidateHexes: AxialHex[] = []): CandidateBoundaryByHeight {
  const boundaryByHeight: CandidateBoundaryByHeight = new Map();
  if (regions.length === 0 || candidateHexes.length === 0) return boundaryByHeight;

  for (const region of regions) {
    const boundary = boundaryByHeight.get(region.heightLevel) ?? { edgeKeys: new Set<string>(), vertexKeys: new Set<string>() };
    for (const edge of getCandidateBoundaryEdgesForRegion(region.hexes, candidateHexes)) {
      boundary.edgeKeys.add(edge.edgeKey);
      boundary.vertexKeys.add(edge.from.key);
      boundary.vertexKeys.add(edge.to.key);
    }
    boundaryByHeight.set(region.heightLevel, boundary);
  }

  return boundaryByHeight;
}

function riverEndpointTouchesCandidateBoundary(
  river: River,
  endpoint: 'upstream' | 'downstream',
  candidateBoundaryByHeight: CandidateBoundaryByHeight,
  heightLevel?: RegionHeightLevel
): boolean {
  const vertexPath = river.vertexPath ?? [];
  if (vertexPath.length < 2) return false;

  const boundaries = heightLevel !== undefined
    ? [candidateBoundaryByHeight.get(heightLevel)].filter((boundary): boundary is { edgeKeys: Set<string>; vertexKeys: Set<string> } => Boolean(boundary))
    : Array.from(candidateBoundaryByHeight.values());
  if (boundaries.length === 0) return false;

  const endpointIndex = endpoint === 'upstream' ? 0 : vertexPath.length - 1;
  const adjacentIndex = endpoint === 'upstream' ? 1 : vertexPath.length - 2;
  const endpointVertex = vertexPath[endpointIndex];
  const endpointEdgeKey = getRiverEdgeKey(endpointVertex, vertexPath[adjacentIndex]);

  // Prefer a candidate-facing endpoint edge, but also accept the terminal
  // endpoint vertex itself. Some valid rivers end on a candidate hex corner while
  // their last drawn segment follows another incident region edge, so edge-only
  // matching misses a downstream exit that is still present on the candidate.
  return boundaries.some((boundary) => boundary.edgeKeys.has(endpointEdgeKey) || boundary.vertexKeys.has(endpointVertex.key));
}

function getConfluenceTributaryFullnessByIndex(
  river: River,
  riverIdsByVertexKey: Map<string, Set<number | string>>,
  riversById: Map<number | string, River>
): Map<number, RiverFullness> {
  const result = new Map<number, RiverFullness>();
  const vertexPath = river.vertexPath ?? [];
  if (vertexPath.length < 3) return result;

  for (let index = 1; index < vertexPath.length - 1; index += 1) {
    const maxTributaryFullness = getMaxTributaryFullnessAtVertex(
      river,
      vertexPath[index].key,
      riverIdsByVertexKey,
      riversById
    );
    if (maxTributaryFullness !== null) result.set(index, maxTributaryFullness);
  }

  return result;
}

function buildRiverFullnessRuleState(
  river: River,
  riverIdsByVertexKey: Map<string, Set<number | string>>,
  riversById: Map<number | string, River>,
  candidateBoundaryByHeight: CandidateBoundaryByHeight
): RiverFullnessRuleState {
  const confluenceTributaryFullnessByIndex = getConfluenceTributaryFullnessByIndex(river, riverIdsByVertexKey, riversById);
  const confluenceIndices = Array.from(confluenceTributaryFullnessByIndex.keys());
  const allowConfluenceFullnessIncrease = confluenceIndices.length > 0 && riverEndpointTouchesCandidateBoundary(
    river,
    'downstream',
    candidateBoundaryByHeight
  );
  const reduceHeightTwoUpstreamBeforeConfluence = confluenceIndices.length > 0 && riverEndpointTouchesCandidateBoundary(
    river,
    'upstream',
    candidateBoundaryByHeight,
    2
  );

  return {
    confluenceTributaryFullnessByIndex,
    allowConfluenceFullnessIncrease,
    reduceHeightTwoUpstreamBeforeConfluence,
    firstConfluenceIndex: confluenceIndices.length > 0 ? Math.min(...confluenceIndices) : undefined
  };
}

function isDownstreamOfConfluenceFullnessIncrease(
  fromIndex: number,
  ruleState: RiverFullnessRuleState
): boolean {
  return ruleState.allowConfluenceFullnessIncrease
    && Array.from(ruleState.confluenceTributaryFullnessByIndex.keys()).some((confluenceIndex) => confluenceIndex < fromIndex);
}

function applyRiverFullnessRules(
  currentDownstreamFullness: RiverFullness,
  fromIndex: number,
  toIndex: number,
  ruleState: RiverFullnessRuleState
): { downstreamFullness: RiverFullness; sectorFullness: RiverFullness } {
  let downstreamFullness = currentDownstreamFullness;

  // A confluence raises the carried downstream fullness when the combined flow
  // has a downstream candidate exit. The raised value then propagates through
  // subsequent sectors until the river reaches that candidate-facing endpoint.
  const tributaryFullnessAtSectorStart = ruleState.confluenceTributaryFullnessByIndex.get(fromIndex) ?? null;
  if (ruleState.allowConfluenceFullnessIncrease && tributaryFullnessAtSectorStart !== null) {
    downstreamFullness = getIncreasedRiverFullnessAfterTributary(
      downstreamFullness,
      tributaryFullnessAtSectorStart
    );
  }

  let sectorFullness = downstreamFullness;
  if (
    ruleState.reduceHeightTwoUpstreamBeforeConfluence
    && sectorFullness === 3
    && ruleState.firstConfluenceIndex !== undefined
    && fromIndex < ruleState.firstConfluenceIndex
    && toIndex <= ruleState.firstConfluenceIndex
  ) {
    sectorFullness = 2;
  }

  return { downstreamFullness, sectorFullness };
}

function validateExistingRiverEdgeFullnessPreserved(previousRivers: River[], nextRivers: River[]): boolean {
  const previousFullnessByEdge = getRiverCrossingFullnessByEdge(previousRivers);
  const nextFullnessByEdge = getRiverCrossingFullnessByEdge(nextRivers);
  const changedEdges: Array<{ edgeKey: string; previousFullness: RiverFullness; nextFullness: RiverFullness }> = [];

  for (const [edgeKey, previousFullness] of previousFullnessByEdge.entries()) {
    const nextFullness = nextFullnessByEdge.get(edgeKey);
    if (nextFullness !== undefined && nextFullness !== previousFullness) {
      changedEdges.push({ edgeKey, previousFullness, nextFullness });
    }
  }

  if (changedEdges.length > 0) {
    console.warn('Rejecting river update because existing river edge fullness changed', { changedEdges });
    return false;
  }
  return true;
}

function assignRiverSectors(rivers: River[], lakes: Lake[], regions: Region[] = [], candidateHexes: AxialHex[] = []): River[] {
  const riversById = new Map<number | string, River>();
  for (const river of rivers) riversById.set(river.id, river);

  const riverIdsByVertexKey = new Map<string, Set<number | string>>();
  for (const river of rivers) {
    for (const vertex of river.vertexPath ?? []) {
      const riverIds = riverIdsByVertexKey.get(vertex.key) ?? new Set<number | string>();
      riverIds.add(river.id);
      riverIdsByVertexKey.set(vertex.key, riverIds);
    }
  }

  const lakeExteriorVertexKeysByLakeId = new Map<number, Set<string>>();
  const lakeVertexKeys = new Set<string>();
  const regionBoundaryVertexKeys = getRegionBoundaryVertexKeys(regions);
  const candidateBoundaryByHeight = buildCandidateBoundaryByHeight(regions, candidateHexes);
  for (const lake of lakes) {
    const exteriorKeys = new Set(getRegionExteriorVertices(lake.hexes).map((vertex) => vertex.key));
    lakeExteriorVertexKeysByLakeId.set(lake.lakeId, exteriorKeys);
    for (const key of exteriorKeys) lakeVertexKeys.add(key);
  }

  const nextRivers = rivers.map((river) => {
    try {
      const vertexPath = river.vertexPath ?? [];
      if (vertexPath.length < 2) {
        console.warn('Could not assign river sectors: river path is too short', { riverId: river.id, vertexCount: vertexPath.length });
        return { ...river, sectors: [] };
      }

      const lastIndex = vertexPath.length - 1;
      const existingFullnessByEdge = getRiverSectorFullnessByEdge(river);
      const existingAssignedRegionByEdge = getRiverSectorAssignedRegionByEdge(river);
      const fallbackFullness = getRiverFallbackFullness(river);
      const breakIndices = getExistingRiverSectorBreakIndices(river, vertexPath);
      breakIndices.add(0);
      breakIndices.add(lastIndex);
      const confluenceVertexKeys = new Set<string>();
      const riverFullnessRuleState = buildRiverFullnessRuleState(
        river,
        riverIdsByVertexKey,
        riversById,
        candidateBoundaryByHeight
      );

      vertexPath.forEach((vertex, index) => {
        const riverIds = riverIdsByVertexKey.get(vertex.key);
        if (riverIds && Array.from(riverIds).some((riverId) => riverId !== river.id)) {
          confluenceVertexKeys.add(vertex.key);
          breakIndices.add(index);
        }
        // Joining a new region can turn an old river vertex into a region-boundary vertex.
        // That must not create a new sector by itself: existing sector borders are restored
        // from river.sectors above, while true topology changes (confluences and lakes)
        // still add their own break points here.
      });

      for (const lakeVertexKeysForLake of lakeExteriorVertexKeysByLakeId.values()) {
        const firstLakeContactIndex = vertexPath.findIndex((vertex) => lakeVertexKeysForLake.has(vertex.key));
        if (firstLakeContactIndex > 0 && firstLakeContactIndex < lastIndex) {
          breakIndices.add(firstLakeContactIndex);
        }
      }

      const sortedBreakIndices = Array.from(breakIndices).sort((a, b) => a - b);
      const sectors: RiverSector[] = [];
      let downstreamFullness: RiverFullness = fallbackFullness;

      for (let i = 1; i < sortedBreakIndices.length; i += 1) {
        const fromIndex = sortedBreakIndices[i - 1];
        const toIndex = sortedBreakIndices[i];
        if (toIndex <= fromIndex) continue;

        const sectorPath = vertexPath.slice(fromIndex, toIndex + 1);
        if (sectorPath.length < 2) continue;

        const edgeKeys: string[] = [];
        for (let pathIndex = 1; pathIndex < sectorPath.length; pathIndex += 1) {
          edgeKeys.push(getRiverEdgeKey(sectorPath[pathIndex - 1], sectorPath[pathIndex]));
        }

        const sectorIndex = sectors.length + 1;
        const knownSectorFullness = edgeKeys
          .map((edgeKey) => existingFullnessByEdge.get(edgeKey))
          .find((fullness): fullness is RiverFullness => Boolean(fullness));
        const baseFullness = knownSectorFullness ?? fallbackFullness;
        const startReason = getRiverEndpointReason(
          fromIndex,
          lastIndex,
          sectorPath[0].key,
          lakeVertexKeys,
          confluenceVertexKeys,
          regionBoundaryVertexKeys,
          'start'
        ) as RiverSector['startReason'];
        const endReason = getRiverEndpointReason(
          toIndex,
          lastIndex,
          sectorPath[sectorPath.length - 1].key,
          lakeVertexKeys,
          confluenceVertexKeys,
          regionBoundaryVertexKeys,
          'end'
        ) as RiverSector['endReason'];

        let fullness: RiverFullness;
        if (knownSectorFullness) {
          // Existing river edges are authoritative: connecting a stronger incoming river
          // must not silently rewrite the already drawn outgoing river's fullness.
          // New connector sectors are created with their intended fullness beforehand,
          // so preserving known edge fullness also keeps deliberate split/drop sectors.
          downstreamFullness = knownSectorFullness;
          fullness = knownSectorFullness;
        } else {
          if (baseFullness > downstreamFullness) {
            downstreamFullness = baseFullness;
          }
          const adjustedFullness = applyRiverFullnessRules(
            downstreamFullness,
            fromIndex,
            toIndex,
            riverFullnessRuleState
          );
          downstreamFullness = adjustedFullness.downstreamFullness;
          fullness = adjustedFullness.sectorFullness;
        }
        sectors.push({
          id: `${river.id}:sector:${sectorIndex}`,
          riverId: river.id,
          sectorIndex,
          vertexPath: sectorPath,
          edgeKeys,
          startVertexKey: sectorPath[0].key,
          endVertexKey: sectorPath[sectorPath.length - 1].key,
          startReason,
          endReason,
          fullness,
          assignedRegionId: getRiverSectorAssignedRegion(edgeKeys, existingAssignedRegionByEdge, river.regionId)
        });
      }

      return { ...river, sectors };
    } catch (error) {
      console.warn('Could not assign river sectors', { riverId: river.id, error });
      return { ...river, sectors: [] };
    }
  });

  for (const river of nextRivers) {
    if (!river.sectors || river.sectors.length === 0) {
      console.warn('River has no sectors after assignRiverSectors', river);
    }
  }
  return nextRivers;
}

function getRiverSectorsForHex(hex: AxialHex, rivers: River[]): RiverSector[] {
  const hexEdges = getHexEdgeKeys(hex);
  const hexVertexKeys = new Set(getHexCornerPoints(hex).map((vertex) => vertex.key));
  const sectorsById = new Map<string, RiverSector>();

  for (const river of rivers) {
    for (const sector of river.sectors ?? []) {
      const touchesHex = sector.edgeKeys.some((sectorEdgeKey) => hexEdges.has(sectorEdgeKey))
        || sector.vertexPath.some((vertex) => hexVertexKeys.has(vertex.key));
      if (touchesHex) sectorsById.set(sector.id, sector);
    }
  }

  return Array.from(sectorsById.values()).sort((a, b) => {
    const riverCompare = String(a.riverId).localeCompare(String(b.riverId), undefined, { numeric: true });
    return riverCompare || a.sectorIndex - b.sectorIndex;
  });
}

function getRiverSectorsForRegion(region: Region, rivers: River[]): RiverSector[] {
  const regionEdgeKeys = new Set<string>();
  for (const hex of region.hexes) {
    for (const edgeKey of getHexEdgeKeys(hex)) regionEdgeKeys.add(edgeKey);
  }

  const sectorsById = new Map<string, RiverSector>();
  for (const river of rivers) {
    for (const sector of river.sectors ?? []) {
      if (sector.assignedRegionId !== undefined && sector.assignedRegionId !== region.id) continue;
      if (sector.edgeKeys.some((edgeKey) => regionEdgeKeys.has(edgeKey))) {
        sectorsById.set(sector.id, sector);
      }
    }
  }

  return Array.from(sectorsById.values()).sort((a, b) => {
    const riverCompare = String(a.riverId).localeCompare(String(b.riverId), undefined, { numeric: true });
    return riverCompare || a.sectorIndex - b.sectorIndex;
  });
}

function getRiverConfluences(rivers: River[]): RiverConfluence[] {
  const riversByVertexKey = new Map<string, River[]>();
  for (const river of rivers) {
    for (const vertex of river.vertexPath ?? []) {
      const vertexRivers = riversByVertexKey.get(vertex.key) ?? [];
      if (!vertexRivers.some((item) => item.id === river.id)) vertexRivers.push(river);
      riversByVertexKey.set(vertex.key, vertexRivers);
    }
  }

  const confluencesById = new Map<string, RiverConfluence>();
  for (const [vertexKey, vertexRivers] of riversByVertexKey) {
    if (vertexRivers.length < 2) continue;

    for (const tributary of vertexRivers) {
      const tributaryIndex = tributary.vertexPath.findIndex((vertex) => vertex.key === vertexKey);
      if (tributaryIndex < 0 || tributaryIndex !== tributary.vertexPath.length - 1) continue;

      const mainRivers = vertexRivers
        .map((river) => ({
          river,
          vertexIndex: river.vertexPath.findIndex((vertex) => vertex.key === vertexKey)
        }))
        .filter(({ river, vertexIndex }) => river.id !== tributary.id && vertexIndex >= 0 && vertexIndex < river.vertexPath.length - 1);

      for (const { river: mainRiver } of mainRivers) {
        const id = `${tributary.id}->${mainRiver.id}@${vertexKey}`;
        confluencesById.set(id, {
          id,
          tributaryRiverId: tributary.id,
          mainRiverId: mainRiver.id,
          vertexKey
        });
      }
    }
  }

  return Array.from(confluencesById.values()).sort((a, b) => {
    const tributaryCompare = a.tributaryRiverId - b.tributaryRiverId;
    return tributaryCompare || a.mainRiverId - b.mainRiverId || a.vertexKey.localeCompare(b.vertexKey);
  });
}


function buildRiverDownstreamAdjacency(rivers: River[]): Map<number, Set<number>> {
  const downstreamByRiverId = new Map<number, Set<number>>();
  for (const confluence of getRiverConfluences(rivers)) {
    const downstream = downstreamByRiverId.get(confluence.tributaryRiverId) ?? new Set<number>();
    downstream.add(confluence.mainRiverId);
    downstreamByRiverId.set(confluence.tributaryRiverId, downstream);
  }
  return downstreamByRiverId;
}

function riverDrainsInto(
  downstreamByRiverId: Map<number, Set<number>>,
  sourceRiverId: number,
  targetRiverId: number
): boolean {
  // Intentionally walks the full downstream chain, so A -> B -> C means A drains into C.
  if (sourceRiverId === targetRiverId) return true;
  const queue = [sourceRiverId];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const currentRiverId = queue.shift()!;
    if (visited.has(currentRiverId)) continue;
    visited.add(currentRiverId);

    for (const downstreamRiverId of downstreamByRiverId.get(currentRiverId) ?? []) {
      if (downstreamRiverId === targetRiverId) return true;
      if (!visited.has(downstreamRiverId)) queue.push(downstreamRiverId);
    }
  }

  return false;
}

function wouldCreateRiverDrainageCycle(
  rivers: River[],
  upstreamRiverId: number,
  downstreamRiverId: number
): boolean {
  if (upstreamRiverId === downstreamRiverId) return true;
  return riverDrainsInto(buildRiverDownstreamAdjacency(rivers), downstreamRiverId, upstreamRiverId);
}

function getRiverConfluenceVertexKeys(rivers: River[]): Set<string> {
  return new Set(getRiverConfluences(rivers).map((confluence) => confluence.vertexKey));
}

function getRiverConfluencesForRegion(region: Region, rivers: River[]): RiverConfluence[] {
  const regionVertexKeys = new Set<string>();
  for (const hex of region.hexes) {
    for (const vertex of getHexCornerPoints(hex)) regionVertexKeys.add(vertex.key);
  }

  return getRiverConfluences(rivers).filter((confluence) => regionVertexKeys.has(confluence.vertexKey));
}

function getRiversForHex(hex: AxialHex, rivers: River[]): River[] {
  const hexEdges = getHexEdgeKeys(hex);
  const hexVertexKeys = new Set(getHexCornerPoints(hex).map((vertex) => vertex.key));
  return rivers
    .filter((river) => {
      if (river.vertexPath.some((vertex) => hexVertexKeys.has(vertex.key))) return true;
      for (let i = 1; i < river.vertexPath.length; i += 1) {
        if (hexEdges.has(getRiverEdgeKey(river.vertexPath[i - 1], river.vertexPath[i]))) return true;
      }
      return false;
    })
    .sort((a, b) => a.id - b.id);
}

function vertexTouchesAnyHex(vertex: RiverVertex, hexes: AxialHex[]): boolean {
  return hexes.some((hex) => getHexCornerPoints(hex).some((corner) => corner.key === vertex.key));
}

function getRegionHexesTouchingVertex(vertex: RiverVertex, region: Region): AxialHex[] {
  return region.hexes.filter((hex) => getHexCornerPoints(hex).some((corner) => corner.key === vertex.key));
}

function lakeHasRiverConnection(
  lakeHexes: AxialHex[],
  rivers: River[]
): boolean {
  const lakeVertexKeys = new Set(getRegionExteriorVertices(lakeHexes).map((vertex) => vertex.key));
  if (lakeVertexKeys.size === 0) return false;

  return rivers.some((river) =>
    river.vertexPath.some((vertex) => lakeVertexKeys.has(vertex.key))
  );
}

function getNeighborRiverVertices(
  vertex: RiverVertex,
  riverGraph: RiverGraph
): RiverVertex[] {
  const node = riverGraph.nodes.get(vertex.key);
  if (!node) return [];

  return node.incidentEdgeKeys
    .map((edgeKey) => riverGraph.edges.get(edgeKey))
    .filter((edge): edge is RiverGraphEdge => Boolean(edge))
    .map((edge) => {
      const nextNode = edge.a.key === vertex.key ? edge.b : edge.a;
      return { key: nextNode.key, x: nextNode.x, y: nextNode.y };
    });
}

type MinorRiverGenerationReason =
  | 'wrong_region_size'
  | 'wrong_height'
  | 'no_start_candidates'
  | 'no_valid_first_edge'
  | 'no_valid_path'
  | 'reached_lake'
  | 'max_length_reached'
  | 'ok';

type RiverControlPoints = {
  startVertex: RiverVertex;
  middlePurpleVertex?: RiverVertex;
  endVertex: RiverVertex;
  startMode: 'existing river endpoint' | 'red vertex';
  endMode?: 'existing river endpoint' | 'red vertex';
};

type MinorRiverBuildResult = {
  path: RiverVertex[];
  reason: Extract<MinorRiverGenerationReason, 'reached_lake' | 'max_length_reached' | 'ok'>;
  reachedLake: boolean;
};

type EdgeTributaryGenerationReason =
  | 'not_edge_size'
  | 'height_not_supported'
  | 'no_candidate_start_vertices'
  | 'no_outgoing_rivers'
  | 'no_valid_path'
  | 'invalid_result'
  | 'ok';

function tryAddEdgeMinorTributaryRiver(
  region: Region,
  terrainMap: Map<string, HexTerrainData>,
  riverGraph: RiverGraph,
  rivers: River[],
  candidateHexes: AxialHex[]
): River[] {
  let candidateStartCount = 0;
  let outgoingRiverCount = 0;
  let selectedTargetRiverId: number | null = null;

  const logGeneration = ({
    built,
    reason,
    pathLength,
  }: {
    built: boolean;
    reason: EdgeTributaryGenerationReason;
    pathLength: number;
  }) => {
    console.log('Edge tributary generation', {
      regionId: region.id,
      sizeCategory: region.sizeCategory,
      heightLevel: region.heightLevel,
      candidateStartCount,
      outgoingRiverCount,
      selectedTargetRiverId,
      built,
      reason,
      pathLength,
    });
  };

  try {
    if (!(region.sizeCategory === 'land' || region.sizeCategory === 'vast_land')) {
      logGeneration({ built: false, reason: 'not_edge_size', pathLength: 0 });
      return rivers;
    }
    if (!(region.heightLevel === 1 || region.heightLevel === 2)) {
      logGeneration({ built: false, reason: 'height_not_supported', pathLength: 0 });
      return rivers;
    }

    const candidateBoundaryVertices = getCandidateBoundaryVerticesForRegion(region.hexes, candidateHexes);
    const candidateBoundaryVertexKeys = new Set(candidateBoundaryVertices.map((vertex) => vertex.key));
    const usedRiverEdges = buildUsedRiverEdges(rivers);
    const regionRivers = getRiversForRegion(region, rivers);
    const existingRiverVertexKeys = new Set(rivers.flatMap((river) => river.vertexPath.map((vertex) => vertex.key)));
    const lakeVertexKeys = new Set<string>();
    for (const lake of getLakesForRegion(region, terrainMap)) {
      for (const vertex of lake.vertices) lakeVertexKeys.add(vertex.key);
    }

    const hasFreeInteriorStep = (vertex: RiverVertex): boolean => {
      const node = riverGraph.nodes.get(vertex.key);
      if (!node) return false;
      return node.incidentEdgeKeys.some((incidentEdgeKey) => {
        const graphEdge = riverGraph.edges.get(incidentEdgeKey);
        if (!graphEdge?.isInsideRegionEdge) return false;
        if (usedRiverEdges.has(graphEdge.key)) return false;
        const nextNode = graphEdge.a.key === vertex.key ? graphEdge.b : graphEdge.a;
        if (existingRiverVertexKeys.has(nextNode.key)) return false;
        return true;
      });
    };

    const startCandidatesByKey = new Map<string, RiverVertex>();
    for (const vertex of candidateBoundaryVertices) {
      if (startCandidatesByKey.has(vertex.key)) continue;
      if (!riverGraph.nodes.has(vertex.key)) continue;
      if (!candidateBoundaryVertexKeys.has(vertex.key)) continue;
      if (existingRiverVertexKeys.has(vertex.key)) continue;
      if (!hasFreeInteriorStep(vertex)) continue;
      startCandidatesByKey.set(vertex.key, vertex);
    }
    const startCandidates = Array.from(startCandidatesByKey.values());
    candidateStartCount = startCandidates.length;

    if (startCandidates.length === 0) {
      logGeneration({ built: false, reason: 'no_candidate_start_vertices', pathLength: 0 });
      return rivers;
    }

    const riverTouchesCandidateExit = (river: River): boolean => {
      if (river.vertexPath.some((vertex) => candidateBoundaryVertexKeys.has(vertex.key))) return true;
      const riverEdgeKeys = getRiverPathEdgeKeys(river.vertexPath, riverGraph);
      if (!riverEdgeKeys) return false;
      return riverEdgeKeys.some((riverEdgeKey) => riverGraph.edges.get(riverEdgeKey)?.isCandidateBoundaryEdge);
    };

    const outgoingRivers = regionRivers.filter(riverTouchesCandidateExit);
    outgoingRiverCount = outgoingRivers.length;
    const selectedTargetRiver = outgoingRivers[0] ?? null;
    selectedTargetRiverId = selectedTargetRiver?.id ?? null;

    if (!selectedTargetRiver) {
      logGeneration({ built: false, reason: 'no_outgoing_rivers', pathLength: 0 });
      return rivers;
    }

    const selectedTargetVertices = selectedTargetRiver.vertexPath.filter((vertex) => riverGraph.nodes.has(vertex.key));
    const trimPathAtFirstExistingRiverVertex = (path: RiverVertex[]): RiverVertex[] => {
      for (let i = 1; i < path.length; i += 1) {
        if (existingRiverVertexKeys.has(path[i].key)) return path.slice(0, i + 1);
      }
      return path;
    };

    const validateEdgeTributaryPath = (path: RiverVertex[]): boolean => {
      if (path.length < 2) return false;
      if (!candidateBoundaryVertexKeys.has(path[0].key)) return false;
      if (existingRiverVertexKeys.has(path[0].key)) return false;
      const terminalVertex = path[path.length - 1];
      if (vertexTouchesAnyHex(terminalVertex, candidateHexes)) return false;
      if (!existingRiverVertexKeys.has(terminalVertex.key)) return false;
      if (path.length === 2) return false;
      if (path[0].key === terminalVertex.key) return false;
      if (new Set(path.map((vertex) => vertex.key)).size !== path.length) return false;
      if (path.slice(0, -1).some((vertex) => existingRiverVertexKeys.has(vertex.key))) return false;
      if (path.slice(2, -1).some((vertex) => lakeVertexKeys.has(vertex.key))) return false;
      const pathEdgeKeys = getRiverPathEdgeKeys(path, riverGraph);
      if (!pathEdgeKeys) return false;
      if (hasDuplicateEdgeKeys(pathEdgeKeys)) return false;
      if (pathEdgeKeys.some((pathEdgeKey) => usedRiverEdges.has(pathEdgeKey))) return false;
      if (pathEdgeKeys.length === 1) return false;
      return true;
    };

    for (const startVertex of shuffleArray(startCandidates)) {
      const pathToTargetRiver = findBestFreeRiverPathToAnyTarget(
        startVertex,
        selectedTargetVertices,
        riverGraph,
        usedRiverEdges
      );
      if (!pathToTargetRiver) continue;
      const path = trimPathAtFirstExistingRiverVertex(pathToTargetRiver);
      if (!validateEdgeTributaryPath(path)) continue;

      const nextRiverId = Math.max(0, ...rivers.map((river) => river.id)) + 1;
      const newRiver: River = {
        id: nextRiverId,
        regionId: region.id,
        vertexPath: path,
        sectors: createInitialRiverSectors(nextRiverId, path, getTributaryRiverFullnessForHeight(region.heightLevel), {}, region.id),
      };
      const nextRivers = [...rivers, newRiver];
      validateRiverDirection(newRiver);
      if (!validateRiverContinuity(newRiver)) {
        logGeneration({ built: false, reason: 'invalid_result', pathLength: newRiver.vertexPath.length });
        return rivers;
      }
      const newRiverEdgeKeys = getRiverPathEdgeKeys(newRiver.vertexPath, riverGraph);
      if (!newRiverEdgeKeys || newRiverEdgeKeys.some((pathEdgeKey) => usedRiverEdges.has(pathEdgeKey)) || hasDuplicateEdgeKeys(newRiverEdgeKeys)) {
        logGeneration({ built: false, reason: 'invalid_result', pathLength: newRiver.vertexPath.length });
        return rivers;
      }
      validateNoDuplicateRiverEdges(nextRivers);
      logGeneration({ built: true, reason: 'ok', pathLength: newRiver.vertexPath.length });
      return nextRivers;
    }

    logGeneration({ built: false, reason: 'no_valid_path', pathLength: 0 });
    return rivers;
  } catch (error) {
    console.warn('Edge tributary generation failed', { regionId: region.id, error });
    logGeneration({ built: false, reason: 'no_valid_path', pathLength: 0 });
    return rivers;
  }
}

function tryAddSmallTributaryRiver(
  region: Region,
  terrainMap: Map<string, HexTerrainData>,
  riverGraph: RiverGraph,
  rivers: River[],
  candidateHexes: AxialHex[]
): River[] {
  const maxSegmentCount = 6;
  const logGeneration = ({
    startCandidates,
    built,
    reason,
    segmentCount,
    reachedLake,
    targetLakeWasFree,
  }: {
    startCandidates: number;
    built: boolean;
    reason: MinorRiverGenerationReason;
    segmentCount: number;
    reachedLake: boolean;
    targetLakeWasFree: boolean;
  }) => {
    console.log('Minor river generation', {
      regionId: region.id,
      sizeCategory: region.sizeCategory,
      heightLevel: region.heightLevel,
      startCandidates,
      built,
      reason,
      segmentCount,
      reachedLake,
      reversedForFlowDirection: true,
      targetLakeWasFree,
    });
  };

  try {
    if (region.sizeCategory === 'land' || region.sizeCategory === 'vast_land') {
      return tryAddEdgeMinorTributaryRiver(region, terrainMap, riverGraph, rivers, candidateHexes);
    }
    if (!(region.sizeCategory === 'region' || region.sizeCategory === 'large_region')) {
      logGeneration({ startCandidates: 0, built: false, reason: 'wrong_region_size', segmentCount: 0, reachedLake: false, targetLakeWasFree: false });
      return rivers;
    }
    if (!(region.heightLevel === 1 || region.heightLevel === 2)) {
      logGeneration({ startCandidates: 0, built: false, reason: 'wrong_height', segmentCount: 0, reachedLake: false, targetLakeWasFree: false });
      return rivers;
    }

    const regionRivers = getRiversForRegion(region, rivers);
    const existingRiverVertexKeys = new Set(regionRivers.flatMap((river) => river.vertexPath.map((v) => v.key)));
    const existingRiverEdgeKeys = buildUsedRiverEdges(rivers);
    const freeLakeVertexKeys = new Set<string>();
    const connectedLakeVertexKeys = new Set<string>();
    for (const lake of getLakesForRegion(region, terrainMap)) {
      const exteriorVertices = getRegionExteriorVertices(lake.hexes);
      const targetVertexKeys = lakeHasRiverConnection(lake.hexes, rivers) ? connectedLakeVertexKeys : freeLakeVertexKeys;
      for (const vertex of exteriorVertices) targetVertexKeys.add(vertex.key);
    }

    const graphNodeFor = (vertex: RiverVertex): RiverGraphNode | undefined => riverGraph.nodes.get(vertex.key);
    const isCandidateAdjacentVertex = (vertex: RiverVertex): boolean => (
      vertexTouchesAnyHex(vertex, candidateHexes)
      || Boolean(graphNodeFor(vertex)?.isCandidateBoundaryVertex)
    );
    const isRegionPerimeterVertex = (vertex: RiverVertex): boolean => (
      !graphNodeFor(vertex)
      || Boolean(graphNodeFor(vertex)?.isRegionBoundaryVertex)
      || getRegionHexesTouchingVertex(vertex, region).length < 3
    );
    const isForbiddenInteriorVertex = (vertex: RiverVertex): boolean => (
      !graphNodeFor(vertex)
      || isRegionPerimeterVertex(vertex)
      || isCandidateAdjacentVertex(vertex)
    );
    const isFreeLakeVertex = (vertex: RiverVertex): boolean => freeLakeVertexKeys.has(vertex.key);
    const isConnectedLakeVertex = (vertex: RiverVertex): boolean => connectedLakeVertexKeys.has(vertex.key);
    const isValidNextVertex = (vertex: RiverVertex, pathVertexKeys: Set<string>): boolean => {
      if (isForbiddenInteriorVertex(vertex)) return false;
      if (existingRiverVertexKeys.has(vertex.key)) return false;
      if (isConnectedLakeVertex(vertex)) return false;
      if (pathVertexKeys.has(vertex.key)) return false;
      return true;
    };
    const isValidEdge = (from: RiverVertex, to: RiverVertex, pathEdgeKeys: Set<string>): boolean => {
      const key = edgeKey(from, to);
      const graphEdge = riverGraph.edges.get(key);
      if (!graphEdge?.isInsideRegionEdge) return false;
      if (existingRiverEdgeKeys.has(key)) return false;
      if (pathEdgeKeys.has(key)) return false;
      return true;
    };
    const distanceToNearestLake = (vertex: RiverVertex): number => {
      if (freeLakeVertexKeys.size === 0) return Number.POSITIVE_INFINITY;
      let min = Number.POSITIVE_INFINITY;
      for (const lakeKey of freeLakeVertexKeys) {
        const lakeVertex = riverGraph.nodes.get(lakeKey);
        if (!lakeVertex) continue;
        min = Math.min(min, Math.hypot(vertex.x - lakeVertex.x, vertex.y - lakeVertex.y));
      }
      return min;
    };
    const sortTowardLake = (vertices: RiverVertex[]): RiverVertex[] => {
      const randomized = shuffleArray(vertices);
      if (freeLakeVertexKeys.size === 0) return randomized;
      return randomized.sort((a, b) => distanceToNearestLake(a) - distanceToNearestLake(b));
    };

    const startCandidatesByKey = new Map<string, RiverVertex>();
    for (const river of regionRivers) {
      for (let i = 1; i < river.vertexPath.length - 1; i += 1) {
        const vertex = river.vertexPath[i];
        if (!vertex || startCandidatesByKey.has(vertex.key)) continue;
        if (isForbiddenInteriorVertex(vertex)) continue;
        startCandidatesByKey.set(vertex.key, vertex);
      }
    }
    const startCandidates = Array.from(startCandidatesByKey.values());

    if (startCandidates.length === 0) {
      logGeneration({ startCandidates: 0, built: false, reason: 'no_start_candidates', segmentCount: 0, reachedLake: false, targetLakeWasFree: false });
      return rivers;
    }

    const buildFromStart = (startVertex: RiverVertex): MinorRiverBuildResult | null => {
      const firstPathVertexKeys = new Set<string>([startVertex.key]);
      const firstPathEdgeKeys = new Set<string>();
      const firstStepCandidates = getNeighborRiverVertices(startVertex, riverGraph).filter((next) => (
        isValidEdge(startVertex, next, firstPathEdgeKeys)
        && isValidNextVertex(next, firstPathVertexKeys)
      ));
      if (firstStepCandidates.length === 0) return null;

      for (const firstStep of sortTowardLake(firstStepCandidates)) {
        const path = [startVertex, firstStep];
        const pathVertexKeys = new Set<string>(path.map((vertex) => vertex.key));
        const pathEdgeKeys = new Set<string>([edgeKey(startVertex, firstStep)]);
        let previous = startVertex;
        let current = firstStep;
        let reachedLake = isFreeLakeVertex(current);

        while (!reachedLake && path.length - 1 < maxSegmentCount) {
          const nextCandidates = getNeighborRiverVertices(current, riverGraph).filter((next) => (
            next.key !== previous.key
            && isValidEdge(current, next, pathEdgeKeys)
            && isValidNextVertex(next, pathVertexKeys)
          ));
          if (nextCandidates.length === 0) break;

          const nextVertex = sortTowardLake(nextCandidates)[0];
          path.push(nextVertex);
          pathVertexKeys.add(nextVertex.key);
          pathEdgeKeys.add(edgeKey(current, nextVertex));
          previous = current;
          current = nextVertex;
          reachedLake = isFreeLakeVertex(current);
        }

        if (path.length >= 2) {
          return {
            path,
            reason: reachedLake ? 'reached_lake' : path.length - 1 >= maxSegmentCount ? 'max_length_reached' : 'ok',
            reachedLake,
          };
        }
      }

      return null;
    };

    let builtResult: MinorRiverBuildResult | null = null;
    let sawFirstEdgeCandidate = false;
    for (const startVertex of shuffleArray(startCandidates)) {
      const possibleFirstEdges = getNeighborRiverVertices(startVertex, riverGraph).filter((next) => (
        isValidEdge(startVertex, next, new Set<string>())
        && !isForbiddenInteriorVertex(next)
        && !existingRiverVertexKeys.has(next.key)
        && !isConnectedLakeVertex(next)
      ));
      if (possibleFirstEdges.length > 0) sawFirstEdgeCandidate = true;

      const result = buildFromStart(startVertex);
      if (result) {
        builtResult = result;
        break;
      }
    }

    if (!builtResult) {
      logGeneration({
        startCandidates: startCandidates.length,
        built: false,
        reason: sawFirstEdgeCandidate ? 'no_valid_path' : 'no_valid_first_edge',
        segmentCount: 0,
        reachedLake: false,
        targetLakeWasFree: false,
      });
      return rivers;
    }

    const nextRiverId = Math.max(0, ...rivers.map((river) => river.id)) + 1;
    const newRiverPath = reverseRiverPath(builtResult.path);
    const newRiver: River = {
      id: nextRiverId,
      regionId: region.id,
      vertexPath: newRiverPath,
      sectors: createInitialRiverSectors(nextRiverId, newRiverPath, 1, {}, region.id),
    };
    const nextRivers = [...rivers, newRiver];
    for (const river of nextRivers) {
      validateRiverDirection(river);
      validateRiverContinuity(river);
    }
    validateNoDuplicateRiverEdges(nextRivers);
    logGeneration({
      startCandidates: startCandidates.length,
      built: true,
      reason: builtResult.reason,
      segmentCount: newRiver.vertexPath.length - 1,
      reachedLake: builtResult.reachedLake,
      targetLakeWasFree: builtResult.reachedLake,
    });
    return nextRivers;
  } catch (error) {
    console.warn('Minor river generation failed', { regionId: region.id, error });
    logGeneration({ startCandidates: 0, built: false, reason: 'no_valid_path', segmentCount: 0, reachedLake: false, targetLakeWasFree: false });
    return rivers;
  }
}

function getRiversForRegion(region: Region, rivers: River[]): River[] {
  const regionVertexKeys = new Set<string>();
  for (const hex of region.hexes) {
    for (const vertex of getHexCornerPoints(hex)) regionVertexKeys.add(vertex.key);
  }

  return rivers
    .filter((river) => river.vertexPath.some((vertex) => regionVertexKeys.has(vertex.key)))
    .sort((a, b) => a.id - b.id);
}

function getLakeSummariesForRegion(
  region: Region,
  hexTerrainByKey: Map<string, HexTerrainData>
): Array<{ lakeId: number; size: number }> {
  const lakeSizes = new Map<number, number>();
  for (const hex of region.hexes) {
    const terrain = hexTerrainByKey.get(hexKey(hex));
    if (terrain?.terrainOverride !== 'lake' || terrain.lakeId == null) continue;
    lakeSizes.set(terrain.lakeId, (lakeSizes.get(terrain.lakeId) ?? 0) + 1);
  }

  return Array.from(lakeSizes.entries())
    .map(([lakeId, size]) => ({ lakeId, size }))
    .sort((a, b) => a.lakeId - b.lakeId);
}

function formatHexCount(count: number): string {
  if (count === 1) return 'гекс';
  if (count >= 2 && count <= 4) return 'гекса';
  return 'гексов';
}

function getMountainInteriorSourceVertices(
  region: Region,
  regions: Region[],
  candidateHexes: AxialHex[],
  riverGraph: RiverGraph,
  candidateVertices: RiverVertex[],
  neighborRegionVertices: RiverVertex[]
): RiverVertex[] {
  const vertexUsageByKey = getVertexUsageByKeyForRegion(region, regions, candidateHexes);
  const candidateVertexKeys = new Set(candidateVertices.map((vertex) => vertex.key));
  const neighborRegionVertexKeys = new Set(neighborRegionVertices.map((vertex) => vertex.key));
  const regionVerticesByKey = new Map<string, RiverVertex>();
  for (const hex of region.hexes) {
    for (const vertex of getHexCornerPoints(hex)) regionVerticesByKey.set(vertex.key, vertex);
  }

  return Array.from(regionVerticesByKey.values()).filter((vertex) => {
    if (candidateVertexKeys.has(vertex.key)) return false;
    if (neighborRegionVertexKeys.has(vertex.key)) return false;
    if (!riverGraph.nodes.has(vertex.key)) return false;
    const usage = vertexUsageByKey.get(vertex.key);
    if (!usage || usage.currentRegionCount < 1) return false;
    if (usage.candidateCount > 0) return false;
    if (usage.otherRegionCount > 0) return false;
    return true;
  });
}

function findBestPathFromSourceToOutgoingEndpoint(
  sourceVertices: RiverVertex[],
  outgoingEndpoint: RiverEndpointTouch,
  riverGraph: RiverGraph,
  usedRiverEdges: Set<string>,
  options?: { requireCenterHexVertex?: AxialHex; occupiedVertexKeys?: Set<string>; allowedOccupiedVertexKeys?: Set<string> }
): RiverVertex[] | null {
  let bestPath: RiverVertex[] | null = null;
  for (const sourceVertex of sourceVertices) {
    const controlPoints: RiverControlPoints = {
      startVertex: sourceVertex,
      endVertex: outgoingEndpoint.vertex,
      startMode: 'red vertex',
      endMode: 'existing river endpoint'
    };
    const path = buildRiverPathViaControlPoints(controlPoints, riverGraph, usedRiverEdges);
    if (path.length < 2) continue;
    if (path[0].key !== sourceVertex.key || path[path.length - 1].key !== outgoingEndpoint.vertex.key) continue;
    if (new Set(path.map((vertex) => vertex.key)).size !== path.length) continue;
    const pathEdgeKeys = getRiverPathEdgeKeys(path, riverGraph);
    if (!pathEdgeKeys || pathEdgeKeys.some((pathEdgeKey) => usedRiverEdges.has(pathEdgeKey))) continue;
    if (options?.occupiedVertexKeys && !riverPathAvoidsOccupiedVertices(path, options.occupiedVertexKeys, options.allowedOccupiedVertexKeys)) continue;
    if (options?.requireCenterHexVertex && !riverPathTouchesCenterHexVertex(path, options.requireCenterHexVertex)) continue;
    if (!bestPath || path.length < bestPath.length) bestPath = path;
  }
  return bestPath;
}

function findBestPathFromLakeToOutgoingEndpoint(
  lakeVertices: RiverVertex[],
  outgoingEndpoint: RiverEndpointTouch,
  riverGraph: RiverGraph,
  usedRiverEdges: Set<string>,
  occupiedVertexKeys: Set<string> = new Set()
): RiverVertex[] | null {
  return findBestPathFromSourceToOutgoingEndpoint(lakeVertices, outgoingEndpoint, riverGraph, usedRiverEdges, {
    occupiedVertexKeys,
    allowedOccupiedVertexKeys: new Set([outgoingEndpoint.vertex.key])
  });
}

function chooseRandomRegionExteriorVertexPair(regionExteriorVertices: RiverVertex[]): { startVertex: RiverVertex; endVertex: RiverVertex } | null {
  if (regionExteriorVertices.length < 2) return null;
  const startVertex = randomFrom(regionExteriorVertices);
  const endPool = regionExteriorVertices.filter((vertex) => vertex.key !== startVertex.key);
  if (endPool.length === 0) return null;
  return { startVertex, endVertex: randomFrom(endPool) };
}

function validateRiverPathUsesExteriorEndpoints(
  vertexPath: RiverVertex[],
  regionExteriorVertices: RiverVertex[],
  riverGraph: RiverGraph
): boolean {
  if (!vertexPath || vertexPath.length < 2) return false;
  const exteriorSet = new Set(regionExteriorVertices.map((vertex) => vertex.key));
  const startKey = vertexPath[0].key;
  const endKey = vertexPath[vertexPath.length - 1].key;
  if (!exteriorSet.has(startKey) || !exteriorSet.has(endKey)) return false;
  for (let i = 1; i < vertexPath.length; i += 1) {
    if (!riverGraph.edges.has(edgeKey(vertexPath[i - 1], vertexPath[i]))) {
      return false;
    }
  }
  return true;
}

function getRiverPathEdgeKeys(vertexPath: RiverVertex[], riverGraph: RiverGraph): string[] | undefined {
  if (!vertexPath || vertexPath.length < 2) return [];
  const edgeKeys: string[] = [];
  for (let i = 1; i < vertexPath.length; i += 1) {
    const segmentEdge = riverGraph.edges.get(edgeKey(vertexPath[i - 1], vertexPath[i]));
    if (!segmentEdge) return undefined;
    edgeKeys.push(segmentEdge.key);
  }
  return edgeKeys;
}

function hasDuplicateEdgeKeys(edgeKeys: string[]): boolean {
  return new Set(edgeKeys).size !== edgeKeys.length;
}

function buildUsedRiverEdges(rivers: River[]): Set<string> {
  const used = new Set<string>();
  for (const river of rivers) {
    if (!river.vertexPath || river.vertexPath.length < 2) continue;
    for (let i = 1; i < river.vertexPath.length; i += 1) {
      used.add(edgeKey(river.vertexPath[i - 1], river.vertexPath[i]));
    }
  }
  return used;
}

function validateNoDuplicateRiverEdges(rivers: River[]): void {
  const seen = new Map<string, { regionId: number; riverId: number }>();

  for (const river of rivers) {
    if (!river.vertexPath || river.vertexPath.length < 2) continue;
    for (let i = 1; i < river.vertexPath.length; i += 1) {
      const key = edgeKey(river.vertexPath[i - 1], river.vertexPath[i]);

      if (seen.has(key)) {
        console.warn('Duplicate river edge detected', {
          edgeKey: key,
          first: seen.get(key),
          duplicate: { regionId: river.regionId, riverId: river.id }
        });
      } else {
        seen.set(key, { regionId: river.regionId, riverId: river.id });
      }
    }
  }
}

function reverseRiverPath(vertexPath: RiverVertex[]): RiverVertex[] {
  return [...vertexPath].reverse().map((vertex) => ({ ...vertex }));
}

function validateRiverDirection(river: River): void {
  if (!river.vertexPath || river.vertexPath.length < 2) return;
  for (let i = 0; i < river.vertexPath.length - 1; i += 1) {
    if (river.vertexPath[i].key === river.vertexPath[i + 1].key) {
      console.warn('Broken river direction/order', {
        riverId: river.id,
        index: i,
        currentEnd: river.vertexPath[i],
        nextStart: river.vertexPath[i + 1]
      });
    }
  }


  const outgoingByVertex = new Map<string, number>();
  for (let i = 1; i < river.vertexPath.length; i += 1) {
    const startKey = river.vertexPath[i - 1].key;
    outgoingByVertex.set(startKey, (outgoingByVertex.get(startKey) ?? 0) + 1);
  }
  for (const [vertexKey, outgoing] of outgoingByVertex.entries()) {
    if (outgoing > 1) {
      console.warn('Multiple outgoing river segments from one startPoint', { riverId: river.id, vertexKey, outgoing });
    }
  }
}

function findRiverConnectionByStartVertex(rivers: River[], startVertex: RiverVertex): RiverConnection | null {
  for (const river of rivers) {
    if (!river.vertexPath || river.vertexPath.length < 1) continue;
    const firstVertex = river.vertexPath[0];
    const lastVertex = river.vertexPath[river.vertexPath.length - 1];
    if (lastVertex?.key === startVertex.key) return { riverId: river.id, type: 'end', vertex: lastVertex };
    if (firstVertex?.key === startVertex.key) return { riverId: river.id, type: 'start', vertex: firstVertex };
  }
  return null;
}

function validateRiverContinuity(river: River): boolean {
  if (!river?.vertexPath || river.vertexPath.length < 2) return true;
  for (let i = 0; i < river.vertexPath.length - 1; i += 1) {
    const current = river.vertexPath[i];
    const next = river.vertexPath[i + 1];
    if (!current || !next || current.key === next.key) {
      console.warn('Broken river continuity', { riverId: river.id, index: i });
      return false;
    }
  }
  return true;
}

function findRiverEndpointsTouchingRegion(region: Region, rivers: River[], riverGraph: RiverGraph): RiverEndpointTouch[] {
  void region;
  const endpoints: RiverEndpointTouch[] = [];
  const confluenceVertexKeys = getRiverConfluenceVertexKeys(rivers);
  for (const river of rivers) {
    if (!river.vertexPath || river.vertexPath.length < 1) continue;
    const startVertex = river.vertexPath[0];
    const endVertex = river.vertexPath[river.vertexPath.length - 1];
    const startNode = startVertex ? riverGraph.nodes.get(startVertex.key) : undefined;
    const endNode = endVertex ? riverGraph.nodes.get(endVertex.key) : undefined;
    if (startVertex && startNode?.isRegionBoundaryVertex) {
      endpoints.push({ riverId: river.id, endpointType: 'start', vertex: startVertex });
    }
    if (
      endVertex
      && endNode?.isRegionBoundaryVertex
      && !confluenceVertexKeys.has(endVertex.key)
    ) {
      endpoints.push({ riverId: river.id, endpointType: 'end', vertex: endVertex });
    }
  }
  return endpoints;
}

function findRegionTouchingVertex(
  vertex: RiverVertex,
  regions: Region[]
): Region | undefined {
  for (const region of regions) {
    for (const hex of region.hexes) {
      if (getHexCornerPoints(hex).some((corner) => corner.key === vertex.key)) {
        return region;
      }
    }
  }

  return undefined;
}

function getRiverHeightConstraintForCandidateRegion(
  candidateRegion: Region,
  existingRegions: Region[],
  existingRivers: River[],
  candidateHexes: AxialHex[]
): RiverHeightConstraint {
  const riverGraph = buildRiverGraphForRegion(
    candidateRegion.hexes,
    candidateRegion.hexes,
    candidateHexes
  );
  const touchingEndpoints = findRiverEndpointsTouchingRegion(
    candidateRegion,
    existingRivers,
    riverGraph
  );

  let minHeight: RegionHeightLevel | undefined;
  let maxHeight: RegionHeightLevel | undefined;
  const reasons: string[] = [];

  for (const endpoint of touchingEndpoints) {
    const existingRegion = findRegionTouchingVertex(endpoint.vertex, existingRegions);
    const touchingHeight = existingRegion?.heightLevel;
    if (!touchingHeight) continue;

    if (endpoint.endpointType === 'end') {
      maxHeight = Math.min(maxHeight ?? touchingHeight, touchingHeight) as RegionHeightLevel;
      reasons.push(`incoming river ${endpoint.riverId}: new height <= ${touchingHeight}`);
    }

    if (endpoint.endpointType === 'start') {
      minHeight = Math.max(minHeight ?? touchingHeight, touchingHeight) as RegionHeightLevel;
      reasons.push(`outgoing river ${endpoint.riverId}: new height >= ${touchingHeight}`);
    }
  }

  return { minHeight, maxHeight, reasons };
}

function getRegionVertexKeys(regionHexes: AxialHex[]): Set<string> {
  const keys = new Set<string>();
  for (const hex of regionHexes) {
    for (const corner of getHexCornerPoints(hex)) keys.add(corner.key);
  }
  return keys;
}

function trimOutgoingRiverStartAwayFromRegion(river: River, regionHexes: AxialHex[]): River | null {
  const regionVertexKeys = getRegionVertexKeys(regionHexes);
  const trimmedPath = [...river.vertexPath];

  while (trimmedPath.length > 0 && regionVertexKeys.has(trimmedPath[0].key)) {
    trimmedPath.shift();
  }

  if (trimmedPath.length < 2) return null;
  return { ...river, vertexPath: trimmedPath };
}

function getConflictingOutgoingRiverIds(
  touchingEndpoints: RiverEndpointTouch[],
  existingRegions: Region[],
  riverHeightConstraint: RiverHeightConstraint
): number[] {
  if (
    riverHeightConstraint.minHeight === undefined ||
    riverHeightConstraint.maxHeight === undefined ||
    riverHeightConstraint.minHeight <= riverHeightConstraint.maxHeight
  ) return [];

  const maxHeight = riverHeightConstraint.maxHeight;
  return touchingEndpoints
    .filter((endpoint) => endpoint.endpointType === 'start')
    .filter((endpoint) => {
      const touchingRegion = findRegionTouchingVertex(endpoint.vertex, existingRegions);
      return (touchingRegion?.heightLevel ?? 1) > maxHeight;
    })
    .map((endpoint) => endpoint.riverId);
}

function trimConflictingOutgoingRiversAwayFromRegion(
  rivers: River[],
  conflictingOutgoingRiverIds: number[],
  regionHexes: AxialHex[],
  regionId: number
): River[] {
  const conflictingSet = new Set(conflictingOutgoingRiverIds);
  return rivers.flatMap((river) => {
    if (!conflictingSet.has(river.id)) return [river];
    const originalStartVertex = river.vertexPath[0]?.key;
    const originalLength = river.vertexPath.length;
    const trimmedRiver = trimOutgoingRiverStartAwayFromRegion(river, regionHexes);
    console.warn('Trimming outgoing river start away from new region', {
      regionId,
      riverId: river.id,
      originalStartVertex,
      originalLength,
      newStartVertex: trimmedRiver?.vertexPath[0]?.key,
      newLength: trimmedRiver?.vertexPath.length ?? 0,
      removed: trimmedRiver === null,
    });
    return trimmedRiver ? [trimmedRiver] : [];
  });
}

function mergeRiversWithConnector(
  existingRivers: River[],
  upstreamRiverId: number,
  downstreamRiverId: number,
  connectorPath: RiverVertex[],
  connectorFullness?: RiverFullness,
  assignedRegionId?: number,
  connectorSplit?: RiverConnectorSplit
): River[] | null {
  const upstreamRiver = existingRivers.find((river) => river.id === upstreamRiverId);
  const downstreamRiver = existingRivers.find((river) => river.id === downstreamRiverId);
  if (!upstreamRiver || !downstreamRiver) {
    console.warn('Cannot merge rivers: missing river', { upstreamRiverId, downstreamRiverId });
    return null;
  }
  if (wouldCreateRiverDrainageCycle(existingRivers, upstreamRiverId, downstreamRiverId)) {
    console.warn('Cannot merge rivers: connection would create a drainage cycle', { upstreamRiverId, downstreamRiverId });
    return null;
  }
  if (!upstreamRiver.vertexPath?.length || !downstreamRiver.vertexPath?.length || connectorPath.length < 2) {
    console.warn('Cannot merge rivers: invalid path data', { upstreamRiverId, downstreamRiverId });
    return null;
  }
  const connectorMiddle = connectorPath.slice(1, -1);
  const mergedPath = [...upstreamRiver.vertexPath, ...connectorMiddle, ...downstreamRiver.vertexPath];
  const effectiveConnectorFullness = connectorFullness ?? chooseRiverFullnessFromAdjacentSectors(
    connectorPath,
    existingRivers,
    getRiverDownstreamFullness(upstreamRiver),
    getRiverDownstreamFullness(upstreamRiver),
    upstreamRiver.id
  );
  const splitIndex = connectorSplit
    ? connectorPath.findIndex((vertex) => vertex.key === connectorSplit.vertex.key)
    : -1;
  const rawConnectorSectors = connectorSplit && splitIndex > 0 && splitIndex < connectorPath.length - 1
    ? [
      ...createInitialRiverSectors(
        upstreamRiver.id,
        connectorPath.slice(0, splitIndex + 1),
        connectorSplit.upstreamFullness,
        { startReason: 'region_boundary', endReason: 'split' },
        assignedRegionId
      ),
      ...createInitialRiverSectors(
        upstreamRiver.id,
        connectorPath.slice(splitIndex),
        connectorSplit.downstreamFullness,
        { startReason: 'split', endReason: 'region_boundary' },
        assignedRegionId
      )
    ]
    : createInitialRiverSectors(
      upstreamRiver.id,
      connectorPath,
      effectiveConnectorFullness,
      { startReason: 'region_boundary', endReason: 'region_boundary' },
      assignedRegionId
    );
  const connectorSectors = withRiverSectorOrder(
    upstreamRiver.id,
    rawConnectorSectors,
    getMaxRiverSectorIndex(upstreamRiver) + 1
  ).map((sector) => ({ ...sector, id: `${upstreamRiver.id}:connector:sector:${sector.sectorIndex}` }));
  const mergedRiver: River = {
    ...upstreamRiver,
    vertexPath: mergedPath,
    sectors: [
      ...(upstreamRiver.sectors ?? []),
      ...connectorSectors,
      ...(downstreamRiver.sectors ?? [])
    ]
  };

  return existingRivers
    .filter((river) => river.id !== downstreamRiverId)
    .map((river) => (river.id === upstreamRiverId ? mergedRiver : river));
}


function getNextLakeIdFromTerrain(terrainMap: Map<string, HexTerrainData>): number {
  return Math.max(0, ...Array.from(terrainMap.values()).map((terrain) => terrain.lakeId ?? 0)) + 1;
}

function getHexCenterDistanceToVertex(hex: AxialHex, vertex: RiverVertex): number {
  const center = toPixel(hex.q, hex.r);
  const dx = center.x - vertex.x;
  const dy = center.y - vertex.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function addLakeAroundRiverSplitVertex(
  region: Region,
  splitVertex: RiverVertex,
  lakeHexCount: number,
  terrainMap: Map<string, HexTerrainData>
): { lakeId: number; hexes: AxialHex[] } | null {
  const targetHexCount = Math.max(1, lakeHexCount);
  const availableRegionHexes = region.hexes.filter((hex) => !isLakeHex(hex, terrainMap));
  if (availableRegionHexes.length === 0) return null;

  const lakeId = getNextLakeIdFromTerrain(terrainMap);
  const splitVertexTouchingHexes = availableRegionHexes.filter((hex) => getHexCornerPoints(hex).some((corner) => corner.key === splitVertex.key));
  const seedHexes = splitVertexTouchingHexes.length > 0 ? splitVertexTouchingHexes : availableRegionHexes;
  const seedHex = randomFrom(seedHexes);
  const regionHexByKey = new Map(availableRegionHexes.map((hex) => [hexKey(hex), hex]));
  const selectedKeys = new Set<string>([hexKey(seedHex)]);

  while (selectedKeys.size < targetHexCount && selectedKeys.size < availableRegionHexes.length) {
    const frontier = Array.from(selectedKeys)
      .flatMap((key) => getHexNeighbors(regionHexByKey.get(key) ?? seedHex))
      .filter((hex) => regionHexByKey.has(hexKey(hex)) && !selectedKeys.has(hexKey(hex)))
      .sort((left, right) => getHexCenterDistanceToVertex(left, splitVertex) - getHexCenterDistanceToVertex(right, splitVertex));

    const nextHex = frontier[0]
      ?? availableRegionHexes
        .filter((hex) => !selectedKeys.has(hexKey(hex)))
        .sort((left, right) => getHexCenterDistanceToVertex(left, splitVertex) - getHexCenterDistanceToVertex(right, splitVertex))[0];
    if (!nextHex) break;
    selectedKeys.add(hexKey(nextHex));
  }

  const lakeHexes = Array.from(selectedKeys)
    .map((key) => regionHexByKey.get(key))
    .filter((hex): hex is AxialHex => Boolean(hex));
  for (const hex of lakeHexes) {
    terrainMap.set(hexKey(hex), { terrainOverride: 'lake', lakeId });
  }

  console.log('Created river fullness drop lake', {
    regionId: region.id,
    lakeId,
    requestedLakeHexCount: targetHexCount,
    actualLakeHexCount: lakeHexes.length,
    splitVertexKey: splitVertex.key,
  });

  return { lakeId, hexes: lakeHexes };
}

function getRiverById(rivers: River[], riverId: number): River | undefined {
  return rivers.find((river) => river.id === riverId);
}

function getEndpointFullnessForRiver(rivers: River[], riverId: number, vertexKey: string): RiverFullness | null {
  const river = getRiverById(rivers, riverId);
  return river ? getRiverFullnessAtVertex(river, vertexKey) : null;
}

function buildConnectorSplitForFullnessDrop(
  existingRivers: River[],
  upstreamRiverId: number,
  upstreamVertex: RiverVertex,
  downstreamRiverId: number,
  downstreamVertex: RiverVertex,
  connectorPath: RiverVertex[]
): RiverConnectorSplit | null | undefined {
  const upstreamFullness = getEndpointFullnessForRiver(existingRivers, upstreamRiverId, upstreamVertex.key);
  const downstreamFullness = getEndpointFullnessForRiver(existingRivers, downstreamRiverId, downstreamVertex.key);
  if (upstreamFullness === null || downstreamFullness === null) return undefined;
  if (upstreamFullness <= downstreamFullness) return undefined;

  const internalVertices = connectorPath.slice(1, -1);
  if (internalVertices.length === 0) return null;

  return {
    vertex: randomFrom(internalVertices),
    upstreamFullness,
    downstreamFullness
  };
}

function addConnectorSplitLakeIfNeeded(
  region: Region,
  terrainMap: Map<string, HexTerrainData>,
  connectorSplit?: RiverConnectorSplit
): void {
  if (!connectorSplit) return;
  addLakeAroundRiverSplitVertex(
    region,
    connectorSplit.vertex,
    connectorSplit.upstreamFullness - connectorSplit.downstreamFullness,
    terrainMap
  );
}


function connectIncomingTributariesToMainPath(
  region: Region,
  rivers: River[],
  tributaryEndpoints: RiverEndpointTouch[],
  mainPath: RiverVertex[],
  riverGraph: RiverGraph,
  initialBlockedEdgeKeys: Set<string>,
  initialOccupiedVertexKeys: Set<string>
): River[] | null {
  if (tributaryEndpoints.length === 0) return rivers;

  const tributaryTargetVertices = mainPath.slice(1, -1);
  if (tributaryTargetVertices.length === 0) return null;

  let nextRivers = rivers;
  const blockedEdgeKeys = new Set(initialBlockedEdgeKeys);
  const occupiedVertexKeys = new Set(initialOccupiedVertexKeys);
  const allowedTargetKeys = new Set(tributaryTargetVertices.map((vertex) => vertex.key));

  for (const endpoint of tributaryEndpoints) {
    const tributaryPath = findBestFreeRiverPathToAnyTarget(
      endpoint.vertex,
      tributaryTargetVertices,
      riverGraph,
      blockedEdgeKeys,
      new Set([mainPath[0]?.key, mainPath[mainPath.length - 1]?.key].filter((key): key is string => Boolean(key))),
      occupiedVertexKeys,
      new Set([endpoint.vertex.key, ...allowedTargetKeys])
    );
    if (!tributaryPath) {
      console.warn('Could not connect incoming tributary to through river', {
        regionId: region.id,
        tributaryRiverId: endpoint.riverId,
      });
      return null;
    }

    const tributaryPathEdgeKeys = getRiverPathEdgeKeys(tributaryPath, riverGraph);
    if (!tributaryPathEdgeKeys) return null;
    for (const edgeKey of tributaryPathEdgeKeys) blockedEdgeKeys.add(edgeKey);
    for (const vertex of tributaryPath.slice(1, -1)) occupiedVertexKeys.add(vertex.key);

    nextRivers = nextRivers.map((river) => river.id !== endpoint.riverId
      ? river
      : {
        ...river,
        vertexPath: [...river.vertexPath, ...tributaryPath.slice(1)],
        sectors: appendRiverPathSector(river, tributaryPath, getRiverDownstreamFullness(river), region.id)
      });
  }

  return nextRivers;
}

function chooseRandomRiverControlPoints(
  redVertices: RiverVertex[],
  purpleVertices: RiverVertex[],
  existingRiverEndpointVerticesInRegion: RiverVertex[]
): { startVertex: RiverVertex; middlePurpleVertex?: RiverVertex; endVertex: RiverVertex; startMode: 'existing river endpoint' | 'red vertex' } | null {
  if (existingRiverEndpointVerticesInRegion.length > 0) {
    if (redVertices.length < 1) return null;
    const startVertex = randomFrom(existingRiverEndpointVerticesInRegion);
    const endPool = redVertices.filter((vertex) => vertex.key !== startVertex.key);
    if (endPool.length === 0) return null;
    const endVertex = randomFrom(endPool);
    if (purpleVertices.length === 0) return { startVertex, endVertex, startMode: 'existing river endpoint' };
    const preferredMiddle = purpleVertices.filter((vertex) => vertex.key !== startVertex.key && vertex.key !== endVertex.key);
    const middlePool = preferredMiddle.length > 0 ? preferredMiddle : purpleVertices;
    return { startVertex, middlePurpleVertex: randomFrom(middlePool), endVertex, startMode: 'existing river endpoint' };
  }
  if (redVertices.length < 2) return null;
  const startVertex = randomFrom(redVertices);
  const candidateEndVertices = redVertices.filter((vertex) => vertex.key !== startVertex.key);
  if (candidateEndVertices.length === 0) return null;
  const maxDistance = Math.max(...candidateEndVertices.map((vertex) => getRiverVertexDistance(startVertex, vertex)));
  const farthestVertices = candidateEndVertices.filter(
    (vertex) => Math.abs(getRiverVertexDistance(startVertex, vertex) - maxDistance) < 0.001
  );
  const endVertex = randomFrom(farthestVertices);
  console.log('River red endpoint selection', {
    mode: 'farthest_red_vertex',
    startVertexKey: startVertex.key,
    endVertexKey: endVertex.key,
    distance: getRiverVertexDistance(startVertex, endVertex),
    redVertexCount: redVertices.length
  });
  if (purpleVertices.length === 0) return { startVertex, endVertex, startMode: 'red vertex' };
  const preferredMiddle = purpleVertices.filter(
    (vertex) => vertex.key !== startVertex.key && vertex.key !== endVertex.key
  );
  const middlePool = preferredMiddle.length > 0 ? preferredMiddle : purpleVertices;
  const middlePurpleVertex = randomFrom(middlePool);
  return { startVertex, middlePurpleVertex, endVertex, startMode: 'red vertex' };
}

function buildRiverPathViaControlPoints(
  controlPoints: { startVertex: RiverVertex; middlePurpleVertex?: RiverVertex; endVertex: RiverVertex },
  riverGraph: RiverGraph,
  blockedEdgeKeys: Set<string> = new Set()
): RiverVertex[] {
  const startNode = riverGraph.nodes.get(controlPoints.startVertex.key);
  const endNode = riverGraph.nodes.get(controlPoints.endVertex.key);
  if (!startNode || !endNode) return [];
  if (!controlPoints.middlePurpleVertex) {
    return findRiverPath(startNode, endNode, riverGraph, blockedEdgeKeys).map((node) => ({ key: node.key, x: node.x, y: node.y }));
  }
  const middleNode = riverGraph.nodes.get(controlPoints.middlePurpleVertex.key);
  if (!middleNode) return [];
  const path1 = findRiverPath(startNode, middleNode, riverGraph, blockedEdgeKeys);
  const path2 = findRiverPath(middleNode, endNode, riverGraph, blockedEdgeKeys);
  if (path1.length < 1 || path2.length < 1) return [];
  const joined = [...path1, ...path2.slice(1)];
  return joined.map((node) => ({ key: node.key, x: node.x, y: node.y }));
}

function findBestFreeRiverPathFromEndpoints(
  existingRiverEndpointVerticesInRegion: RiverVertex[],
  redVertices: RiverVertex[],
  purpleVertices: RiverVertex[],
  riverGraph: RiverGraph,
  blockedEdgeKeys: Set<string>,
  centerHex: AxialHex | undefined,
  occupiedVertexKeys: Set<string> = new Set()
): { controlPoints: { startVertex: RiverVertex; middlePurpleVertex: RiverVertex; endVertex: RiverVertex; startMode: 'existing river endpoint' }; path: RiverVertex[] } | null {
  if (!centerHex || purpleVertices.length === 0) return null;
  let best: { controlPoints: { startVertex: RiverVertex; middlePurpleVertex: RiverVertex; endVertex: RiverVertex; startMode: 'existing river endpoint' }; path: RiverVertex[] } | null = null;

  for (const endpoint of existingRiverEndpointVerticesInRegion) {
    for (const redVertex of redVertices) {
      if (redVertex.key === endpoint.key) continue;
      for (const middlePurpleVertex of purpleVertices) {
        const controlPoints = { startVertex: endpoint, middlePurpleVertex, endVertex: redVertex, startMode: 'existing river endpoint' as const };
        const path = buildRiverPathViaControlPoints(controlPoints, riverGraph, blockedEdgeKeys);
        if (path.length < 2) continue;
        if (!validateRiverPathViaControlPoints(
          path,
          controlPoints,
          riverGraph,
          redVertices,
          existingRiverEndpointVerticesInRegion,
          blockedEdgeKeys,
          occupiedVertexKeys,
          new Set([endpoint.key])
        )) continue;
        if (!riverPathTouchesCenterHex(path, centerHex, riverGraph)) continue;
        if (!best || path.length < best.path.length) {
          best = { controlPoints, path };
        }
      }
    }
  }

  return best;
}

function riverPathAvoidsOccupiedVertices(
  vertexPath: RiverVertex[],
  occupiedVertexKeys: Set<string>,
  allowedOccupiedVertexKeys: Set<string> = new Set()
): boolean {
  return vertexPath.every((vertex) => !occupiedVertexKeys.has(vertex.key) || allowedOccupiedVertexKeys.has(vertex.key));
}

function validateRiverPathViaControlPoints(
  vertexPath: RiverVertex[],
  controlPoints: { startVertex: RiverVertex; middlePurpleVertex?: RiverVertex; endVertex: RiverVertex; startMode: 'existing river endpoint' | 'red vertex' },
  riverGraph: RiverGraph,
  redVertices: RiverVertex[],
  existingRiverEndpointVerticesInRegion: RiverVertex[],
  usedRiverEdges: Set<string>,
  occupiedVertexKeys: Set<string> = new Set(),
  allowedOccupiedVertexKeys: Set<string> = new Set()
): boolean {
  if (!vertexPath || vertexPath.length < 2) return false;
  const redSet = new Set(redVertices.map((vertex) => vertex.key));
  const endpointSet = new Set(existingRiverEndpointVerticesInRegion.map((vertex) => vertex.key));
  if (vertexPath[0].key !== controlPoints.startVertex.key) return false;
  if (vertexPath[vertexPath.length - 1].key !== controlPoints.endVertex.key) return false;
  if (!redSet.has(controlPoints.endVertex.key)) return false;
  if (controlPoints.startMode === 'red vertex' && !redSet.has(controlPoints.startVertex.key)) return false;
  if (controlPoints.startMode === 'existing river endpoint' && !endpointSet.has(controlPoints.startVertex.key)) return false;
  if (controlPoints.middlePurpleVertex && !vertexPath.some((vertex) => vertex.key === controlPoints.middlePurpleVertex?.key)) return false;
  if (new Set(vertexPath.map((vertex) => vertex.key)).size !== vertexPath.length) return false;
  const riverPathEdgeKeys = getRiverPathEdgeKeys(vertexPath, riverGraph);
  if (!riverPathEdgeKeys) return false;
  if (hasDuplicateEdgeKeys(riverPathEdgeKeys)) return false;
  if (riverPathEdgeKeys.some((pathEdgeKey) => usedRiverEdges.has(pathEdgeKey))) return false;
  if (!riverPathAvoidsOccupiedVertices(vertexPath, occupiedVertexKeys, allowedOccupiedVertexKeys)) return false;
  return true;
}

function getExistingRiverEndpointVerticesInRegion(region: Region, rivers: River[], riverGraph: RiverGraph): RiverVertex[] {
  void region;
  const endpointKeys = new Set<string>();
  for (const river of rivers) {
    if (!river.vertexPath || river.vertexPath.length < 1) continue;
    const firstVertex = river.vertexPath[0];
    const lastVertex = river.vertexPath[river.vertexPath.length - 1];
    if (firstVertex) endpointKeys.add(firstVertex.key);
    if (lastVertex) endpointKeys.add(lastVertex.key);
  }
  const vertices: RiverVertex[] = [];
  for (const node of riverGraph.nodes.values()) {
    if (!endpointKeys.has(node.key)) continue;
    if (!node.isRegionBoundaryVertex) continue;
    vertices.push({ key: node.key, x: node.x, y: node.y });
  }
  return vertices;
}

function getHexNeighbor(hex: AxialHex, direction: number): AxialHex | undefined {
  const delta = NEIGHBOR_DIRECTIONS[direction];
  if (!delta) return undefined;
  return { q: hex.q + delta.q, r: hex.r + delta.r };
}

function getHexEdgeNeighbor(hex: AxialHex, edgeIndex: number): AxialHex | undefined {
  const delta = HEX_EDGE_DIRECTIONS[edgeIndex];
  if (!delta) return undefined;
  return { q: hex.q + delta.q, r: hex.r + delta.r };
}

function getHexEdgeForDirection(hex: AxialHex, direction: number): HexEdge | undefined {
  if (direction < 0 || direction >= HEX_EDGE_DIRECTIONS.length) return undefined;
  return getHexEdgesAsVertexPairs(hex)[direction];
}

function getCandidateBoundaryEdgesForRegion(regionHexes: AxialHex[] = [], candidateHexes: AxialHex[] = []): HexEdge[] {
  if (regionHexes.length === 0 || candidateHexes.length === 0) return [];
  const regionSet = new Set(regionHexes.map(hexKey));
  const candidateSet = new Set(candidateHexes.map(hexKey));
  const edges = new Map<string, HexEdge>();
  for (const hex of regionHexes) {
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = getHexEdgeNeighbor(hex, direction);
      if (!neighbor) continue;
      const neighborKey = hexKey(neighbor);
      if (regionSet.has(neighborKey)) continue;
      if (!candidateSet.has(neighborKey)) continue;
      const edge = getHexEdgeForDirection(hex, direction);
      if (!edge) continue;
      edges.set(edge.edgeKey, edge);
    }
  }
  return Array.from(edges.values());
}

function getCandidateBoundaryVerticesForRegion(regionHexes: AxialHex[] = [], candidateHexes: AxialHex[] = []): RiverVertex[] {
  const vertices = new Map<string, RiverVertex>();
  for (const edge of getCandidateBoundaryEdgesForRegion(regionHexes, candidateHexes)) {
    vertices.set(edge.from.key, edge.from);
    vertices.set(edge.to.key, edge.to);
  }
  return Array.from(vertices.values());
}

function validateCandidateBoundaryVertices(
  regionHexes: AxialHex[] = [],
  candidateHexes: AxialHex[] = [],
  candidateBoundaryVertices: RiverVertex[] = []
): RiverVertex[] {
  if (regionHexes.length === 0 || candidateHexes.length === 0 || candidateBoundaryVertices.length === 0) return [];
  const validVertexKeys = new Set<string>();
  for (const edge of getCandidateBoundaryEdgesForRegion(regionHexes, candidateHexes)) {
    validVertexKeys.add(edge.from.key);
    validVertexKeys.add(edge.to.key);
  }
  return candidateBoundaryVertices.filter((vertex) => !validVertexKeys.has(vertex.key));
}

export function rollRegionTargetSize(): number {
  const roll = randomInt(1, 100);
  if (roll <= 5) return randomInt(5, 10);
  if (roll <= 40) return randomInt(11, 20);
  if (roll <= 65) return randomInt(21, 30);
  if (roll <= 83) return randomInt(31, 40);
  if (roll <= 95) return randomInt(41, 50);
  return randomInt(51, 60);
}

export function getRegionSizeCategory(size: number): Pick<Region, 'sizeCategory' | 'sizeLabel'> {
  if (size >= 5 && size <= 10) return { sizeCategory: 'locality', sizeLabel: 'Местность' };
  if (size >= 11 && size <= 20) return { sizeCategory: 'small_region', sizeLabel: 'Малый регион' };
  if (size >= 21 && size <= 30) return { sizeCategory: 'region', sizeLabel: 'Регион' };
  if (size >= 31 && size <= 40) return { sizeCategory: 'large_region', sizeLabel: 'Большой регион' };
  if (size >= 41 && size <= 50) return { sizeCategory: 'land', sizeLabel: 'Край' };
  return { sizeCategory: 'vast_land', sizeLabel: 'Обширный край' };
}

export function getRegionSizeDisplay(region: Partial<Region> & { hexes?: AxialHex[] }): string {
  const size = region.finalSize ?? region.hexes?.length ?? region.targetSize ?? 0;
  const { sizeLabel } = getRegionSizeCategory(size);
  return `${sizeLabel} (${size})`;
}

export function getHexNeighbors(hex: AxialHex): AxialHex[] {
  return NEIGHBOR_DIRECTIONS.map((direction) => ({ q: hex.q + direction.q, r: hex.r + direction.r }));
}

function hexDistance(a: AxialHex, b: AxialHex): number {
  const x1 = a.q;
  const z1 = a.r;
  const y1 = -x1 - z1;
  const x2 = b.q;
  const z2 = b.r;
  const y2 = -x2 - z2;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

type RiverGraphNode = {
  key: string;
  x: number;
  y: number;
  incidentEdgeKeys: string[];
  regionIncidentEdgeKeys: string[];
  boundaryIncidentEdgeKeys: string[];
  candidateBoundaryIncidentEdgeKeys: string[];
  isInsideRegion: boolean;
  isRegionBoundaryVertex: boolean;
  isCandidateBoundaryVertex: boolean;
};

type RiverGraphEdge = {
  key: string;
  a: RiverGraphNode;
  b: RiverGraphNode;
  hexA?: AxialHex;
  hexB?: AxialHex;
  touchesRegion: boolean;
  isInsideRegionEdge: boolean;
  isRegionBoundaryEdge: boolean;
  isCandidateBoundaryEdge: boolean;
};

type RiverGraph = {
  nodes: Map<string, RiverGraphNode>;
  edges: Map<string, RiverGraphEdge>;
};

type RiverEndpointIssue =
  | 'start_not_region_boundary'
  | 'end_not_region_boundary'
  | 'start_not_candidate_boundary_when_candidates_exist'
  | 'end_not_candidate_boundary_when_candidates_exist'
  | 'first_edge_not_boundary'
  | 'last_edge_not_boundary'
  | 'first_edge_not_candidate_boundary_when_candidates_exist'
  | 'last_edge_not_candidate_boundary_when_candidates_exist'
  | 'path_too_short'
  | 'segment_not_in_graph';

function edgeKey(a: RiverVertex, b: RiverVertex): string {
  return [a.key, b.key].sort().join('|');
}

function buildRiverGraphForRegion(regionHexes: AxialHex[], allHexes: AxialHex[], candidateHexes: AxialHex[] = []): RiverGraph {
  const regionKeys = new Set(regionHexes.map(hexKey));
  const allHexSet = new Set(allHexes.map(hexKey));
  const candidateBoundaryEdgeKeys = new Set(
    getCandidateBoundaryEdgesForRegion(regionHexes, candidateHexes).map((edge) => edge.edgeKey)
  );
  const nodes = new Map<string, RiverGraphNode>();
  const edges = new Map<string, RiverGraphEdge>();

  for (const hex of regionHexes) {
    for (const edge of getHexEdgesAsVertexPairs(hex)) {
      if (!nodes.has(edge.from.key)) {
        nodes.set(edge.from.key, {
          key: edge.from.key,
          x: edge.from.x,
          y: edge.from.y,
          incidentEdgeKeys: [],
          regionIncidentEdgeKeys: [],
          boundaryIncidentEdgeKeys: [],
          candidateBoundaryIncidentEdgeKeys: [],
          isInsideRegion: true,
          isRegionBoundaryVertex: false,
          isCandidateBoundaryVertex: false
        });
      }
      if (!nodes.has(edge.to.key)) {
        nodes.set(edge.to.key, {
          key: edge.to.key,
          x: edge.to.x,
          y: edge.to.y,
          incidentEdgeKeys: [],
          regionIncidentEdgeKeys: [],
          boundaryIncidentEdgeKeys: [],
          candidateBoundaryIncidentEdgeKeys: [],
          isInsideRegion: true,
          isRegionBoundaryVertex: false,
          isCandidateBoundaryVertex: false
        });
      }
      if (edges.has(edge.edgeKey)) continue;
      const hasRegionNeighbor = regionKeys.has(hexKey(edge.neighborHex));
      const isInsideRegionEdge = hasRegionNeighbor;
      const isRegionBoundaryEdge = !hasRegionNeighbor;
      const isCandidateBoundaryEdge = candidateBoundaryEdgeKeys.has(edge.edgeKey);
      const touchesRegion = true;
      edges.set(edge.edgeKey, {
        key: edge.edgeKey,
        a: nodes.get(edge.from.key)!,
        b: nodes.get(edge.to.key)!,
        hexA: hex,
        hexB: allHexSet.has(hexKey(edge.neighborHex)) ? edge.neighborHex : undefined,
        touchesRegion,
        isInsideRegionEdge,
        isRegionBoundaryEdge,
        isCandidateBoundaryEdge
      });
    }
  }

  for (const edge of edges.values()) {
    for (const node of [edge.a, edge.b]) {
      node.incidentEdgeKeys.push(edge.key);
      node.regionIncidentEdgeKeys.push(edge.key);
      if (edge.isRegionBoundaryEdge) {
        node.boundaryIncidentEdgeKeys.push(edge.key);
        node.isRegionBoundaryVertex = true;
      }
      if (edge.isCandidateBoundaryEdge) {
        node.candidateBoundaryIncidentEdgeKeys.push(edge.key);
        node.isCandidateBoundaryVertex = true;
      }
    }
  }

  return { nodes, edges };
}

function findRiverPath(
  startNode: RiverGraphNode,
  endNode: RiverGraphNode,
  riverGraph: RiverGraph,
  blockedEdgeKeys: Set<string> = new Set()
): RiverGraphNode[] {
  const previous = new Map<string, string>();
  const queue: string[] = [startNode.key];
  const visited = new Set<string>([startNode.key]);
  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    if (currentKey === endNode.key) break;
    const currentNode = riverGraph.nodes.get(currentKey);
    if (!currentNode) continue;
    for (const edgeKey of currentNode.incidentEdgeKeys) {
      if (blockedEdgeKeys.has(edgeKey)) continue;
      const edge = riverGraph.edges.get(edgeKey);
      if (!edge?.touchesRegion) continue;
      const nextKey = edge.a.key === currentKey ? edge.b.key : edge.a.key;
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      previous.set(nextKey, currentKey);
      queue.push(nextKey);
    }
  }
  if (!visited.has(endNode.key)) return [];
  const path: RiverGraphNode[] = [];
  let currentKey: string | undefined = endNode.key;
  while (currentKey) {
    const node = riverGraph.nodes.get(currentKey);
    if (!node) return [];
    path.push(node);
    if (currentKey === startNode.key) break;
    currentKey = previous.get(currentKey);
  }
  return path.reverse();
}

function findBestFreeRiverPathToAnyTarget(
  startVertex: RiverVertex,
  targetVertices: RiverVertex[],
  riverGraph: RiverGraph,
  blockedEdgeKeys: Set<string>,
  excludedTargetVertexKeys: Set<string> = new Set(),
  occupiedVertexKeys: Set<string> = new Set(),
  allowedOccupiedVertexKeys: Set<string> = new Set()
): RiverVertex[] | null {
  const startNode = riverGraph.nodes.get(startVertex.key);
  if (!startNode || targetVertices.length === 0) return null;

  let bestPath: RiverVertex[] | null = null;
  for (const targetVertex of targetVertices) {
    if (excludedTargetVertexKeys.has(targetVertex.key)) continue;
    const targetNode = riverGraph.nodes.get(targetVertex.key);
    if (!targetNode) continue;

    const path = findRiverPath(startNode, targetNode, riverGraph, blockedEdgeKeys)
      .map((node) => ({ key: node.key, x: node.x, y: node.y }));
    if (path.length < 2) continue;
    if (new Set(path.map((vertex) => vertex.key)).size !== path.length) continue;
    const pathEdgeKeys = getRiverPathEdgeKeys(path, riverGraph);
    if (!pathEdgeKeys) continue;
    if (pathEdgeKeys.some((edgeKey) => blockedEdgeKeys.has(edgeKey))) continue;
    if (!riverPathAvoidsOccupiedVertices(path, occupiedVertexKeys, allowedOccupiedVertexKeys)) continue;

    if (!bestPath || path.length < bestPath.length) {
      bestPath = path;
    }
  }

  return bestPath;
}

function buildBoundingBox(occupiedHexes: Set<string>, padding = 2): { minQ: number; maxQ: number; minR: number; maxR: number } {
  const occupied = Array.from(occupiedHexes).map(parseHexKey);
  if (occupied.length === 0) {
    return { minQ: -padding, maxQ: padding, minR: -padding, maxR: padding };
  }
  return {
    minQ: Math.min(...occupied.map((h) => h.q)) - padding,
    maxQ: Math.max(...occupied.map((h) => h.q)) + padding,
    minR: Math.min(...occupied.map((h) => h.r)) - padding,
    maxR: Math.max(...occupied.map((h) => h.r)) + padding
  };
}

type EmptyAreaScanResult = {
  areaKeys: Set<string>;
  isOpen: boolean;
};

function scanEmptyArea(
  startHex: AxialHex,
  blockedHexes: Set<string>,
  bbox: { minQ: number; maxQ: number; minR: number; maxR: number },
  globalVisited?: Set<string>
): EmptyAreaScanResult {
  const startKey = hexKey(startHex);
  const queue: AxialHex[] = [startHex];
  const areaKeys = new Set<string>([startKey]);
  let isOpen = false;
  if (globalVisited) globalVisited.add(startKey);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.q < bbox.minQ || current.q > bbox.maxQ || current.r < bbox.minR || current.r > bbox.maxR) {
      isOpen = true;
      continue;
    }
    for (const neighbor of getHexNeighbors(current)) {
      const neighborKey = hexKey(neighbor);
      if (blockedHexes.has(neighborKey)) {
        continue;
      }
      if (areaKeys.has(neighborKey)) continue;
      areaKeys.add(neighborKey);
      if (globalVisited) globalVisited.add(neighborKey);
      queue.push(neighbor);
    }
  }

  return { areaKeys, isOpen };
}

type GrowthCandidate = {
  hex: AxialHex;
  currentRegionNeighborCount: number;
  existingRegionNeighborCount: number;
  totalGrowthWeight: number;
};

export function getGrowthCandidate(
  candidate: AxialHex,
  currentRegionHexes: Set<string>,
  occupiedHexes: Set<string>
): GrowthCandidate | null {
  let currentRegionNeighborCount = 0;
  let existingRegionNeighborCount = 0;

  for (const neighbor of getHexNeighbors(candidate)) {
    const neighborKey = hexKey(neighbor);
    if (currentRegionHexes.has(neighborKey)) {
      currentRegionNeighborCount += 1;
    } else if (occupiedHexes.has(neighborKey)) {
      existingRegionNeighborCount += 1;
    }
  }

  if (currentRegionNeighborCount < 1) {
    return null;
  }

  return {
    hex: candidate,
    currentRegionNeighborCount,
    existingRegionNeighborCount,
    totalGrowthWeight: currentRegionNeighborCount + existingRegionNeighborCount
  };
}

export function weightedPickCandidate(candidates: GrowthCandidate[]): GrowthCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce((acc, candidate) => acc + candidate.totalGrowthWeight, 0);
  if (totalWeight <= 0) {
    return candidates[0];
  }

  let roll = Math.random() * totalWeight;
  for (const candidate of candidates) {
    roll -= candidate.totalGrowthWeight;
    if (roll <= 0) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

export function findFillableEnclosedEmptyAreas(
  currentRegionHexes: Set<string>,
  occupiedHexes: Set<string>
): AxialHex[][] {
  const blockedHexes = new Set([...occupiedHexes, ...currentRegionHexes]);
  const bbox = buildBoundingBox(blockedHexes, 2);
  const visitedEmpty = new Set<string>();
  const enclosedAreas: AxialHex[][] = [];
  const frontierCandidates = getFrontierCandidateHexes(currentRegionHexes, occupiedHexes);

  for (const start of frontierCandidates) {
    const startKey = hexKey(start);
    if (visitedEmpty.has(startKey) || blockedHexes.has(startKey)) continue;
    const area = scanEmptyArea(start, blockedHexes, bbox, visitedEmpty);
    if (!area.isOpen) enclosedAreas.push(Array.from(area.areaKeys).map(parseHexKey));
  }

  return enclosedAreas;
}

export function getFrontierCandidateHexes(currentRegionHexes: Set<string>, occupiedHexes: Set<string>): AxialHex[] {
  const frontierMap = new Map<string, AxialHex>();
  for (const regionHex of Array.from(currentRegionHexes).map(parseHexKey)) {
    for (const neighbor of getHexNeighbors(regionHex)) {
      const key = hexKey(neighbor);
      if (!currentRegionHexes.has(key) && !occupiedHexes.has(key)) frontierMap.set(key, neighbor);
    }
  }
  return Array.from(frontierMap.values());
}

export function generateConnectedRegionFromAnchor(
  anchorHex: AxialHex,
  size: number,
  occupiedHexes: Set<string>
): AxialHex[] {
  const targetSize = Math.max(1, size);
  const regionKeys = new Set<string>([hexKey(anchorHex)]);
  while (true) {
    const enclosedAreas = findFillableEnclosedEmptyAreas(regionKeys, occupiedHexes);
    if (enclosedAreas.length > 0) {
      for (const area of enclosedAreas) {
        for (const hex of area) regionKeys.add(hexKey(hex));
      }
      continue;
    }

    if (regionKeys.size >= targetSize) break;

    const growthCandidates = getFrontierCandidateHexes(regionKeys, occupiedHexes)
      .map((candidate) => getGrowthCandidate(candidate, regionKeys, occupiedHexes))
      .filter((candidate): candidate is GrowthCandidate => candidate !== null);
    const picked = weightedPickCandidate(growthCandidates);
    if (!picked) break;
    regionKeys.add(hexKey(picked.hex));
  }

  return Array.from(regionKeys).map(parseHexKey);
}

export function chooseRegionCenter(regionHexes: AxialHex[]): AxialHex {
  if (regionHexes.length === 1) {
    return regionHexes[0];
  }

  const regionKeys = new Set(regionHexes.map(hexKey));
  const byNeighborCount = regionHexes.map((hex) => ({
    hex,
    sameRegionNeighborCount: getHexNeighbors(hex).filter((neighbor) => regionKeys.has(hexKey(neighbor))).length
  }));

  const maxNeighborCount = Math.max(...byNeighborCount.map(({ sameRegionNeighborCount }) => sameRegionNeighborCount));
  const bestCenterCandidates = byNeighborCount
    .filter(({ sameRegionNeighborCount }) => sameRegionNeighborCount === maxNeighborCount)
    .map(({ hex }) => hex);

  return randomFrom(bestCenterCandidates);
}

function getBiomeColor(biomeId: BiomeId | undefined): string {
  if (!biomeId) return BIOMES[FALLBACK_BIOME_ID].color;
  return BIOMES[biomeId]?.color ?? BIOMES[FALLBACK_BIOME_ID].color;
}

export function getCandidateHexes(allRegionHexes: AxialHex[], excludeKeys?: Set<string>): AxialHex[] {
  const occupied = new Set(allRegionHexes.map(hexKey));
  const candidates = new Map<string, AxialHex>();

  for (const hex of allRegionHexes) {
    for (const neighbor of getHexNeighbors(hex)) {
      const key = hexKey(neighbor);
      if (occupied.has(key)) continue;
      // Гексы-море нельзя занять сушей — они не предлагаются как точки роста.
      if (excludeKeys?.has(key)) continue;
      candidates.set(key, neighbor);
    }
  }

  return Array.from(candidates.values());
}

// BR-002: вероятность побережья для нового региона по протяжённости карты.
// Берётся максимальная протяжённость уже сгенерированной карты по трём осям
// гекс-сетки, ограничивается 400, и делится на 400.
const COAST_SPAN_CAP = 400;
const START_REGION_AUTO_COAST_PROBABILITY = 0.3;

function computeMapMaxSpanTiles(allRegionHexes: AxialHex[]): number {
  if (allRegionHexes.length === 0) return 0;
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity, minS = Infinity, maxS = -Infinity;
  for (const hex of allRegionHexes) {
    const s = -hex.q - hex.r;
    if (hex.q < minQ) minQ = hex.q;
    if (hex.q > maxQ) maxQ = hex.q;
    if (hex.r < minR) minR = hex.r;
    if (hex.r > maxR) maxR = hex.r;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
  }
  return Math.max(maxQ - minQ, maxR - minR, maxS - minS);
}

function coastProbabilityFromSpan(span: number): number {
  return Math.min(span, COAST_SPAN_CAP) / COAST_SPAN_CAP;
}

// BR-002 (принудительное продолжение): новый регион граничит с гексом, который
// граничит с прибрежным (морским) гексом — тогда регион гарантированно прибрежный.
function regionForcesCoastContinuation(regionHexes: AxialHex[], seaKeys: Set<string>): boolean {
  if (seaKeys.size === 0) return false;
  const regionSet = new Set(regionHexes.map(hexKey));
  for (const hex of regionHexes) {
    for (const neighbor of getHexNeighbors(hex)) {
      if (regionSet.has(hexKey(neighbor))) continue;
      for (const second of getHexNeighbors(neighbor)) {
        if (seaKeys.has(hexKey(second))) return true;
      }
    }
  }
  return false;
}

function regionHasOutgoingRiverToExistingRegion(touchingEndpoints: RiverEndpointTouch[]): boolean {
  return touchingEndpoints.some((endpoint) => endpoint.endpointType === 'start');
}

function getHexSameRegionNeighborCount(hex: AxialHex, regionKeys: Set<string>): number {
  return getHexNeighbors(hex).filter((neighbor) => regionKeys.has(hexKey(neighbor))).length;
}

function chooseCoastalCenterHex(regionHexes: AxialHex[], seaKeys: Set<string>, rivers: River[]): AxialHex | null {
  const regionKeys = new Set(regionHexes.map(hexKey));
  const candidates = regionHexes.filter((hex) => {
    const touchesSea = getHexNeighbors(hex).some((neighbor) => seaKeys.has(hexKey(neighbor)));
    return touchesSea && getRiversForHex(hex, rivers).length > 0;
  });
  if (candidates.length === 0) return null;

  const maxNeighborCount = Math.max(...candidates.map((hex) => getHexSameRegionNeighborCount(hex, regionKeys)));
  return randomFrom(candidates.filter((hex) => getHexSameRegionNeighborCount(hex, regionKeys) === maxNeighborCount));
}

function getClaimableSeaNeighborKey(
  hex: AxialHex,
  regionKeys: Set<string>,
  occupiedRegionKeys: Set<string>,
  existingTerrain: Map<string, HexTerrainData>
): string | null {
  const neighbors = getHexNeighbors(hex)
    .filter((neighbor) => {
      const key = hexKey(neighbor);
      return !regionKeys.has(key) && !occupiedRegionKeys.has(key) && !existingTerrain.get(key)?.terrainOverride;
    })
    .sort((left, right) => hexDistanceFromCenter(right) - hexDistanceFromCenter(left));

  return neighbors[0] ? hexKey(neighbors[0]) : null;
}

function getSeaCandidateHexesForRegion(
  regionHexes: AxialHex[],
  existingTerrain: Map<string, HexTerrainData>,
  occupiedRegionKeys: Set<string>
): Map<string, AxialHex> {
  const regionKeys = new Set(regionHexes.map(hexKey));
  const candidates = new Map<string, AxialHex>();
  for (const hex of regionHexes) {
    for (const neighbor of getHexNeighbors(hex)) {
      const key = hexKey(neighbor);
      if (regionKeys.has(key)) continue;
      if (occupiedRegionKeys.has(key)) continue;
      if (existingTerrain.get(key)?.terrainOverride) continue;
      candidates.set(key, neighbor);
    }
  }
  return candidates;
}

function getSeaCandidateNeighborKeys(key: string, candidates: Map<string, AxialHex>): string[] {
  const hex = candidates.get(key);
  if (!hex) return [];
  return getHexNeighbors(hex).map(hexKey).filter((neighborKey) => candidates.has(neighborKey));
}

function findSeaCandidatePath(
  startKeys: Set<string>,
  targetKey: string,
  candidates: Map<string, AxialHex>
): string[] | null {
  if (!candidates.has(targetKey)) return null;
  if (startKeys.has(targetKey)) return [targetKey];

  const queue = Array.from(startKeys).filter((key) => candidates.has(key));
  const previousByKey = new Map<string, string | null>();
  for (const key of queue) previousByKey.set(key, null);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentKey = queue[cursor];
    for (const neighborKey of getSeaCandidateNeighborKeys(currentKey, candidates)) {
      if (previousByKey.has(neighborKey)) continue;
      previousByKey.set(neighborKey, currentKey);
      if (neighborKey === targetKey) {
        const path = [targetKey];
        let previousKey = currentKey;
        while (previousKey) {
          path.push(previousKey);
          previousKey = previousByKey.get(previousKey) ?? null;
        }
        return path.reverse();
      }
      queue.push(neighborKey);
    }
  }

  return null;
}

function connectRequiredSeaKeys(candidates: Map<string, AxialHex>, requiredKeys: string[]): Set<string> {
  const existingRequiredKeys = requiredKeys.filter((key) => candidates.has(key));
  if (existingRequiredKeys.length === 0) return new Set<string>();

  const connectedKeys = new Set<string>([existingRequiredKeys[0]]);
  for (const targetKey of existingRequiredKeys.slice(1)) {
    const path = findSeaCandidatePath(connectedKeys, targetKey, candidates);
    if (!path) return new Set<string>();
    for (const key of path) connectedKeys.add(key);
  }

  return connectedKeys;
}

function getExpandableSeaNeighborKeys(seaKeys: Set<string>, candidates: Map<string, AxialHex>): string[] {
  const frontier = new Set<string>();
  for (const key of seaKeys) {
    for (const neighborKey of getSeaCandidateNeighborKeys(key, candidates)) {
      if (!seaKeys.has(neighborKey)) frontier.add(neighborKey);
    }
  }
  return Array.from(frontier);
}

function expandConnectedSeaArea(seaKeys: Set<string>, candidates: Map<string, AxialHex>): Set<string> {
  const nextSeaKeys = new Set(seaKeys);
  const firstFrontier = getExpandableSeaNeighborKeys(nextSeaKeys, candidates);
  const extraCount = Math.floor(Math.random() * (firstFrontier.length + 1));

  for (let i = 0; i < extraCount; i += 1) {
    const frontier = getExpandableSeaNeighborKeys(nextSeaKeys, candidates);
    if (frontier.length === 0) break;
    nextSeaKeys.add(randomFrom(frontier));
  }

  return nextSeaKeys;
}

function seaKeysTouchExistingSea(seaKeys: Set<string>, existingSeaKeys: Set<string>): boolean {
  for (const key of seaKeys) {
    for (const neighbor of getHexNeighbors(parseHexKey(key))) {
      if (existingSeaKeys.has(hexKey(neighbor))) return true;
    }
  }
  return false;
}

function seaHexTouchesRiverMouth(seaHex: AxialHex, mouth: RiverVertex): boolean {
  if (getHexCornerPoints(seaHex).some((vertex) => vertex.key === mouth.key)) return true;
  const center = toPixel(seaHex.q, seaHex.r);
  return Math.hypot(center.x - mouth.x, center.y - mouth.y) <= HEX_SIZE * 1.75;
}

function getSeaFlowingRiversForRegion(rivers: River[], regionId: number, existingRegions: Region[]): River[] {
  return rivers.filter((river) => {
    if (!river.vertexPath?.length) return false;
    const belongsToRegion = river.regionId === regionId || river.sectors?.some((sector) => sector.assignedRegionId === regionId);
    if (!belongsToRegion) return false;
    const mouth = river.vertexPath[river.vertexPath.length - 1];
    const touchingExistingRegion = findRegionTouchingVertex(mouth, existingRegions);
    return !touchingExistingRegion;
  });
}

function chooseSeaCandidateKeyForRiverMouth(candidates: Map<string, AxialHex>, mouth: RiverVertex): string | null {
  const touching = Array.from(candidates.entries())
    .filter(([, hex]) => seaHexTouchesRiverMouth(hex, mouth))
    .sort(([, left], [, right]) => {
      const leftCenter = toPixel(left.q, left.r);
      const rightCenter = toPixel(right.q, right.r);
      return Math.hypot(leftCenter.x - mouth.x, leftCenter.y - mouth.y) - Math.hypot(rightCenter.x - mouth.x, rightCenter.y - mouth.y);
    });
  if (touching[0]) return touching[0][0];

  const nearest = Array.from(candidates.entries())
    .sort(([, left], [, right]) => {
      const leftCenter = toPixel(left.q, left.r);
      const rightCenter = toPixel(right.q, right.r);
      return Math.hypot(leftCenter.x - mouth.x, leftCenter.y - mouth.y) - Math.hypot(rightCenter.x - mouth.x, rightCenter.y - mouth.y);
    });
  return nearest[0]?.[0] ?? null;
}

function getConnectedSeaComponent(startKey: string, seaKeys: Set<string>): Set<string> {
  const connected = new Set<string>([startKey]);
  const queue = [startKey];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentKey = queue[cursor];
    for (const neighbor of getHexNeighbors(parseHexKey(currentKey))) {
      const neighborKey = hexKey(neighbor);
      if (!seaKeys.has(neighborKey) || connected.has(neighborKey)) continue;
      connected.add(neighborKey);
      queue.push(neighborKey);
    }
  }
  return connected;
}

type CoastalSeaValidationResult = { valid: true } | { valid: false; reason: string };

function validateCoastalSeaArea(
  regionHexes: AxialHex[],
  seaHexKeys: string[],
  existingSeaKeys: Set<string>,
  rivers: River[],
  regionId: number,
  existingRegions: Region[]
): CoastalSeaValidationResult {
  const seaKeys = new Set(seaHexKeys);
  if (seaKeys.size === 0) return { valid: false, reason: 'no_sea_hexes' };

  const regionKeys = new Set(regionHexes.map(hexKey));
  for (const key of seaKeys) {
    const touchesRegion = getHexNeighbors(parseHexKey(key)).some((neighbor) => regionKeys.has(hexKey(neighbor)));
    if (!touchesRegion) return { valid: false, reason: 'sea_hex_does_not_touch_region' };
  }

  if (seaKeys.size > 1) {
    for (const key of seaKeys) {
      const touchesSea = getHexNeighbors(parseHexKey(key)).some((neighbor) => seaKeys.has(hexKey(neighbor)));
      if (!touchesSea) return { valid: false, reason: 'isolated_sea_hex' };
    }
    const firstKey = Array.from(seaKeys)[0];
    if (getConnectedSeaComponent(firstKey, seaKeys).size !== seaKeys.size) return { valid: false, reason: 'disconnected_sea_area' };
  }

  if (regionForcesCoastContinuation(regionHexes, existingSeaKeys) && !seaKeysTouchExistingSea(seaKeys, existingSeaKeys)) {
    return { valid: false, reason: 'sea_area_not_connected_to_existing_coast' };
  }

  for (const river of getSeaFlowingRiversForRegion(rivers, regionId, existingRegions)) {
    const mouth = river.vertexPath[river.vertexPath.length - 1];
    const touchesMouth = Array.from(seaKeys).some((key) => seaHexTouchesRiverMouth(parseHexKey(key), mouth));
    if (!touchesMouth) return { valid: false, reason: 'sea_area_does_not_touch_river_mouth' };
  }

  return { valid: true };
}

function extendSeaToCoastalCenterCandidate(
  regionHexes: AxialHex[],
  seaHexKeys: string[],
  existingTerrain: Map<string, HexTerrainData>,
  occupiedRegionKeys: Set<string>,
  rivers: River[]
): string[] {
  const seaKeys = new Set(seaHexKeys);
  if (chooseCoastalCenterHex(regionHexes, seaKeys, rivers)) return Array.from(seaKeys);

  const regionKeys = new Set(regionHexes.map(hexKey));
  const candidates = getSeaCandidateHexesForRegion(regionHexes, existingTerrain, occupiedRegionKeys);
  const riverHexes = regionHexes
    .filter((hex) => getRiversForHex(hex, rivers).length > 0)
    .sort((left, right) => hexDistanceFromCenter(right) - hexDistanceFromCenter(left));

  for (const hex of riverHexes) {
    const seaKey = getClaimableSeaNeighborKey(hex, regionKeys, occupiedRegionKeys, existingTerrain);
    if (!seaKey) continue;
    const path = seaKeys.size > 0 ? findSeaCandidatePath(seaKeys, seaKey, candidates) : [seaKey];
    if (!path) continue;
    for (const key of path) seaKeys.add(key);
    if (chooseCoastalCenterHex(regionHexes, seaKeys, rivers)) break;
  }

  return Array.from(seaKeys);
}

// Гексы-море для прибрежного региона: пустые гексы на отвёрнутой от центра
// ("береговой") стороне региона. Никогда не ставятся на гексы какого-либо
// региона и на гексы с уже заданным terrain (озёра/существующее море).
function computeSeaHexKeysForCoastalRegion(
  regionHexes: AxialHex[],
  centerHex: AxialHex,
  existingTerrain: Map<string, HexTerrainData>,
  occupiedRegionKeys: Set<string>,
  existingRegions: Region[],
  rivers: River[],
  regionId: number
): string[] {
  const candidates = getSeaCandidateHexesForRegion(regionHexes, existingTerrain, occupiedRegionKeys);
  if (candidates.size === 0) return [];

  const centerDistance = hexDistanceFromCenter(centerHex);
  const existingSeaKeys = getSeaHexKeys(existingTerrain);
  const requiredKeys = new Set<string>();

  for (const [key, hex] of candidates) {
    if (getHexNeighbors(hex).some((neighbor) => existingSeaKeys.has(hexKey(neighbor)))) requiredKeys.add(key);
  }

  for (const river of getSeaFlowingRiversForRegion(rivers, regionId, existingRegions)) {
    const mouth = river.vertexPath[river.vertexPath.length - 1];
    const key = chooseSeaCandidateKeyForRiverMouth(candidates, mouth);
    if (key) requiredKeys.add(key);
  }

  if (requiredKeys.size === 0) {
    const shoreward = Array.from(candidates.values()).filter((hex) => hexDistanceFromCenter(hex) > centerDistance);
    const pool = shoreward.length > 0 ? shoreward : Array.from(candidates.values());
    const farthestDistance = Math.max(...pool.map(hexDistanceFromCenter));
    const farthest = pool.filter((hex) => hexDistanceFromCenter(hex) === farthestDistance);
    requiredKeys.add(hexKey(randomFrom(farthest)));
  }

  const connectedRequiredSeaKeys = connectRequiredSeaKeys(candidates, Array.from(requiredKeys));
  if (connectedRequiredSeaKeys.size === 0) return [];

  return Array.from(expandConnectedSeaArea(connectedRequiredSeaKeys, candidates));
}

// Выбор освоенности (BR-007): прибрежный регион освоен с вероятностью 40%,
// материковый — 20%.
function chooseCoastalAwareLandType(isCoastal: boolean): BiomeLandType {
  const settledChance = isCoastal ? 0.4 : 0.2;
  return Math.random() < settledChance ? 'settled' : 'wild';
}

type RiverGenerationResult = { success: boolean; rivers: River[]; reason?: string };

function getMinimumMountainRiverCountForRegion(region: Region): number {
  if (region.heightLevel !== 3) return 0;
  if (region.sizeCategory === 'locality' || region.sizeCategory === 'small_region') return 1;
  if (region.sizeCategory === 'region' || region.sizeCategory === 'large_region') return 2;
  return 3;
}

function buildMinimumMountainRiverPath(
  sourceVertices: RiverVertex[],
  endVertices: RiverVertex[],
  riverGraph: RiverGraph,
  usedRiverEdges: Set<string>,
  occupiedVertexKeys: Set<string> = new Set()
): RiverVertex[] | null {
  for (const sourceVertex of sourceVertices) {
    for (const endVertex of endVertices) {
      if (sourceVertex.key === endVertex.key) continue;
      const sourceNode = riverGraph.nodes.get(sourceVertex.key);
      const endNode = riverGraph.nodes.get(endVertex.key);
      if (!sourceNode || !endNode) continue;

      const path = findRiverPath(sourceNode, endNode, riverGraph, usedRiverEdges)
        .map((node) => ({ key: node.key, x: node.x, y: node.y }));
      if (path.length < 2) continue;
      if (path[0].key !== sourceVertex.key || path[path.length - 1].key !== endVertex.key) continue;
      if (new Set(path.map((vertex) => vertex.key)).size !== path.length) continue;
      const pathEdgeKeys = getRiverPathEdgeKeys(path, riverGraph);
      if (!pathEdgeKeys) continue;
      if (hasDuplicateEdgeKeys(pathEdgeKeys)) continue;
      if (pathEdgeKeys.some((edgeKey) => usedRiverEdges.has(edgeKey))) continue;
      if (!riverPathAvoidsOccupiedVertices(path, occupiedVertexKeys)) continue;

      return path;
    }
  }

  return null;
}

function ensureMinimumMountainRiversForRegion(
  region: Region,
  regions: Region[],
  rivers: River[],
  riverGraph: RiverGraph,
  candidateHexes: AxialHex[],
  candidateVertices: RiverVertex[],
  neighborRegionVertices: RiverVertex[]
): River[] {
  const minimumRiverCount = getMinimumMountainRiverCountForRegion(region);
  if (minimumRiverCount <= 0) return rivers;

  let nextRivers = rivers;
  const blockedEndVertexKeys = new Set(neighborRegionVertices.map((vertex) => vertex.key));

  while (getRiversForRegion(region, nextRivers).length < minimumRiverCount) {
    const usedRiverEdges = buildUsedRiverEdges(nextRivers);
    const existingRiverVertexKeys = new Set(nextRivers.flatMap((river) => river.vertexPath.map((vertex) => vertex.key)));
    const centerHexRiverCount = region.centerHex ? getRiversForHex(region.centerHex, nextRivers).length : 0;
    const requireCenterHexSource = Boolean(region.centerHex && centerHexRiverCount === 0);
    const centerHexVertexKeys = new Set((region.centerHex ? getHexCornerPoints(region.centerHex) : []).map((vertex) => vertex.key));
    const sourceVertices = getMountainInteriorSourceVertices(
      region,
      regions,
      candidateHexes,
      riverGraph,
      candidateVertices,
      neighborRegionVertices
    ).filter((vertex) => (
      !existingRiverVertexKeys.has(vertex.key)
      && (!requireCenterHexSource || centerHexVertexKeys.has(vertex.key))
    ));
    const endVertices = candidateVertices.filter((vertex) => !blockedEndVertexKeys.has(vertex.key));

    const path = buildMinimumMountainRiverPath(sourceVertices, endVertices, riverGraph, usedRiverEdges, existingRiverVertexKeys);
    if (!path) {
      console.warn('Could not add minimum mountain river', {
        regionId: region.id,
        currentRiverCount: getRiversForRegion(region, nextRivers).length,
        minimumRiverCount,
        sourceVertexCount: sourceVertices.length,
        endVertexCount: endVertices.length,
        centerHexRiverCount,
        requireCenterHexSource,
      });
      break;
    }

    const newRiverId = Math.max(0, ...nextRivers.map((river) => river.id)) + 1;
    const river: River = {
      id: newRiverId,
      regionId: region.id,
      vertexPath: path,
      sectors: createInitialRiverSectors(newRiverId, path, 1, {}, region.id),
      controlPoints: {
        startVertex: path[0],
        endVertex: path[path.length - 1],
        startMode: 'red vertex'
      }
    };

    nextRivers = [...nextRivers, river];
    for (const nextRiver of nextRivers) {
      validateRiverDirection(nextRiver);
      validateRiverContinuity(nextRiver);
    }
    validateNoDuplicateRiverEdges(nextRivers);
  }

  return nextRivers;
}


function decreaseRiverFullness(fullness: RiverFullness): RiverFullness {
  return Math.max(1, fullness - 1) as RiverFullness;
}

type RemainingOutgoingConnection = {
  endpoint: RiverEndpointTouch;
  river: River;
  downstreamRegion: Region;
};

function getRemainingOutgoingConnectionsForRegion(
  region: Region,
  regions: Region[],
  rivers: River[],
  riverGraph: RiverGraph
): RemainingOutgoingConnection[] {
  const otherRegions = regions.filter((item) => item.id !== region.id);
  return findRiverEndpointsTouchingRegion(region, rivers, riverGraph)
    .filter((endpoint) => endpoint.endpointType === 'start')
    .map((endpoint) => {
      const river = rivers.find((item) => item.id === endpoint.riverId);
      const downstreamRegion = findRegionTouchingVertex(endpoint.vertex, otherRegions);
      if (!river || !downstreamRegion) return null;
      if (downstreamRegion.heightLevel > region.heightLevel) return null;
      return { endpoint, river, downstreamRegion };
    })
    .filter((connection): connection is RemainingOutgoingConnection => connection !== null)
    .sort((a, b) => a.river.id - b.river.id);
}

function getOutgoingInteriorConnectorFullness(
  river: River,
  outgoingVertexKey: string,
  connectedToLake: boolean
): RiverFullness {
  const outgoingFullness = getRiverFullnessAtVertex(river, outgoingVertexKey);
  if (connectedToLake) return outgoingFullness;
  return outgoingFullness > 1 ? decreaseRiverFullness(outgoingFullness) : outgoingFullness;
}

function getAvailableUnconnectedLakesForRegion(
  region: Region,
  terrainMap: Map<string, HexTerrainData>,
  rivers: River[],
  usedLakeIds: Set<number>
): Lake[] {
  return getLakesForRegion(region, terrainMap)
    .filter((lake) => !usedLakeIds.has(lake.lakeId))
    .filter((lake) => !lakeHasRiverConnection(lake.hexes, rivers));
}

function prependOutgoingRiverConnection(
  rivers: River[],
  connection: RemainingOutgoingConnection,
  path: RiverVertex[],
  fullness: RiverFullness,
  assignedRegionId: number
): River[] {
  return rivers.map((river) => river.id !== connection.river.id
    ? river
    : {
      ...river,
      vertexPath: [...path.slice(0, -1), ...river.vertexPath],
      sectors: prependRiverPathSector(river, path, fullness, assignedRegionId)
    });
}

function getUnhandledIncomingConnectionsForRegion(
  region: Region,
  rivers: River[],
  riverGraph: RiverGraph
): Array<{ endpoint: RiverEndpointTouch; river: River; fullness: RiverFullness }> {
  return findRiverEndpointsTouchingRegion(region, rivers, riverGraph)
    .filter((endpoint) => endpoint.endpointType === 'end')
    .map((endpoint) => {
      const river = rivers.find((item) => item.id === endpoint.riverId);
      if (!river) return null;
      const currentEndVertex = river.vertexPath[river.vertexPath.length - 1];
      if (currentEndVertex?.key !== endpoint.vertex.key) return null;
      const endpointAlreadyExtendedInRegion = (river.sectors ?? []).some((sector) => (
        sector.assignedRegionId === region.id
        && sector.endVertexKey === endpoint.vertex.key
      ));
      if (endpointAlreadyExtendedInRegion) return null;
      return {
        endpoint,
        river,
        fullness: getRiverFullnessAtVertex(river, endpoint.vertex.key)
      };
    })
    .filter((connection): connection is { endpoint: RiverEndpointTouch; river: River; fullness: RiverFullness } => connection !== null)
    .sort((a, b) => b.fullness - a.fullness || a.river.id - b.river.id);
}

function appendIncomingRiverConnection(
  rivers: River[],
  endpoint: RiverEndpointTouch,
  path: RiverVertex[],
  assignedRegionId: number
): River[] {
  return rivers.map((river) => river.id !== endpoint.riverId
    ? river
    : {
      ...river,
      vertexPath: [...river.vertexPath, ...path.slice(1)],
      sectors: appendRiverPathSector(river, path, getRiverDownstreamFullness(river), assignedRegionId)
    });
}

function getBestIncomingPathToCandidate(
  endpoint: RiverEndpointTouch,
  candidateVertices: RiverVertex[],
  riverGraph: RiverGraph,
  usedRiverEdges: Set<string>,
  occupiedVertexKeys: Set<string>
): RiverVertex[] | null {
  const targetVertices = candidateVertices.filter((vertex) => (
    vertex.key !== endpoint.vertex.key
    && !occupiedVertexKeys.has(vertex.key)
    && riverGraph.nodes.has(vertex.key)
  ));
  return findBestFreeRiverPathToAnyTarget(
    endpoint.vertex,
    targetVertices,
    riverGraph,
    usedRiverEdges,
    new Set(),
    occupiedVertexKeys,
    new Set([endpoint.vertex.key])
  );
}

function getBestIncomingPathToRiverTributary(
  endpoint: RiverEndpointTouch,
  rivers: River[],
  riverGraph: RiverGraph,
  usedRiverEdges: Set<string>,
  occupiedVertexKeys: Set<string>
): RiverVertex[] | null {
  const targetVerticesByKey = new Map<string, RiverVertex>();

  for (const targetRiver of rivers) {
    if (targetRiver.id === endpoint.riverId) continue;
    if (wouldCreateRiverDrainageCycle(rivers, endpoint.riverId, targetRiver.id)) continue;

    for (const vertex of targetRiver.vertexPath.slice(1, -1)) {
      if (!riverGraph.nodes.has(vertex.key)) continue;
      if (vertex.key === endpoint.vertex.key) continue;
      targetVerticesByKey.set(vertex.key, vertex);
    }
  }

  const targetVertices = Array.from(targetVerticesByKey.values());
  return findBestFreeRiverPathToAnyTarget(
    endpoint.vertex,
    targetVertices,
    riverGraph,
    usedRiverEdges,
    new Set(),
    occupiedVertexKeys,
    new Set([endpoint.vertex.key, ...targetVertices.map((vertex) => vertex.key)])
  );
}

function getBestIncomingPathToLake(
  endpoint: RiverEndpointTouch,
  region: Region,
  terrainMap: Map<string, HexTerrainData>,
  rivers: River[],
  riverGraph: RiverGraph,
  usedRiverEdges: Set<string>,
  occupiedVertexKeys: Set<string>
): RiverVertex[] | null {
  const lakes = getLakesForRegion(region, terrainMap)
    .map((lake) => ({ lake, hasRiverConnection: lakeHasRiverConnection(lake.hexes, rivers) }))
    .sort((a, b) => Number(a.hasRiverConnection) - Number(b.hasRiverConnection) || a.lake.lakeId - b.lake.lakeId);

  let bestPath: RiverVertex[] | null = null;
  for (const { lake } of lakes) {
    const lakeVertices = getRegionExteriorVertices(lake.hexes)
      .filter((vertex) => vertex.key !== endpoint.vertex.key && riverGraph.nodes.has(vertex.key));
    const path = findBestFreeRiverPathToAnyTarget(
      endpoint.vertex,
      lakeVertices,
      riverGraph,
      usedRiverEdges,
      new Set(),
      occupiedVertexKeys,
      new Set([endpoint.vertex.key, ...lakeVertices.map((vertex) => vertex.key)])
    );
    if (path && (!bestPath || path.length < bestPath.length)) bestPath = path;
  }

  return bestPath;
}

function connectRemainingIncomingRiversForRegion(
  region: Region,
  terrainMap: Map<string, HexTerrainData>,
  riverGraph: RiverGraph,
  rivers: River[],
  candidateVertices: RiverVertex[]
): River[] {
  let nextRivers = rivers;

  for (const initialConnection of getUnhandledIncomingConnectionsForRegion(region, nextRivers, riverGraph)) {
    const currentConnection = getUnhandledIncomingConnectionsForRegion(region, nextRivers, riverGraph)
      .find((connection) => connection.river.id === initialConnection.river.id);
    if (!currentConnection) continue;

    const usedRiverEdges = buildUsedRiverEdges(nextRivers);
    const occupiedVertexKeys = new Set(nextRivers.flatMap((river) => river.vertexPath.map((vertex) => vertex.key)));
    const candidatePath = getBestIncomingPathToCandidate(
      currentConnection.endpoint,
      candidateVertices,
      riverGraph,
      usedRiverEdges,
      occupiedVertexKeys
    );
    const tributaryPath = candidatePath ? null : getBestIncomingPathToRiverTributary(
      currentConnection.endpoint,
      nextRivers,
      riverGraph,
      usedRiverEdges,
      occupiedVertexKeys
    );
    const lakePath = candidatePath || tributaryPath ? null : getBestIncomingPathToLake(
      currentConnection.endpoint,
      region,
      terrainMap,
      nextRivers,
      riverGraph,
      usedRiverEdges,
      occupiedVertexKeys
    );
    const selectedPath = candidatePath ?? tributaryPath ?? lakePath;
    const selectedMode = candidatePath ? 'candidate' : tributaryPath ? 'tributary' : lakePath ? 'lake' : null;

    if (!selectedPath) {
      console.warn('Could not connect remaining incoming river', {
        regionId: region.id,
        incomingRiverId: currentConnection.river.id,
        fullness: currentConnection.fullness,
        candidateTargetCount: candidateVertices.length,
        lakeCount: getLakesForRegion(region, terrainMap).length,
      });
      continue;
    }

    nextRivers = appendIncomingRiverConnection(
      nextRivers,
      currentConnection.endpoint,
      selectedPath,
      region.id
    );

    for (const river of nextRivers) {
      validateRiverDirection(river);
      validateRiverContinuity(river);
    }
    validateNoDuplicateRiverEdges(nextRivers);

    console.log('Connected remaining incoming river', {
      regionId: region.id,
      incomingRiverId: currentConnection.river.id,
      fullness: currentConnection.fullness,
      mode: selectedMode,
      pathLength: selectedPath.length,
    });
  }

  return nextRivers;
}

function connectRemainingOutgoingRiversForRegion(
  region: Region,
  regions: Region[],
  terrainMap: Map<string, HexTerrainData>,
  riverGraph: RiverGraph,
  rivers: River[],
  candidateHexes: AxialHex[],
  candidateVertices: RiverVertex[],
  neighborRegionVertices: RiverVertex[]
): River[] {
  let nextRivers = rivers;
  const usedLakeIds = new Set<number>();
  const skippedRiverIds = new Set<number>();

  while (true) {
    const remainingOutgoingConnections = getRemainingOutgoingConnectionsForRegion(region, regions, nextRivers, riverGraph)
      .filter((connection) => !skippedRiverIds.has(connection.river.id));
    if (remainingOutgoingConnections.length === 0) break;

    const connection = remainingOutgoingConnections[0];
    const usedRiverEdges = buildUsedRiverEdges(nextRivers);
    const existingRiverVertexKeys = new Set(nextRivers.flatMap((river) => river.vertexPath.map((vertex) => vertex.key)));
    const availableLakes = getAvailableUnconnectedLakesForRegion(region, terrainMap, nextRivers, usedLakeIds);
    let selectedPath: RiverVertex[] | null = null;
    let selectedLake: Lake | null = null;

    for (const lake of availableLakes) {
      const lakePath = findBestPathFromLakeToOutgoingEndpoint(
        lake.vertices,
        connection.endpoint,
        riverGraph,
        usedRiverEdges,
        existingRiverVertexKeys
      );
      if (lakePath && (!selectedPath || lakePath.length < selectedPath.length)) {
        selectedPath = lakePath;
        selectedLake = lake;
      }
    }

    if (!selectedPath) {
      const interiorSourceVertices = getMountainInteriorSourceVertices(
        region,
        regions,
        candidateHexes,
        riverGraph,
        candidateVertices,
        neighborRegionVertices
      ).filter((vertex) => !existingRiverVertexKeys.has(vertex.key));
      selectedPath = findBestPathFromSourceToOutgoingEndpoint(
        interiorSourceVertices,
        connection.endpoint,
        riverGraph,
        usedRiverEdges,
        {
          occupiedVertexKeys: existingRiverVertexKeys,
          allowedOccupiedVertexKeys: new Set([connection.endpoint.vertex.key])
        }
      );
    }

    if (!selectedPath) {
      console.warn('Could not connect remaining outgoing river', {
        regionId: region.id,
        outgoingRiverId: connection.river.id,
        downstreamRegionId: connection.downstreamRegion.id,
        availableLakeCount: availableLakes.length,
      });
      skippedRiverIds.add(connection.river.id);
      continue;
    }

    const pathEdgeKeys = getRiverPathEdgeKeys(selectedPath, riverGraph);
    if (!pathEdgeKeys || pathEdgeKeys.some((pathEdgeKey) => usedRiverEdges.has(pathEdgeKey))) {
      console.warn('Remaining outgoing river connector failed edge validation', {
        regionId: region.id,
        outgoingRiverId: connection.river.id,
      });
      skippedRiverIds.add(connection.river.id);
      continue;
    }

    if (selectedLake) usedLakeIds.add(selectedLake.lakeId);
    const connectorFullness = getOutgoingInteriorConnectorFullness(
      connection.river,
      connection.endpoint.vertex.key,
      Boolean(selectedLake)
    );
    nextRivers = prependOutgoingRiverConnection(
      nextRivers,
      connection,
      selectedPath,
      connectorFullness,
      region.id
    );

    for (const river of nextRivers) {
      validateRiverDirection(river);
      validateRiverContinuity(river);
    }
    validateNoDuplicateRiverEdges(nextRivers);

    console.log('Connected remaining outgoing river', {
      regionId: region.id,
      outgoingRiverId: connection.river.id,
      downstreamRegionId: connection.downstreamRegion.id,
      mode: selectedLake ? 'lake_to_outgoing' : 'interior_source_to_outgoing',
      lakeId: selectedLake?.lakeId ?? null,
      connectorFullness,
    });
  }

  return nextRivers;
}

function finalizeRiverGenerationForRegion(
  region: Region,
  regions: Region[],
  terrainMap: Map<string, HexTerrainData>,
  riverGraph: RiverGraph,
  rivers: River[],
  candidateHexes: AxialHex[],
  candidateVertices: RiverVertex[],
  neighborRegionVertices: RiverVertex[]
): RiverGenerationResult {
  const riversAfterExistingLogic = tryAddSmallTributaryRiver(region, terrainMap, riverGraph, rivers, candidateHexes);
  const riversWithMinimumMountainRivers = ensureMinimumMountainRiversForRegion(
    region,
    regions,
    riversAfterExistingLogic,
    riverGraph,
    candidateHexes,
    candidateVertices,
    neighborRegionVertices
  );
  const riversWithRemainingIncomingConnected = connectRemainingIncomingRiversForRegion(
    region,
    terrainMap,
    riverGraph,
    riversWithMinimumMountainRivers,
    candidateVertices
  );
  const riversWithRemainingOutgoingConnected = connectRemainingOutgoingRiversForRegion(
    region,
    regions,
    terrainMap,
    riverGraph,
    riversWithRemainingIncomingConnected,
    candidateHexes,
    candidateVertices,
    neighborRegionVertices
  );

  return { success: true, rivers: riversWithRemainingOutgoingConnected };
}

function generateRiverForRegion(
  region: Region,
  regions: Region[],
  existingRivers: River[],
  candidateHexes?: AxialHex[],
  hexTerrainByKey?: Map<string, HexTerrainData>
): RiverGenerationResult {
  try {
    const riverGraph = buildRiverGraphForRegion(region.hexes, region.hexes, candidateHexes ?? []);
    const { candidateVertices, neighborRegionVertices } = getRegionSharedVertices(region, regions, candidateHexes ?? []);
    const orangeKeys = new Set(neighborRegionVertices.map((vertex) => vertex.key));
    const redVertices = candidateVertices.filter((vertex) => !orangeKeys.has(vertex.key));
    const purpleVertices = region.centerHex ? getHexCornerPoints(region.centerHex) : [];
    const existingRiverEndpointVerticesInRegion = getExistingRiverEndpointVerticesInRegion(region, existingRivers, riverGraph);
    const usedRiverEdges = buildUsedRiverEdges(existingRivers);
    const existingRiverVertexKeys = new Set(existingRivers.flatMap((river) => river.vertexPath.map((vertex) => vertex.key)));
    const touchingEndpoints = findRiverEndpointsTouchingRegion(region, existingRivers, riverGraph);
    const incomingEndpoints = touchingEndpoints.filter((endpoint) => endpoint.endpointType === 'end');
    const outgoingEndpoints = touchingEndpoints.filter((endpoint) => endpoint.endpointType === 'start');
    const terrainMap = hexTerrainByKey ?? new Map<string, HexTerrainData>();

    const buildMountainIncomingBoundaryFallback = (
      incomingEndpoint: RiverEndpointTouch,
      fallbackReason: string
    ): RiverGenerationResult | null => {
      const endpointPath = findBestFreeRiverPathFromEndpoints(
        [incomingEndpoint.vertex],
        redVertices,
        purpleVertices,
        riverGraph,
        new Set(usedRiverEdges),
        region.centerHex,
        existingRiverVertexKeys
      );

      if (!endpointPath) {
        console.warn('Mountain incoming fallback failed: no boundary path', {
          regionId: region.id,
          incomingRiverId: incomingEndpoint.riverId,
          fallbackReason,
        });
        return null;
      }

      const { controlPoints, path } = endpointPath;
      if (!validateRiverPathViaControlPoints(
        path,
        controlPoints,
        riverGraph,
        redVertices,
        [incomingEndpoint.vertex],
        usedRiverEdges,
        existingRiverVertexKeys,
        new Set([incomingEndpoint.vertex.key])
      )) {
        console.warn('Mountain incoming fallback failed: boundary path validation failed', {
          regionId: region.id,
          incomingRiverId: incomingEndpoint.riverId,
          fallbackReason,
        });
        return null;
      }
      if (!riverPathTouchesCenterHex(path, region.centerHex, riverGraph)) {
        console.warn('Mountain incoming fallback failed: boundary path does not touch center', {
          regionId: region.id,
          incomingRiverId: incomingEndpoint.riverId,
          fallbackReason,
        });
        return null;
      }

      const nextRivers = existingRivers.map((river) => {
        if (river.id !== incomingEndpoint.riverId) return river;
        return {
          ...river,
          vertexPath: [...river.vertexPath, ...path.slice(1)],
          sectors: appendRiverPathSector(river, path, getRiverDownstreamFullness(river), region.id)
        };
      });

      for (const river of nextRivers) {
        validateRiverDirection(river);
        validateRiverContinuity(river);
      }
      validateNoDuplicateRiverEdges(nextRivers);

      console.log('Mountain incoming fallback: incoming river extended to boundary; outgoing rivers will be connected separately', {
        regionId: region.id,
        incomingRiverId: incomingEndpoint.riverId,
        fallbackReason,
      });
      return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, nextRivers, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
    };

    if (region.heightLevel === 3 && outgoingEndpoints.length > 0) {
      const sortedOutgoingEndpoints = [...outgoingEndpoints].sort((a, b) => a.riverId - b.riverId);
      const sortedIncomingEndpointsForMain = [...incomingEndpoints].sort((a, b) => a.riverId - b.riverId);
      const mainIncomingEndpoint = sortedIncomingEndpointsForMain[0];
      const mainOutgoingEndpoint = mainIncomingEndpoint
        ? sortedOutgoingEndpoints.find((endpoint) => !wouldCreateRiverDrainageCycle(existingRivers, mainIncomingEndpoint.riverId, endpoint.riverId))
        : sortedOutgoingEndpoints[0];
      if (!mainOutgoingEndpoint) {
        const fallbackResult = mainIncomingEndpoint
          ? buildMountainIncomingBoundaryFallback(mainIncomingEndpoint, 'mountain_main_outgoing_would_create_cycle')
          : null;
        return fallbackResult ?? { success: false, rivers: existingRivers, reason: 'mountain_main_outgoing_would_create_cycle' };
      }
      const secondaryOutgoingEndpoints = sortedOutgoingEndpoints.filter((endpoint) => endpoint.riverId !== mainOutgoingEndpoint.riverId);
      let nextRivers = existingRivers;
      const blockedEdgeKeys = new Set(usedRiverEdges);
      const usedLakeIds = new Set<number>();
      const interiorSourceVertices = getMountainInteriorSourceVertices(region, regions, candidateHexes ?? [], riverGraph, candidateVertices, neighborRegionVertices);

      console.log('Mountain region with outgoing rivers', {
        regionId: region.id,
        incomingRiverIds: incomingEndpoints.map((endpoint) => endpoint.riverId),
        outgoingRiverIds: sortedOutgoingEndpoints.map((endpoint) => endpoint.riverId),
        mainOutgoingRiverId: mainOutgoingEndpoint.riverId,
      });
      console.log('Connecting main mountain outgoing river', {
        regionId: region.id,
        mainOutgoingRiverId: mainOutgoingEndpoint.riverId,
        mode: incomingEndpoints.length > 0 ? 'incoming_to_outgoing' : 'interior_source_to_outgoing_through_center',
      });

      if (incomingEndpoints.length > 0) {
        if (!mainIncomingEndpoint) return { success: false, rivers: existingRivers, reason: 'mountain_main_incoming_not_found' };
        const connectorPath = buildRiverPathViaControlPoints(
          { startVertex: mainIncomingEndpoint.vertex, endVertex: mainOutgoingEndpoint.vertex },
          riverGraph,
          blockedEdgeKeys
        );
        const connectorEdgeKeys = getRiverPathEdgeKeys(connectorPath, riverGraph);
        if (
          connectorPath.length < 2
          || connectorPath[0].key !== mainIncomingEndpoint.vertex.key
          || connectorPath[connectorPath.length - 1].key !== mainOutgoingEndpoint.vertex.key
          || !connectorEdgeKeys
          || connectorEdgeKeys.some((pathEdgeKey) => blockedEdgeKeys.has(pathEdgeKey))
          || !riverPathAvoidsOccupiedVertices(connectorPath, existingRiverVertexKeys, new Set([mainIncomingEndpoint.vertex.key, mainOutgoingEndpoint.vertex.key]))
        ) {
          const fallbackResult = buildMountainIncomingBoundaryFallback(mainIncomingEndpoint, 'mountain_main_outgoing_connector_not_found');
          return fallbackResult ?? { success: false, rivers: existingRivers, reason: 'mountain_main_outgoing_connector_not_found' };
        }
        const connectorSplit = buildConnectorSplitForFullnessDrop(
          existingRivers,
          mainIncomingEndpoint.riverId,
          mainIncomingEndpoint.vertex,
          mainOutgoingEndpoint.riverId,
          mainOutgoingEndpoint.vertex,
          connectorPath
        );
        if (connectorSplit === null) {
          const fallbackResult = buildMountainIncomingBoundaryFallback(mainIncomingEndpoint, 'mountain_main_outgoing_fullness_drop_split_not_found');
          return fallbackResult ?? { success: false, rivers: existingRivers, reason: 'mountain_main_outgoing_fullness_drop_split_not_found' };
        }
        const merged = mergeRiversWithConnector(nextRivers, mainIncomingEndpoint.riverId, mainOutgoingEndpoint.riverId, connectorPath, undefined, region.id, connectorSplit);
        if (!merged) {
          const fallbackResult = buildMountainIncomingBoundaryFallback(mainIncomingEndpoint, 'mountain_main_outgoing_merge_failed');
          return fallbackResult ?? { success: false, rivers: existingRivers, reason: 'mountain_main_outgoing_merge_failed' };
        }
        const tributaryIncomingEndpoints = incomingEndpoints
          .filter((endpoint) => endpoint.riverId !== mainIncomingEndpoint.riverId);
        const mergedWithTributaries = connectIncomingTributariesToMainPath(
          region,
          merged,
          tributaryIncomingEndpoints,
          connectorPath,
          riverGraph,
          new Set([...blockedEdgeKeys, ...connectorEdgeKeys]),
          existingRiverVertexKeys
        );
        if (!mergedWithTributaries) {
          const fallbackResult = buildMountainIncomingBoundaryFallback(mainIncomingEndpoint, 'mountain_incoming_tributary_to_through_river_not_found');
          return fallbackResult ?? { success: false, rivers: existingRivers, reason: 'mountain_incoming_tributary_to_through_river_not_found' };
        }
        addConnectorSplitLakeIfNeeded(region, terrainMap, connectorSplit);
        nextRivers = mergedWithTributaries;
        for (const edgeKey of connectorEdgeKeys) blockedEdgeKeys.add(edgeKey);
      } else {
        const mainPath = findBestPathFromSourceToOutgoingEndpoint(interiorSourceVertices, mainOutgoingEndpoint, riverGraph, blockedEdgeKeys, {
          requireCenterHexVertex: region.centerHex,
          occupiedVertexKeys: existingRiverVertexKeys,
          allowedOccupiedVertexKeys: new Set([mainOutgoingEndpoint.vertex.key])
        });
        if (!mainPath) return { success: false, rivers: existingRivers, reason: 'mountain_main_outgoing_source_path_not_found' };
        nextRivers = nextRivers.map((river) => river.id !== mainOutgoingEndpoint.riverId
          ? river
          : { ...river, vertexPath: [...mainPath.slice(0, -1), ...river.vertexPath], sectors: prependRiverPathSector(river, mainPath, chooseRiverFullnessFromAdjacentSectors(mainPath, existingRivers, getNewRiverFullnessForHeight(region.heightLevel)), region.id) });
        const mainPathEdgeKeys = getRiverPathEdgeKeys(mainPath, riverGraph);
        if (!mainPathEdgeKeys) return { success: false, rivers: existingRivers, reason: 'mountain_main_outgoing_edge_keys_not_found' };
        for (const edgeKey of mainPathEdgeKeys) blockedEdgeKeys.add(edgeKey);
      }

      for (const outgoingEndpoint of secondaryOutgoingEndpoints) {
        const lakes = getLakesForRegion(region, terrainMap);
        const availableLakes = lakes.filter((lake) => !usedLakeIds.has(lake.lakeId));
        let selectedLake: { lakeId: number; hexes: AxialHex[]; vertices: RiverVertex[] } | null = null;
        let selectedPath: RiverVertex[] | null = null;
        for (const lake of availableLakes) {
          const lakePath = findBestPathFromLakeToOutgoingEndpoint(lake.vertices, outgoingEndpoint, riverGraph, blockedEdgeKeys, existingRiverVertexKeys);
          if (lakePath && (!selectedPath || lakePath.length < selectedPath.length)) {
            selectedLake = lake;
            selectedPath = lakePath;
          }
        }
        if (!selectedPath) {
          selectedPath = findBestPathFromSourceToOutgoingEndpoint(interiorSourceVertices, outgoingEndpoint, riverGraph, blockedEdgeKeys, {
            occupiedVertexKeys: existingRiverVertexKeys,
            allowedOccupiedVertexKeys: new Set([outgoingEndpoint.vertex.key])
          });
        } else if (selectedLake) {
          usedLakeIds.add(selectedLake.lakeId);
        }
        if (!selectedPath) {
          console.warn('Could not eagerly connect secondary mountain outgoing river; deferring to final outgoing connector pass', {
            regionId: region.id,
            outgoingRiverId: outgoingEndpoint.riverId,
          });
          continue;
        }
        const pathEdgeKeys = getRiverPathEdgeKeys(selectedPath, riverGraph);
        if (!pathEdgeKeys) {
          console.warn('Secondary mountain outgoing river has invalid edge keys; deferring to final outgoing connector pass', {
            regionId: region.id,
            outgoingRiverId: outgoingEndpoint.riverId,
          });
          continue;
        }
        nextRivers = nextRivers.map((river) => river.id !== outgoingEndpoint.riverId
          ? river
          : { ...river, vertexPath: [...selectedPath.slice(0, -1), ...river.vertexPath], sectors: prependRiverPathSector(river, selectedPath, chooseRiverFullnessFromAdjacentSectors(selectedPath, existingRivers, getNewRiverFullnessForHeight(region.heightLevel)), region.id) });
        for (const edgeKey of pathEdgeKeys) blockedEdgeKeys.add(edgeKey);
        console.log('Connecting secondary mountain outgoing river', {
          regionId: region.id,
          outgoingRiverId: outgoingEndpoint.riverId,
          mode: selectedLake ? 'lake_to_outgoing' : 'interior_source_to_outgoing',
          lakeId: selectedLake?.lakeId ?? null,
        });
      }

      for (const river of nextRivers) {
        validateRiverDirection(river);
        validateRiverContinuity(river);
      }
      validateNoDuplicateRiverEdges(nextRivers);
      return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, nextRivers, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
    }

    if (incomingEndpoints.length >= 2 && outgoingEndpoints.length === 0) {
      const sortedIncomingEndpoints = [...incomingEndpoints].sort((a, b) => a.riverId - b.riverId);
      const mainIncomingEndpoint = sortedIncomingEndpoints[0];
      const tributaryIncomingEndpoints = sortedIncomingEndpoints.slice(1);
      const blockedEdgeKeys = new Set(usedRiverEdges);

      console.log('Multiple incoming rivers: building main river and tributaries', {
        regionId: region.id,
        incomingRiverIds: sortedIncomingEndpoints.map((endpoint) => endpoint.riverId),
        mainRiverId: mainIncomingEndpoint.riverId,
        tributaryRiverIds: tributaryIncomingEndpoints.map((endpoint) => endpoint.riverId),
      });

      const mainEndpointPath = findBestFreeRiverPathFromEndpoints(
        [mainIncomingEndpoint.vertex],
        redVertices,
        purpleVertices,
        riverGraph,
        blockedEdgeKeys,
        region.centerHex,
        existingRiverVertexKeys
      );
      if (!mainEndpointPath) return { success: false, rivers: existingRivers, reason: 'main_incoming_river_path_not_found' };
      const { controlPoints: mainControlPoints, path: mainPath } = mainEndpointPath;
      if (!validateRiverPathViaControlPoints(
        mainPath,
        mainControlPoints,
        riverGraph,
        redVertices,
        [mainIncomingEndpoint.vertex],
        blockedEdgeKeys,
        existingRiverVertexKeys,
        new Set([mainIncomingEndpoint.vertex.key])
      )) {
        return { success: false, rivers: existingRivers, reason: 'main_incoming_river_validation_failed' };
      }
      if (!riverPathTouchesCenterHex(mainPath, region.centerHex, riverGraph)) {
        return { success: false, rivers: existingRivers, reason: 'main_incoming_river_does_not_touch_center_hex' };
      }

      const mainRiver = existingRivers.find((river) => river.id === mainIncomingEndpoint.riverId);
      if (!mainRiver) return { success: false, rivers: existingRivers, reason: 'main_incoming_river_not_found' };

      const mainPathEdgeKeys = getRiverPathEdgeKeys(mainPath, riverGraph);
      if (!mainPathEdgeKeys) return { success: false, rivers: existingRivers, reason: 'main_incoming_river_edge_keys_not_found' };
      for (const edgeKey of mainPathEdgeKeys) blockedEdgeKeys.add(edgeKey);

      const mainBuiltPath = mainEndpointPath.path;
      const tributaryTargetVertices = mainBuiltPath.slice(1, -1);

      console.log('Tributary target vertices for main river', {
        regionId: region.id,
        mainRiverId: mainIncomingEndpoint.riverId,
        mainBuiltPathLength: mainBuiltPath.length,
        tributaryTargetVerticesCount: tributaryTargetVertices.length,
        excludedStartVertex: mainBuiltPath[0]?.key,
        excludedEndVertex: mainBuiltPath[mainBuiltPath.length - 1]?.key,
      });

      if (tributaryTargetVertices.length === 0) {
        console.warn('Main river has no internal vertices for tributary connection', {
          regionId: region.id,
          mainRiverId: mainIncomingEndpoint.riverId,
          mainBuiltPathLength: mainBuiltPath.length,
        });
        return {
          success: false,
          rivers: existingRivers,
          reason: 'main_river_has_no_internal_vertices_for_tributaries',
        };
      }

      const excludedTributaryTargetVertexKeys = new Set<string>([
        mainBuiltPath[0]?.key,
        mainBuiltPath[mainBuiltPath.length - 1]?.key,
      ].filter((key): key is string => Boolean(key)));

      const tributaryPathByRiverId = new Map<number, RiverVertex[]>();
      for (const endpoint of tributaryIncomingEndpoints) {
        const tributaryPath = findBestFreeRiverPathToAnyTarget(
          endpoint.vertex,
          tributaryTargetVertices,
          riverGraph,
          blockedEdgeKeys,
          excludedTributaryTargetVertexKeys,
          existingRiverVertexKeys,
          new Set([endpoint.vertex.key])
        );
        if (!tributaryPath) {
          console.warn('Could not connect tributary to main river', {
            regionId: region.id,
            tributaryRiverId: endpoint.riverId,
            mainRiverId: mainIncomingEndpoint.riverId,
          });
          return { success: false, rivers: existingRivers, reason: 'tributary_path_not_found' };
        }
        const tributaryPathEdgeKeys = getRiverPathEdgeKeys(tributaryPath, riverGraph);
        if (!tributaryPathEdgeKeys) return { success: false, rivers: existingRivers, reason: 'tributary_edge_keys_not_found' };
        for (const edgeKey of tributaryPathEdgeKeys) blockedEdgeKeys.add(edgeKey);
        tributaryPathByRiverId.set(endpoint.riverId, tributaryPath);
      }

      const nextRivers = existingRivers.map((river) => {
        if (river.id === mainIncomingEndpoint.riverId) {
          return { ...river, vertexPath: [...river.vertexPath, ...mainPath.slice(1)], sectors: appendRiverPathSector(river, mainPath, getRiverDownstreamFullness(river), region.id) };
        }
        const tributaryPath = tributaryPathByRiverId.get(river.id);
        if (tributaryPath) {
          return { ...river, vertexPath: [...river.vertexPath, ...tributaryPath.slice(1)], sectors: appendRiverPathSector(river, tributaryPath, getRiverDownstreamFullness(river), region.id) };
        }
        return river;
      });

      for (const river of nextRivers) {
        validateRiverDirection(river);
        validateRiverContinuity(river);
      }
      validateNoDuplicateRiverEdges(nextRivers);
      return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, nextRivers, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
    }

    if (touchingEndpoints.length >= 2) {
      const candidatePairs = touchingEndpoints.flatMap((left) => touchingEndpoints
        .filter((right) => right.riverId !== left.riverId)
        .map((right) => ({ left, right })))
        .filter(({ left, right }) => left.endpointType === 'end' && right.endpointType === 'start');

      if (candidatePairs.length > 0) {
        const validConnectors = candidatePairs
          .filter((pair) => !wouldCreateRiverDrainageCycle(existingRivers, pair.left.riverId, pair.right.riverId))
          .map((pair) => {
            const connectorPath = buildRiverPathViaControlPoints(
              { startVertex: pair.left.vertex, endVertex: pair.right.vertex },
              riverGraph,
              usedRiverEdges
            );
            if (connectorPath.length < 2) return null;
            if (connectorPath[0].key !== pair.left.vertex.key || connectorPath[connectorPath.length - 1].key !== pair.right.vertex.key) return null;
            const connectorEdgeKeys = getRiverPathEdgeKeys(connectorPath, riverGraph);
            if (!connectorEdgeKeys) return null;
            if (connectorEdgeKeys.some((pathEdgeKey) => usedRiverEdges.has(pathEdgeKey))) return null;
            if (!riverPathAvoidsOccupiedVertices(connectorPath, existingRiverVertexKeys, new Set([pair.left.vertex.key, pair.right.vertex.key]))) return null;
            const connectorSplit = buildConnectorSplitForFullnessDrop(
              existingRivers,
              pair.left.riverId,
              pair.left.vertex,
              pair.right.riverId,
              pair.right.vertex,
              connectorPath
            );
            if (connectorSplit === null) return null;
            return { pair, connectorPath, connectorSplit };
          })
          .filter((candidate): candidate is { pair: { left: RiverEndpointTouch; right: RiverEndpointTouch }; connectorPath: RiverVertex[]; connectorSplit?: RiverConnectorSplit } => candidate !== null)
          .sort((a, b) => a.connectorPath.length - b.connectorPath.length);

        const bestConnector = validConnectors[0];
        if (bestConnector) {
          const merged = mergeRiversWithConnector(
            existingRivers,
            bestConnector.pair.left.riverId,
            bestConnector.pair.right.riverId,
            bestConnector.connectorPath,
            undefined,
            region.id,
            bestConnector.connectorSplit
          );
          if (merged) {
            const connectorEdgeKeys = getRiverPathEdgeKeys(bestConnector.connectorPath, riverGraph);
            const blockedEdgeKeysWithConnector = new Set(usedRiverEdges);
            for (const edgeKey of connectorEdgeKeys ?? []) blockedEdgeKeysWithConnector.add(edgeKey);
            const tributaryIncomingEndpoints = incomingEndpoints
              .filter((endpoint) => endpoint.riverId !== bestConnector.pair.left.riverId);
            const mergedWithTributaries = connectIncomingTributariesToMainPath(
              region,
              merged,
              tributaryIncomingEndpoints,
              bestConnector.connectorPath,
              riverGraph,
              blockedEdgeKeysWithConnector,
              existingRiverVertexKeys
            );
            if (!mergedWithTributaries) {
              return { success: false, rivers: existingRivers, reason: 'incoming_tributary_to_through_river_not_found' };
            }
            addConnectorSplitLakeIfNeeded(region, terrainMap, bestConnector.connectorSplit);
            for (const river of mergedWithTributaries) {
              validateRiverDirection(river);
              validateRiverContinuity(river);
            }
            validateNoDuplicateRiverEdges(mergedWithTributaries);
            return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, mergedWithTributaries, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
          }
        } else {
          console.warn('Could not connect river pair: no free connector path', {
            regionId: region.id,
            candidatePairs,
          });
        }
      } else {
        console.warn('Cannot merge rivers automatically: no valid end->start pair', { regionId: region.id, touchingEndpoints });
      }
    }

    void outgoingEndpoints;

    if (existingRiverEndpointVerticesInRegion.length > 0 && redVertices.length < 1) return { success: false, rivers: existingRivers, reason: 'no_red_vertices_for_extension' };
    if (existingRiverEndpointVerticesInRegion.length === 0 && redVertices.length < 2) {
      return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, existingRivers, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
    }
    if (existingRiverEndpointVerticesInRegion.length > 0) {
      const bestEndpointPath = findBestFreeRiverPathFromEndpoints(
        existingRiverEndpointVerticesInRegion,
        redVertices,
        purpleVertices,
        riverGraph,
        usedRiverEdges,
        region.centerHex,
        existingRiverVertexKeys
      );

      if (!bestEndpointPath) {
        console.warn('Could not extend river in region: no valid free path', {
          regionId: region.id,
          endpointCount: existingRiverEndpointVerticesInRegion.length,
          redVertexCount: redVertices.length,
          usedRiverEdgeCount: usedRiverEdges.size
        });
        return { success: false, rivers: existingRivers, reason: 'river_does_not_touch_center_hex' };
      }

      const { controlPoints, path } = bestEndpointPath;
      if (!validateRiverPathViaControlPoints(
        path,
        controlPoints,
        riverGraph,
        redVertices,
        existingRiverEndpointVerticesInRegion,
        usedRiverEdges,
        existingRiverVertexKeys,
        new Set([controlPoints.startVertex.key])
      )) {
        console.warn('Could not extend river in region: no valid free path', {
          regionId: region.id,
          endpointCount: existingRiverEndpointVerticesInRegion.length,
          redVertexCount: redVertices.length,
          usedRiverEdgeCount: usedRiverEdges.size
        });
        return { success: false, rivers: existingRivers, reason: 'endpoint_path_validation_failed' };
      }
      if (!riverPathTouchesCenterHex(path, region.centerHex, riverGraph)) {
        return { success: false, rivers: existingRivers, reason: 'river_does_not_touch_center_hex' };
      }

      const connection = findRiverConnectionByStartVertex(existingRivers, controlPoints.startVertex);
      if (!connection) return { success: false, rivers: existingRivers, reason: 'endpoint_connection_not_found' };

      const nextRivers = existingRivers.map((river) => {
        if (river.id !== connection.riverId) return river;
        if (connection.type === 'end') {
          return { ...river, vertexPath: [...river.vertexPath, ...path.slice(1)], sectors: appendRiverPathSector(river, path, getRiverDownstreamFullness(river), region.id) };
        }
        return { ...river, vertexPath: [...reverseRiverPath(path).slice(0, -1), ...river.vertexPath], sectors: prependRiverPathSector(river, reverseRiverPath(path), chooseRiverFullnessFromAdjacentSectors(reverseRiverPath(path), existingRivers, getNewRiverFullnessForHeight(region.heightLevel)), region.id) };
      });

      for (const river of nextRivers) validateRiverDirection(river);
      validateNoDuplicateRiverEdges(nextRivers);
      return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, nextRivers, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
    }

    if (region.heightLevel === 3) {
      const interiorStartVertices = getMountainInteriorSourceVertices(region, regions, candidateHexes ?? [], riverGraph, candidateVertices, neighborRegionVertices)
        .filter((vertex) => !existingRiverVertexKeys.has(vertex.key));
      const centerVertexKeys = new Set(getHexCornerPoints(region.centerHex).map((vertex) => vertex.key));
      const preferredStartVertices = interiorStartVertices.filter((vertex) => !centerVertexKeys.has(vertex.key));

      const findBestMountainSourcePath = (startVertices: RiverVertex[]) => {
        let bestPath: RiverVertex[] | null = null;
        let bestControlPoints: RiverControlPoints | null = null;
        for (const startVertex of startVertices) {
          for (const endVertex of redVertices) {
            if (startVertex.key === endVertex.key) continue;
            const controlPoints: RiverControlPoints = { startVertex, endVertex, startMode: 'red vertex', endMode: 'red vertex' };
            const path = buildRiverPathViaControlPoints(controlPoints, riverGraph, usedRiverEdges);
            if (!validateRiverPathViaControlPoints(
              path,
              controlPoints,
              riverGraph,
              redVertices,
              existingRiverEndpointVerticesInRegion,
              usedRiverEdges,
              existingRiverVertexKeys
            )) continue;
            if (!riverPathTouchesCenterHexVertex(path, region.centerHex)) continue;
            if (!bestPath || path.length < bestPath.length) {
              bestPath = path;
              bestControlPoints = controlPoints;
            }
          }
        }
        return { bestPath, bestControlPoints };
      };

      let { bestPath, bestControlPoints } = findBestMountainSourcePath(preferredStartVertices);
      let usedFallback = false;
      if (!bestPath || !bestControlPoints) {
        usedFallback = true;
        ({ bestPath, bestControlPoints } = findBestMountainSourcePath(interiorStartVertices));
      }

      console.log('mountain-source-branch:', {
        regionId: region.id,
        interiorStartVerticesLength: interiorStartVertices.length,
        preferredStartVerticesLength: preferredStartVertices.length,
        usedFallback,
        selectedStartVertexKey: bestControlPoints?.startVertex.key ?? null,
        selectedStartIsCenterHexVertex: bestControlPoints ? centerVertexKeys.has(bestControlPoints.startVertex.key) : null
      });

      if (!bestPath || !bestControlPoints) {
        return { success: false, rivers: existingRivers, reason: 'mountain_source_river_path_not_found' };
      }

      const newRiverId = (existingRivers[existingRivers.length - 1]?.id ?? 0) + 1;
      const river: River = {
        id: newRiverId,
        regionId: region.id,
        vertexPath: bestPath,
        sectors: createInitialRiverSectors(newRiverId, bestPath, chooseRiverFullnessFromAdjacentSectors(bestPath, existingRivers, getNewRiverFullnessForHeight(region.heightLevel)), {}, region.id),
        controlPoints: bestControlPoints
      };
      const nextRivers = [...existingRivers, river];
      for (const nextRiver of nextRivers) {
        validateRiverDirection(nextRiver);
        validateRiverContinuity(nextRiver);
      }
      validateNoDuplicateRiverEdges(nextRivers);
      return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, nextRivers, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
    }

    const RANDOM_PAIR_ATTEMPTS = 50;
    for (let attempt = 0; attempt < RANDOM_PAIR_ATTEMPTS; attempt += 1) {
      const controlPoints = chooseRandomRiverControlPoints(redVertices, purpleVertices, existingRiverEndpointVerticesInRegion);
      if (!controlPoints) continue;
      const path = buildRiverPathViaControlPoints(controlPoints, riverGraph, usedRiverEdges);
      if (!validateRiverPathViaControlPoints(path, controlPoints, riverGraph, redVertices, existingRiverEndpointVerticesInRegion, usedRiverEdges)) continue;
      if (!riverPathTouchesCenterHex(path, region.centerHex, riverGraph)) continue;

      const connection = controlPoints.startMode === 'existing river endpoint'
        ? findRiverConnectionByStartVertex(existingRivers, controlPoints.startVertex)
        : null;

      let nextRivers: River[];
      if (connection) {
        nextRivers = existingRivers.map((river) => {
          if (river.id !== connection.riverId) return river;
          const extensionPath = connection.type === 'start' ? reverseRiverPath(path) : path;
          const mergedPath = connection.type === 'start'
            ? [...extensionPath.slice(0, -1), ...river.vertexPath]
            : [...river.vertexPath, ...extensionPath.slice(1)];
          return { ...river, vertexPath: mergedPath, sectors: connection.type === 'start'
            ? prependRiverPathSector(river, extensionPath, chooseRiverFullnessFromAdjacentSectors(extensionPath, existingRivers, getNewRiverFullnessForHeight(region.heightLevel)), region.id)
            : appendRiverPathSector(river, extensionPath, getRiverDownstreamFullness(river), region.id) };
        });
      } else {
        const newRiverId = (existingRivers[existingRivers.length - 1]?.id ?? 0) + 1;
        const river: River = {
          id: newRiverId,
          regionId: region.id,
          vertexPath: path,
          sectors: createInitialRiverSectors(newRiverId, path, chooseRiverFullnessFromAdjacentSectors(path, existingRivers, getNewRiverFullnessForHeight(region.heightLevel)), {}, region.id),
          controlPoints
        };
        nextRivers = [...existingRivers, river];
      }

      for (const river of nextRivers) validateRiverDirection(river);
      validateNoDuplicateRiverEdges(nextRivers);
      return finalizeRiverGenerationForRegion(region, regions, terrainMap, riverGraph, nextRivers, candidateHexes ?? [], candidateVertices, neighborRegionVertices);
    }
  } catch (error) {
    console.warn('river generation failed', { regionId: region.id, error });
    return { success: false, rivers: existingRivers, reason: 'exception' };
  }

  return { success: false, rivers: existingRivers, reason: 'no_valid_random_path' };
}

function renderRiverSegments(river: River, offsetX: number, offsetY: number, lakeEdgeKeys: Set<string>) {
  const hexWidth = getHexWidth(HEX_SIZE);
  const fullnessByEdge = getRiverSectorFullnessByEdge(river);
  const fallbackFullness = getRiverFallbackFullness(river);
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; width: number }> = [];
  for (let i = 1; i < river.vertexPath.length; i += 1) {
    const start = river.vertexPath[i - 1];
    const end = river.vertexPath[i];
    const segmentEdgeKey = edgeKey(start, end);
    if (isLakeEdge(segmentEdgeKey, lakeEdgeKeys)) continue;
    segments.push({
      key: `river-segment-${river.id}-${i}`,
      x1: start.x + offsetX,
      y1: start.y + offsetY,
      x2: end.x + offsetX,
      y2: end.y + offsetY,
      width: getRiverWidth(hexWidth, fullnessByEdge.get(segmentEdgeKey) ?? fallbackFullness)
    });
  }
  return segments;
}

function renderRiverDirectionArrows(river: River, offsetX: number, offsetY: number, lakeEdgeKeys: Set<string>) {
  const fullnessByEdge = getRiverSectorFullnessByEdge(river);
  const fallbackFullness = getRiverFallbackFullness(river);
  const arrows: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; fullness: RiverFullness }> = [];
  for (let i = 1; i < river.vertexPath.length; i += 1) {
    const start = river.vertexPath[i - 1];
    const end = river.vertexPath[i];
    const segmentEdgeKey = edgeKey(start, end);
    if (isLakeEdge(segmentEdgeKey, lakeEdgeKeys)) continue;
    const fullness = fullnessByEdge.get(segmentEdgeKey) ?? fallbackFullness;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) continue;

    const ux = dx / length;
    const uy = dy / length;
    const arrowLength = Math.min(10 * getRiverArrowScale(fullness), length * 0.6);
    const halfArrow = arrowLength / 2;
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    arrows.push({
      key: `river-arrow-${river.id}-${i}`,
      x1: mx - ux * halfArrow + offsetX,
      y1: my - uy * halfArrow + offsetY,
      x2: mx + ux * halfArrow + offsetX,
      y2: my + uy * halfArrow + offsetY,
      fullness
    });
  }
  return arrows;
}

function validateRiverEndpoints(region: Region, river: River, riverGraph: RiverGraph): RiverEndpointIssue[] {
  const issues: RiverEndpointIssue[] = [];
  if (!river.vertexPath || river.vertexPath.length < 2) return ['path_too_short'];
  const start = riverGraph.nodes.get(river.vertexPath[0].key);
  const end = riverGraph.nodes.get(river.vertexPath[river.vertexPath.length - 1].key);
  const hasCandidateBoundary = Array.from(riverGraph.nodes.values()).some((node) => node.isCandidateBoundaryVertex);
  if (!start?.isRegionBoundaryVertex) issues.push('start_not_region_boundary');
  if (!end?.isRegionBoundaryVertex) issues.push('end_not_region_boundary');
  if (hasCandidateBoundary && !start?.isCandidateBoundaryVertex) issues.push('start_not_candidate_boundary_when_candidates_exist');
  if (hasCandidateBoundary && !end?.isCandidateBoundaryVertex) issues.push('end_not_candidate_boundary_when_candidates_exist');
  const firstEdge = riverGraph.edges.get(edgeKey(river.vertexPath[0], river.vertexPath[1]));
  const lastEdge = riverGraph.edges.get(edgeKey(river.vertexPath[river.vertexPath.length - 2], river.vertexPath[river.vertexPath.length - 1]));
  if (!firstEdge?.isRegionBoundaryEdge) issues.push('first_edge_not_boundary');
  if (!lastEdge?.isRegionBoundaryEdge) issues.push('last_edge_not_boundary');
  if (hasCandidateBoundary && !firstEdge?.isCandidateBoundaryEdge) issues.push('first_edge_not_candidate_boundary_when_candidates_exist');
  if (hasCandidateBoundary && !lastEdge?.isCandidateBoundaryEdge) issues.push('last_edge_not_candidate_boundary_when_candidates_exist');
  if (!firstEdge || !lastEdge) issues.push('segment_not_in_graph');
  for (let i = 1; i < river.vertexPath.length; i += 1) {
    if (!riverGraph.edges.has(edgeKey(river.vertexPath[i - 1], river.vertexPath[i]))) {
      issues.push('segment_not_in_graph');
      break;
    }
  }
  if (region.hexes.length > 6 && river.vertexPath.length < 4) issues.push('path_too_short');
  return Array.from(new Set(issues));
}

function getLakeChanceForBiome(biomeId: BiomeId): number {
  if (biomeId === 'semi_desert') return 0;
  if (biomeId === 'swamp' || biomeId === 'swamp_forest') return 0.04;
  return 0.02;
}
const LAKE_EXPANSION_CHANCE = 0.10;

function assignLakesForRegion(
  regionHexes: AxialHex[],
  centerHex: AxialHex,
  startingLakeId: number,
  biomeId: BiomeId
): { lakesByHex: Map<string, HexTerrainData>; nextLakeId: number } {
  const centerKey = hexKey(centerHex);
  const regionHexMap = new Map(regionHexes.map((hex) => [hexKey(hex), hex]));
  const selectedLakeKeys = new Set<string>();
  const lakeChance = getLakeChanceForBiome(biomeId);

  for (const hex of regionHexes) {
    const key = hexKey(hex);
    if (key === centerKey) continue;
    if (Math.random() < lakeChance) selectedLakeKeys.add(key);
  }

  const firstPassLakeKeys = new Set(selectedLakeKeys);
  for (const hex of regionHexes) {
    const key = hexKey(hex);
    if (key === centerKey) continue;
    if (selectedLakeKeys.has(key)) continue;

    const touchesFirstPassLake = getHexNeighbors(hex).some((neighbor) => firstPassLakeKeys.has(hexKey(neighbor)));
    if (!touchesFirstPassLake) continue;

    if (Math.random() < LAKE_EXPANSION_CHANCE) selectedLakeKeys.add(key);
  }

  const lakesByHex = new Map<string, HexTerrainData>();
  const visited = new Set<string>();
  let nextLakeId = startingLakeId;

  for (const lakeKey of selectedLakeKeys) {
    if (visited.has(lakeKey)) continue;
    const queue = [lakeKey];
    visited.add(lakeKey);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      lakesByHex.set(current, { terrainOverride: 'lake', lakeId: nextLakeId });
      const currentHex = regionHexMap.get(current);
      if (!currentHex) continue;

      for (const neighbor of getHexNeighbors(currentHex)) {
        const neighborKey = hexKey(neighbor);
        if (!selectedLakeKeys.has(neighborKey) || visited.has(neighborKey) || !regionHexMap.has(neighborKey)) continue;
        visited.add(neighborKey);
        queue.push(neighborKey);
      }
    }

    nextLakeId += 1;
  }

  console.log('Lakes generated for region', {
    biomeId,
    lakeChance,
    lakeExpansionChance: LAKE_EXPANSION_CHANCE,
    lakeHexCount: lakesByHex.size,
    lakeIds: Array.from(new Set(Array.from(lakesByHex.values()).map((terrain) => terrain.lakeId))).filter(Boolean)
  });

  return { lakesByHex, nextLakeId };
}

function assignPointsOfInterestForRegion(
  regionHexes: AxialHex[],
  centerHex: AxialHex,
  lakesByHex: Map<string, HexTerrainData>
): AxialHex[] {
  const centerKey = hexKey(centerHex);
  const eligibleHexes = regionHexes.filter((hex) => {
    const key = hexKey(hex);
    if (key === centerKey) return false;
    return lakesByHex.get(key)?.terrainOverride !== 'lake';
  });
  const lakeHexCount = regionHexes.length - 1 - eligibleHexes.length;
  const eligibleCount = regionHexes.length - 1 - lakeHexCount;
  if (eligibleCount <= 0) return [];

  const maxPoiCount = Math.floor(eligibleCount / 4);
  const minPoiCount = Math.floor(eligibleCount / 6);
  if (maxPoiCount < minPoiCount) return [];

  const poiCount = randomInt(minPoiCount, maxPoiCount);
  if (poiCount <= 0) return [];

  const shuffledEligibleHexes = shuffleArray(eligibleHexes);
  return shuffledEligibleHexes.slice(0, Math.min(poiCount, shuffledEligibleHexes.length));
}
function findRoadPathWithinRegion(options: {
  region: Region; from: AxialHex; targets: AxialHex[]; roads: Road[]; hexTerrainByKey: Map<string, HexTerrainData>;
  allowRoadHexes?: AxialHex[];
}): AxialHex[] | null {
  const { region, from, targets, roads, hexTerrainByKey, allowRoadHexes = [] } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const targetKeys = new Set(targets.filter((t) => !isLakeHex(t, hexTerrainByKey)).map(hexKey));
  const roadSegKeys = getRoadSegmentKeys(roads);
  const roadHexKeys = getRoadHexKeys(roads);
  const startKey = hexKey(from);
  if (isLakeHex(from, hexTerrainByKey) || targetKeys.size === 0) return null;
  const allowedRoadHexKeys = new Set([startKey, ...allowRoadHexes.map(hexKey), ...Array.from(targetKeys)]);
  const q: AxialHex[][] = [[from]];
  const visited = new Set<string>([startKey]);
  while (q.length) {
    const path = q.shift()!;
    const cur = path[path.length - 1];
    const curKey = hexKey(cur);
    if (path.length > 1 && targetKeys.has(curKey)) return path;
    for (const n of getHexNeighbors(cur)) {
      const nk = hexKey(n);
      if (visited.has(nk) || !regionKeys.has(nk)) continue;
      if (isLakeHex(n, hexTerrainByKey)) continue;
      if (roadSegKeys.has(normalizeRoadSegmentKey(cur, n))) continue;
      const hasRoadHex = roadHexKeys.has(nk);
      const allowedRoadHex = allowedRoadHexKeys.has(nk);
      if (hasRoadHex && !allowedRoadHex) continue;
      visited.add(nk);
      q.push([...path, n]);
    }
  }
  return null;
}
function isSameHex(a: AxialHex, b: AxialHex): boolean {
  return a.q === b.q && a.r === b.r;
}

function isPointOfInterestHex(hex: AxialHex, region: Region): boolean {
  const key = hexKey(hex);
  return region.pointsOfInterest.some((poi) => hexKey(poi) === key);
}

function getUnusedPoiTargets(
  region: Region,
  usedRoadPoiKeys: Set<string>,
  hexTerrainByKey: Map<string, HexTerrainData>
): AxialHex[] {
  return region.pointsOfInterest.filter((poi) => {
    const key = hexKey(poi);
    if (usedRoadPoiKeys.has(key)) return false;
    if (isLakeHex(poi, hexTerrainByKey)) return false;
    return true;
  });
}

function markPoiOnPathAsUsed(
  path: AxialHex[],
  region: Region,
  usedRoadPoiKeys: Set<string>
): void {
  const pathKeys = new Set(path.map(hexKey));
  for (const poi of region.pointsOfInterest) {
    const key = hexKey(poi);
    if (pathKeys.has(key)) usedRoadPoiKeys.add(key);
  }
}

function getSharedHexEdgeVertexKeys(a: AxialHex, b: AxialHex): [string, string] | null {
  const aPoints = getHexCornerPoints(a);
  const bPointKeys = new Set(getHexCornerPoints(b).map((point) => point.key));
  const shared = aPoints.filter((point) => bPointKeys.has(point.key)).map((point) => point.key);
  if (shared.length !== 2) return null;
  return [shared[0], shared[1]];
}

function getRiverCrossingFullnessByEdge(rivers: River[]): Map<string, RiverFullness> {
  const fullnessByEdge = new Map<string, RiverFullness>();
  for (const river of rivers) {
    const sectorFullnessByEdge = getRiverSectorFullnessByEdge(river);
    const fallbackFullness = getRiverFallbackFullness(river);
    for (let i = 1; i < river.vertexPath.length; i += 1) {
      const riverEdgeKey = edgeKey(river.vertexPath[i - 1], river.vertexPath[i]);
      const fullness = sectorFullnessByEdge.get(riverEdgeKey) ?? fallbackFullness;
      const existingFullness = fullnessByEdge.get(riverEdgeKey);
      if (!existingFullness || fullness > existingFullness) fullnessByEdge.set(riverEdgeKey, fullness);
    }
  }
  return fullnessByEdge;
}

function countRoadPathRiverCrossings(path: AxialHex[], rivers: River[], minFullness: RiverFullness = 1): number {
  if (path.length < 2) return 0;
  const riverFullnessByEdge = getRiverCrossingFullnessByEdge(rivers);
  let crossings = 0;
  for (let i = 1; i < path.length; i += 1) {
    const sharedEdge = getSharedHexEdgeVertexKeys(path[i - 1], path[i]);
    if (!sharedEdge) continue;
    const [v1, v2] = sharedEdge;
    const roadEdgeKey = v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`;
    const fullness = riverFullnessByEdge.get(roadEdgeKey);
    if (fullness && fullness >= minFullness) crossings += 1;
  }
  return crossings;
}

function roadPathCrossesRiver(path: AxialHex[], rivers: River[], minFullness: RiverFullness = 1): boolean {
  return countRoadPathRiverCrossings(path, rivers, minFullness) > 0;
}


function getPoiKeysOnRoadPath(path: AxialHex[], region: Region): Set<string> {
  const pathKeys = new Set(path.map(hexKey));
  const centerKey = hexKey(region.centerHex);
  const touchedPoiKeys = new Set<string>();
  for (const poi of region.pointsOfInterest) {
    const key = hexKey(poi);
    if (key === centerKey) continue;
    if (pathKeys.has(key)) touchedPoiKeys.add(key);
  }
  return touchedPoiKeys;
}

function chooseBestRoadCandidate(candidates: RoadCandidatePath[]): RoadCandidatePath | null {
  if (candidates.length === 0) return null;
  const minCrossings = Math.min(...candidates.map((candidate) => candidate.crossedRiverCount));
  let bestCandidates = candidates.filter((candidate) => candidate.crossedRiverCount === minCrossings);
  const minLength = Math.min(...bestCandidates.map((candidate) => candidate.extendedPath.length));
  bestCandidates = bestCandidates.filter((candidate) => candidate.extendedPath.length === minLength);
  const maxPoiCount = Math.max(...bestCandidates.map((candidate) => candidate.touchedPoiCount));
  bestCandidates = bestCandidates.filter((candidate) => candidate.touchedPoiCount === maxPoiCount);
  return randomFrom(bestCandidates);
}

function hexHasRoad(hex: AxialHex, roads: Road[]): boolean {
  const key = hexKey(hex);
  return roads.some((road) => road.segments.some((segment) => hexKey(segment.from) === key || hexKey(segment.to) === key));
}

function hexHasRoadOrTrail(hex: AxialHex, roads: Road[]): boolean {
  return hexHasRoad(hex, roads);
}

function findTrailPathWithinRegion(options: {
  region: Region;
  fromHex: AxialHex;
  targetHex: AxialHex;
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
}): AxialHex[] | null {
  const { region, fromHex, targetHex, roads, rivers, hexTerrainByKey } = options;
  const path = findRoadPathWithinRegion({
    region,
    from: fromHex,
    targets: [targetHex],
    roads,
    hexTerrainByKey,
    allowRoadHexes: [fromHex, targetHex]
  });
  if (!path) return null;
  if (roadPathCrossesRiver(path, rivers, 2)) return null;
  return path;
}

function addTrailPathWithoutDuplicateSegments(options: {
  path: AxialHex[];
  roads: Road[];
  regionId: number;
  nextRoadId: number;
}): { roads: Road[]; nextRoadId: number; added: boolean } {
  const { path, roads, regionId, nextRoadId } = options;
  if (path.length < 2) return { roads, nextRoadId, added: false };
  const existingSegmentKeys = getRoadSegmentKeys(roads);
  const segmentsToAdd: RoadSegment[] = [];
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const segmentKey = normalizeRoadSegmentKey(from, to);
    if (existingSegmentKeys.has(segmentKey)) continue;
    segmentsToAdd.push({ from, to, kind: 'trail' });
    existingSegmentKeys.add(segmentKey);
  }
  if (segmentsToAdd.length === 0) return { roads, nextRoadId, added: false };
  return {
    roads: [...roads, { id: nextRoadId, regionId, segments: segmentsToAdd }],
    nextRoadId: nextRoadId + 1,
    added: true
  };
}

function connectRemainingPoiWithTrails(options: {
  region: Region;
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  nextRoadId: number;
}): { roads: Road[]; nextRoadId: number } {
  const { region, roads, rivers, hexTerrainByKey, nextRoadId } = options;
  let builtRoads = [...roads];
  let nextRoadIdLocal = nextRoadId;
  const skippedPoiKeys = new Set<string>();
  let loopLimit = region.pointsOfInterest.length + 5;
  const regionRoadHexes = (currentRoads: Road[]) => getRoadHexesInRegion(region, currentRoads);
  while (loopLimit > 0) {
    loopLimit -= 1;
    const disconnectedPoi = region.pointsOfInterest
      .filter((poi) => !hexHasRoadOrTrail(poi, builtRoads))
      .filter((poi) => !isLakeHex(poi, hexTerrainByKey))
      .filter((poi) => !skippedPoiKeys.has(hexKey(poi)));
    if (disconnectedPoi.length === 0) break;
    const roadHexCandidates = regionRoadHexes(builtRoads)
      .filter((hex) => !isLakeHex(hex, hexTerrainByKey));
    const selectedPoi = [...disconnectedPoi].sort((a, b) => {
      const da = roadHexCandidates.length > 0 ? Math.min(...roadHexCandidates.map((roadHex) => hexDistance(a, roadHex))) : Number.MAX_SAFE_INTEGER;
      const db = roadHexCandidates.length > 0 ? Math.min(...roadHexCandidates.map((roadHex) => hexDistance(b, roadHex))) : Number.MAX_SAFE_INTEGER;
      return da - db;
    })[0];
    let connected = false;
    const roadTargets = regionRoadHexes(builtRoads)
      .filter((hex) => !isLakeHex(hex, hexTerrainByKey))
      .filter((hex) => !isSameHex(hex, selectedPoi))
      .sort((a, b) => hexDistance(selectedPoi, a) - hexDistance(selectedPoi, b));
    for (const roadHex of roadTargets) {
      const path = findTrailPathWithinRegion({ region, fromHex: selectedPoi, targetHex: roadHex, roads: builtRoads, rivers, hexTerrainByKey });
      if (!path) continue;
      const addResult = addTrailPathWithoutDuplicateSegments({ path, roads: builtRoads, regionId: region.id, nextRoadId: nextRoadIdLocal });
      if (!addResult.added) continue;
      builtRoads = addResult.roads;
      nextRoadIdLocal = addResult.nextRoadId;
      connected = true;
      break;
    }
    if (!connected) {
      const poiTargets = region.pointsOfInterest
        .filter((poi) => !isSameHex(poi, selectedPoi))
        .filter((poi) => !isLakeHex(poi, hexTerrainByKey))
        .sort((a, b) => hexDistance(selectedPoi, a) - hexDistance(selectedPoi, b));
      for (const targetPoi of poiTargets) {
        const path = findTrailPathWithinRegion({ region, fromHex: selectedPoi, targetHex: targetPoi, roads: builtRoads, rivers, hexTerrainByKey });
        if (!path) continue;
        const addResult = addTrailPathWithoutDuplicateSegments({ path, roads: builtRoads, regionId: region.id, nextRoadId: nextRoadIdLocal });
        if (!addResult.added) continue;
        builtRoads = addResult.roads;
        nextRoadIdLocal = addResult.nextRoadId;
        connected = true;
        break;
      }
    }
    if (!connected) skippedPoiKeys.add(hexKey(selectedPoi));
  }
  console.log('Settled POI trails result', {
    regionId: region.id,
    totalPoi: region.pointsOfInterest.length,
    connectedPoi: region.pointsOfInterest.filter((poi) => hexHasRoadOrTrail(poi, builtRoads)).length,
    skippedPoi: skippedPoiKeys.size
  });
  return { roads: builtRoads, nextRoadId: nextRoadIdLocal };
}

function getRoadedPoiTargets(region: Region, roads: Road[]): AxialHex[] {
  return region.pointsOfInterest.filter((poi) => hexHasRoad(poi, roads));
}

function getRegionBorderHexes(region: Region): AxialHex[] {
  const regionKeys = new Set(region.hexes.map(hexKey));
  return region.hexes.filter((hex) => getHexNeighbors(hex).some((neighbor) => !regionKeys.has(hexKey(neighbor))));
}

function getCandidateFacingRegionBorderHexes(region: Region, candidateHexes: AxialHex[]): AxialHex[] {
  const candidateKeys = new Set(candidateHexes.map(hexKey));
  if (candidateKeys.size === 0) return [];
  return getRegionBorderHexes(region).filter((hex) => getHexNeighbors(hex).some((neighbor) => candidateKeys.has(hexKey(neighbor))));
}

function isAdjacentToRoadHex(hex: AxialHex, roads: Road[]): boolean {
  const roadHexKeys = getRoadHexKeys(roads);
  return getHexNeighbors(hex).some((neighbor) => roadHexKeys.has(hexKey(neighbor)));
}

function getRoadHexesInRegion(region: Region, roads: Road[]): AxialHex[] {
  return region.hexes.filter((hex) => hexHasRoad(hex, roads));
}


function getSettledMainRoadLimit(region: Region): number {
  const largeRegionLabels = new Set<Region['sizeLabel']>(['Большой регион', 'Край', 'Обширный край']);
  return largeRegionLabels.has(region.sizeLabel) ? 3 : 2;
}

function getRoadHexKeySet(road: Road): Set<string> {
  const keys = new Set<string>();
  for (const segment of road.segments) {
    keys.add(hexKey(segment.from));
    keys.add(hexKey(segment.to));
  }
  return keys;
}

function getUniqueIncomingRoadCount(incoming: IncomingRoadEndpoint[]): number {
  return new Set(incoming.map((endpoint) => endpoint.roadId)).size;
}

function pathPassesNearSameRoad(options: {
  path: AxialHex[];
  road: Road;
  allowedTouchHexes: AxialHex[];
  allowedNearHexes?: AxialHex[];
}): boolean {
  const { path, road, allowedTouchHexes, allowedNearHexes = [] } = options;
  const roadHexKeys = getRoadHexKeySet(road);
  const allowedTouchHexKeys = new Set(allowedTouchHexes.map(hexKey));
  const allowedNearHexKeys = new Set([...allowedTouchHexes, ...allowedNearHexes].map(hexKey));

  for (const pathHex of path) {
    const pathHexKey = hexKey(pathHex);
    if (roadHexKeys.has(pathHexKey) && !allowedTouchHexKeys.has(pathHexKey)) return true;
    if (allowedNearHexKeys.has(pathHexKey)) continue;
    if (getHexNeighbors(pathHex).some((neighbor) => {
      const neighborKey = hexKey(neighbor);
      return roadHexKeys.has(neighborKey) && !allowedTouchHexKeys.has(neighborKey);
    })) return true;
  }

  return false;
}

function pathPassesNearItself(path: AxialHex[]): boolean {
  for (let i = 0; i < path.length; i += 1) {
    const currentKey = hexKey(path[i]);
    for (let j = i + 1; j < path.length; j += 1) {
      if (j === i + 1) continue;
      if (hexKey(path[j]) === currentKey) return true;
      if (areHexesAdjacent(path[i], path[j])) return true;
    }
  }

  return false;
}

function normalizeSettledRegionRoadIds(options: {
  region: Region;
  roads: Road[];
  nextRoadId: number;
}): { roads: Road[]; nextRoadId: number } {
  const { region, roads, nextRoadId } = options;
  if (region.biomeLandType !== 'settled') return { roads, nextRoadId };

  const mainRoadLimit = getSettledMainRoadLimit(region);
  const regionRoads = roads.filter((road) => road.regionId === region.id && road.segments.some((segment) => segment.kind === 'road'));
  if (regionRoads.length <= mainRoadLimit) return { roads, nextRoadId };

  const primaryRoadIds = new Set(regionRoads.slice(0, mainRoadLimit).map((road) => road.id));
  const mergedPrimaryRoads = new Map<number, Road>();
  for (const road of regionRoads.slice(0, mainRoadLimit)) {
    mergedPrimaryRoads.set(road.id, { ...road, segments: [...road.segments] });
  }

  for (const extraRoad of regionRoads.slice(mainRoadLimit)) {
    const extraHexKeys = getRoadHexKeySet(extraRoad);
    let bestPrimaryRoad: Road | undefined;
    let bestSharedHexCount = -1;
    for (const primaryRoad of mergedPrimaryRoads.values()) {
      const primaryHexKeys = getRoadHexKeySet(primaryRoad);
      let sharedHexCount = 0;
      for (const key of extraHexKeys) if (primaryHexKeys.has(key)) sharedHexCount += 1;
      if (!bestPrimaryRoad || sharedHexCount > bestSharedHexCount || (sharedHexCount === bestSharedHexCount && primaryRoad.segments.length < bestPrimaryRoad.segments.length)) {
        bestPrimaryRoad = primaryRoad;
        bestSharedHexCount = sharedHexCount;
      }
    }
    if (bestPrimaryRoad) bestPrimaryRoad.segments.push(...extraRoad.segments);
  }

  return {
    roads: roads
      .filter((road) => road.regionId !== region.id || !road.segments.some((segment) => segment.kind === 'road') || primaryRoadIds.has(road.id))
      .map((road) => mergedPrimaryRoads.get(road.id) ?? road),
    nextRoadId
  };
}

type SupplementalSettledRoadCandidate = RoadCandidatePath & { startHex: AxialHex; anchorDistance: number };

function chooseBestSupplementalSettledRoadCandidate(candidates: SupplementalSettledRoadCandidate[]): SupplementalSettledRoadCandidate | null {
  if (candidates.length === 0) return null;
  const maxPoiCount = Math.max(...candidates.map((c) => c.touchedPoiCount));
  let best = candidates.filter((c) => c.touchedPoiCount === maxPoiCount);

  const minRiverCrossings = Math.min(...best.map((c) => c.crossedRiverCount));
  best = best.filter((c) => c.crossedRiverCount === minRiverCrossings);

  const maxAnchorDistance = Math.max(...best.map((c) => c.anchorDistance));
  best = best.filter((c) => c.anchorDistance === maxAnchorDistance);

  const minLength = Math.min(...best.map((c) => c.extendedPath.length));
  best = best.filter((c) => c.extendedPath.length === minLength);

  return randomFrom(best);
}

function chooseBestThirdRoadCandidate(candidates: RoadCandidatePath[]): RoadCandidatePath | null {
  if (candidates.length === 0) return null;
  const maxPoiCount = Math.max(...candidates.map((c) => c.touchedPoiCount));
  let best = candidates.filter((c) => c.touchedPoiCount === maxPoiCount);

  const minRiverCrossings = Math.min(...best.map((c) => c.crossedRiverCount));
  best = best.filter((c) => c.crossedRiverCount === minRiverCrossings);

  const minLength = Math.min(...best.map((c) => c.extendedPath.length));
  best = best.filter((c) => c.extendedPath.length === minLength);

  return randomFrom(best);
}

function findAlternativeRoadPathsWithinRegion(options: {
  region: Region; from: AxialHex; target: AxialHex; roads: Road[]; hexTerrainByKey: Map<string, HexTerrainData>; maxAlternatives: number;
}): AxialHex[][] {
  const { region, from, target, roads, hexTerrainByKey, maxAlternatives } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const startKey = hexKey(from);
  const targetKey = hexKey(target);
  if (isLakeHex(from, hexTerrainByKey) || isLakeHex(target, hexTerrainByKey)) return [];
  if (!regionKeys.has(startKey) || !regionKeys.has(targetKey) || startKey === targetKey) return [];
  const roadSegKeys = getRoadSegmentKeys(roads);
  const roadHexKeys = getRoadHexKeys(roads);
  const paths: AxialHex[][] = [];
  const pathKeys = new Set<string>();
  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts && paths.length < maxAlternatives; attempt += 1) {
    const q: AxialHex[][] = [[from]];
    const visited = new Set<string>([startKey]);
    let found: AxialHex[] | null = null;
    while (q.length > 0 && !found) {
      const path = q.shift()!;
      const cur = path[path.length - 1];
      if (path.length > 1 && hexKey(cur) === targetKey) {
        found = path;
        break;
      }
      let neighbors = getHexNeighbors(cur).filter((n) => {
        const nk = hexKey(n);
        if (visited.has(nk) || !regionKeys.has(nk)) return false;
        if (isLakeHex(n, hexTerrainByKey)) return false;
        if (roadSegKeys.has(normalizeRoadSegmentKey(cur, n))) return false;
        if (roadHexKeys.has(nk) && nk !== targetKey) return false;
        return true;
      });
      if (attempt % 5 === 1) neighbors = neighbors.reverse();
      else if (attempt % 5 === 2) neighbors = shuffleArray(neighbors);
      else if (attempt % 5 === 3) neighbors = [...neighbors].sort((a, b) => hexDistance(a, target) - hexDistance(b, target));
      else if (attempt % 5 === 4) neighbors = [...neighbors].sort((a, b) => hexDistance(b, target) - hexDistance(a, target));
      for (const n of neighbors) {
        visited.add(hexKey(n));
        q.push([...path, n]);
      }
    }
    if (!found) continue;
    const foundKey = found.map(hexKey).join('>');
    if (pathKeys.has(foundKey)) continue;
    pathKeys.add(foundKey);
    paths.push(found);
  }
  return paths;
}

function collectAlternativeRoadPathsToTarget(options: {
  region: Region; fromHex: AxialHex; targetHex: AxialHex; targetIsPoi: boolean; roads: Road[]; rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>; usedRoadPoiKeys: Set<string>; maxAlternatives: number;
}): RoadCandidatePath[] {
  const { region, fromHex, targetHex, targetIsPoi, roads, rivers, hexTerrainByKey, usedRoadPoiKeys, maxAlternatives } = options;
  const candidates: RoadCandidatePath[] = [];
  const basePaths = findAlternativeRoadPathsWithinRegion({ region, from: fromHex, target: targetHex, roads, hexTerrainByKey, maxAlternatives });
  for (const basePath of basePaths) {
    const extendedPath = extendRoadPathInSameDirectionWithinRegion({ path: basePath, region, roads, hexTerrainByKey });
    if (!canAddRoadPath({ path: extendedPath, roads, region, hexTerrainByKey, allowedRoadHexes: [fromHex, targetHex, extendedPath[extendedPath.length - 1]], allowedDuplicateHexKeys: new Set([hexKey(targetHex)]) })) continue;
    const touchedPoiKeys = getPoiKeysOnRoadPath(extendedPath, region);
    const touchedPoiCount = Array.from(touchedPoiKeys).filter((key) => !usedRoadPoiKeys.has(key)).length;
    candidates.push({ basePath, extendedPath, targetHex, targetIsPoi, crossedRiverCount: countRoadPathRiverCrossings(extendedPath, rivers), touchedPoiCount, touchedPoiKeys });
  }
  return candidates;
}

function extendRoadPathInSameDirectionWithinRegion(options: {
  path: AxialHex[];
  region: Region;
  roads: Road[];
  hexTerrainByKey: Map<string, HexTerrainData>;
}): AxialHex[] {
  const { path, region, roads, hexTerrainByKey } = options;
  if (path.length < 2) return path;
  const extended = [...path];
  const regionKeys = new Set(region.hexes.map(hexKey));
  const roadSegKeys = getRoadSegmentKeys(roads);
  const roadHexKeys = getRoadHexKeys(roads);
  let prev = extended[extended.length - 2];
  let current = extended[extended.length - 1];
  const direction = { q: current.q - prev.q, r: current.r - prev.r };
  while (true) {
    const next = { q: current.q + direction.q, r: current.r + direction.r };
    const nextKey = hexKey(next);
    if (!regionKeys.has(nextKey)) break;
    if (isLakeHex(next, hexTerrainByKey)) break;
    if (roadSegKeys.has(normalizeRoadSegmentKey(current, next))) break;
    if (roadHexKeys.has(nextKey)) break;
    extended.push(next);
    prev = current;
    current = next;
  }
  return extended;
}

function getAvailableRoadFallbackHexes(options: {
  region: Region;
  fromHex: AxialHex;
  roads: Road[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  usedRoadPoiKeys: Set<string>;
  excludeHexKeys?: Set<string>;
}): AxialHex[] {
  const { region, fromHex, roads, hexTerrainByKey, usedRoadPoiKeys, excludeHexKeys = new Set<string>() } = options;
  void usedRoadPoiKeys;
  const roadHexKeys = getRoadHexKeys(roads);
  return region.hexes
    .filter((hex) => {
      const key = hexKey(hex);
      if (excludeHexKeys.has(key)) return false;
      if (isLakeHex(hex, hexTerrainByKey)) return false;
      if (roadHexKeys.has(key)) return false;
      return true;
    })
    .sort((a, b) => hexDistance(b, fromHex) - hexDistance(a, fromHex));
}

function canAddRoadPath(options: {
  path: AxialHex[];
  roads: Road[];
  region: Region;
  hexTerrainByKey: Map<string, HexTerrainData>;
  allowedRoadHexes?: AxialHex[];
  allowedDuplicateHexKeys?: Set<string>;
  allowExistingRoadOverlap?: boolean;
}): boolean {
  const { path, roads, region, hexTerrainByKey, allowedRoadHexes = [], allowedDuplicateHexKeys = new Set<string>(), allowExistingRoadOverlap = false } = options;
  if (path.length < 2) return false;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const roadSegKeys = getRoadSegmentKeys(roads);
  const roadHexKeys = getRoadHexKeys(roads);
  const allowedRoadHexKeys = new Set(allowedRoadHexes.map(hexKey));
  const seen = new Set<string>();
  for (let i = 0; i < path.length; i += 1) {
    const cur = path[i];
    const ck = hexKey(cur);
    if (isLakeHex(cur, hexTerrainByKey)) return false;
    if (i > 0 && i < path.length - 1 && !regionKeys.has(ck)) return false;
    if (seen.has(ck) && !allowedDuplicateHexKeys.has(ck)) return false;
    seen.add(ck);
    if (!allowExistingRoadOverlap && roadHexKeys.has(ck) && !allowedRoadHexKeys.has(ck)) return false;
    if (i === 0) continue;
    const prev = path[i - 1];
    const pk = hexKey(prev);
    if (!areHexesAdjacent(prev, cur)) return false;
    if (!allowExistingRoadOverlap && roadSegKeys.has(normalizeRoadSegmentKey(prev, cur))) return false;
    if (i > 1 && !regionKeys.has(pk)) return false;
  }
  return true;
}
type IncomingRoadEndpoint = { roadId: number; endpointHex: AxialHex; entryHex: AxialHex };
type SettledIncomingRoadCandidate = RoadCandidatePath & { incoming: IncomingRoadEndpoint };

function buildPathFromIncomingRoadEndpoint(endpointHex: AxialHex, innerPath: AxialHex[]): AxialHex[] {
  if (innerPath.length > 0 && isSameHex(endpointHex, innerPath[0])) return innerPath;
  return [endpointHex, ...innerPath];
}

function appendIncomingRoadEndpointToPath(path: AxialHex[], endpointHex: AxialHex): AxialHex[] {
  if (path.length > 0 && isSameHex(path[path.length - 1], endpointHex)) return path;
  return [...path, endpointHex];
}

function getRoadEndpointContinuationHex(road: Road, endpoint: AxialHex): AxialHex | null {
  const endpointKey = hexKey(endpoint);
  const touchingSegment = road.segments.find((segment) => (
    segment.kind === 'road'
    && (hexKey(segment.from) === endpointKey || hexKey(segment.to) === endpointKey)
  ));
  if (!touchingSegment) return null;

  const previousHex = hexKey(touchingSegment.from) === endpointKey ? touchingSegment.to : touchingSegment.from;
  return {
    q: endpoint.q + (endpoint.q - previousHex.q),
    r: endpoint.r + (endpoint.r - previousHex.r)
  };
}

function isUsableIncomingRoadEntryHex(region: Region, hex: AxialHex, hexTerrainByKey?: Map<string, HexTerrainData>): boolean {
  if (isSameHex(hex, region.centerHex)) return false;
  if (hexTerrainByKey && isLakeHex(hex, hexTerrainByKey)) return false;
  return true;
}

function chooseIncomingRoadEntryHex(
  region: Region,
  road: Road,
  endpoint: AxialHex,
  entries: AxialHex[],
  hexTerrainByKey?: Map<string, HexTerrainData>
): AxialHex {
  const continuationHex = getRoadEndpointContinuationHex(road, endpoint);
  if (continuationHex) {
    const straightEntry = entries.find((entry) => isSameHex(entry, continuationHex));
    if (straightEntry && isUsableIncomingRoadEntryHex(region, straightEntry, hexTerrainByKey)) return straightEntry;
  }

  const usableEntries = entries.filter((entry) => isUsableIncomingRoadEntryHex(region, entry, hexTerrainByKey));
  if (usableEntries.length > 0) return randomFrom(usableEntries);

  return [...entries].sort((a, b) => hexDistance(a, region.centerHex) - hexDistance(b, region.centerHex))[0];
}

function findIncomingRoadEndpointsForRegion(
  region: Region,
  roads: Road[],
  hexTerrainByKey?: Map<string, HexTerrainData>,
  includeRoadBodyEntries = false
): IncomingRoadEndpoint[] {
  const regionKeys = new Set(region.hexes.map(hexKey));
  const result = new Map<string, IncomingRoadEndpoint>();

  const addIncoming = (roadId: number, endpointHex: AxialHex, entryHex: AxialHex) => {
    if (!isUsableIncomingRoadEntryHex(region, entryHex, hexTerrainByKey)) return;
    const key = `${roadId}:${hexKey(endpointHex)}:${hexKey(entryHex)}`;
    if (!result.has(key)) result.set(key, { roadId, endpointHex, entryHex });
  };

  for (const road of roads) {
    for (const endpoint of getRoadEndpoints(road, 'road')) {
      if (regionKeys.has(hexKey(endpoint))) {
        addIncoming(road.id, endpoint, endpoint);
        continue;
      }
      const entries = getHexNeighbors(endpoint).filter((h) => regionKeys.has(hexKey(h)));
      if (entries.length === 0) continue;
      addIncoming(road.id, endpoint, chooseIncomingRoadEntryHex(region, road, endpoint, entries, hexTerrainByKey));
    }

    if (includeRoadBodyEntries) {
      const roadHexes = new Map<string, AxialHex>();
      for (const segment of road.segments) {
        if (segment.kind !== 'road') continue;
        roadHexes.set(hexKey(segment.from), segment.from);
        roadHexes.set(hexKey(segment.to), segment.to);
      }

      for (const roadHex of roadHexes.values()) {
        if (regionKeys.has(hexKey(roadHex))) {
          addIncoming(road.id, roadHex, roadHex);
          continue;
        }

        const sideEntries = getHexNeighbors(roadHex)
          .filter((entry) => regionKeys.has(hexKey(entry)))
          .filter((entry) => isUsableIncomingRoadEntryHex(region, entry, hexTerrainByKey));
        for (const entry of sideEntries) addIncoming(road.id, roadHex, entry);
      }
    }
  }

  return Array.from(result.values());
}


function chooseBestSettledIncomingRoadCandidate(candidates: SettledIncomingRoadCandidate[]): SettledIncomingRoadCandidate | null {
  if (candidates.length === 0) return null;
  const maxPoiCount = Math.max(...candidates.map((candidate) => candidate.touchedPoiCount));
  let bestCandidates = candidates.filter((candidate) => candidate.touchedPoiCount === maxPoiCount);
  const minCrossings = Math.min(...bestCandidates.map((candidate) => candidate.crossedRiverCount));
  bestCandidates = bestCandidates.filter((candidate) => candidate.crossedRiverCount === minCrossings);
  const minLength = Math.min(...bestCandidates.map((candidate) => candidate.extendedPath.length));
  bestCandidates = bestCandidates.filter((candidate) => candidate.extendedPath.length === minLength);
  return randomFrom(bestCandidates);
}

function collectSettledIncomingRoadPathsToTarget(options: {
  region: Region;
  incoming: IncomingRoadEndpoint;
  targetHexes: AxialHex[];
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  usedRoadPoiKeys: Set<string>;
  maxAlternatives: number;
}): SettledIncomingRoadCandidate[] {
  const { region, incoming, targetHexes, roads, rivers, hexTerrainByKey, usedRoadPoiKeys, maxAlternatives } = options;
  const candidates: SettledIncomingRoadCandidate[] = [];
  const targetKeys = new Set(targetHexes.map(hexKey));
  const uniqueTargets = targetHexes.filter((targetHex, index, allTargets) => allTargets.findIndex((other) => hexKey(other) === hexKey(targetHex)) === index);

  for (const targetHex of uniqueTargets) {
    if (isSameHex(incoming.entryHex, targetHex)) continue;
    const basePaths = findAlternativeRoadPathsWithinRegion({
      region,
      from: incoming.entryHex,
      target: targetHex,
      roads,
      hexTerrainByKey,
      maxAlternatives
    });

    for (const basePath of basePaths) {
      const extendedPath = buildPathFromIncomingRoadEndpoint(incoming.endpointHex, basePath);
      const allowedRoadHexes = [incoming.endpointHex, incoming.entryHex, targetHex];
      if (!canAddRoadPath({ path: extendedPath, roads, region, hexTerrainByKey, allowedRoadHexes })) continue;
      const touchedPoiKeys = getPoiKeysOnRoadPath(extendedPath, region);
      const touchedPoiCount = Array.from(touchedPoiKeys).filter((key) => !usedRoadPoiKeys.has(key)).length;
      candidates.push({
        incoming,
        basePath,
        extendedPath,
        targetHex,
        targetIsPoi: targetKeys.has(hexKey(targetHex)) && isPointOfInterestHex(targetHex, region),
        crossedRiverCount: countRoadPathRiverCrossings(extendedPath, rivers),
        touchedPoiCount,
        touchedPoiKeys
      });
    }
  }

  return candidates;
}

function getRoadBuildCountForSettledRegion(region: Region, roads: Road[]): number {
  return roads.filter((road) => road.regionId === region.id && road.segments.some((segment) => segment.kind === 'road')).length;
}


function findWildIncomingRoadEndpointsForRegion(region: Region, roads: Road[]): IncomingRoadEndpoint[] {
  const regionKeys = new Set(region.hexes.map(hexKey));
  const result: IncomingRoadEndpoint[] = [];
  for (const road of roads) {
    for (const endpoint of getRoadEndpoints(road, 'road')) {
      const endpointKey = hexKey(endpoint);
      const touchesRegion = regionKeys.has(endpointKey) || getHexNeighbors(endpoint).some((neighbor) => regionKeys.has(hexKey(neighbor)));
      if (!touchesRegion) continue;
      result.push({ roadId: road.id, endpointHex: endpoint, entryHex: endpoint });
    }
  }
  return result;
}

function findLowestRiverCrossingPathWithinWildRegion(options: {
  region: Region;
  from: AxialHex;
  target: AxialHex;
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  freeFirstRiverCrossing?: boolean;
}): AxialHex[] | null {
  const { region, from, target, rivers, hexTerrainByKey, freeFirstRiverCrossing = false } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const centerKey = hexKey(region.centerHex);
  const startKey = hexKey(from);
  const targetKey = hexKey(target);
  if (startKey === targetKey) return null;
  if (startKey === centerKey || targetKey === centerKey) return null;
  if (isLakeHex(from, hexTerrainByKey) || isLakeHex(target, hexTerrainByKey)) return null;

  const canTouchRegion = (hex: AxialHex) => regionKeys.has(hexKey(hex)) || getHexNeighbors(hex).some((neighbor) => regionKeys.has(hexKey(neighbor)));
  if (!canTouchRegion(from) || !canTouchRegion(target)) return null;

  const riverFullnessByEdge = getRiverCrossingFullnessByEdge(rivers);
  const queue: Array<{ path: AxialHex[]; cost: number; riverCrossings: number }> = [{ path: [from], cost: 0, riverCrossings: 0 }];
  const bestCostByState = new Map<string, number>([[`${startKey}|0`, 0]]);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost || a.riverCrossings - b.riverCrossings || a.path.length - b.path.length);
    const current = queue.shift()!;
    const cur = current.path[current.path.length - 1];
    const curKey = hexKey(cur);
    if (curKey === targetKey) return current.path;
    const currentStateKey = `${curKey}|${freeFirstRiverCrossing && current.riverCrossings === 0 ? 0 : 1}`;
    if ((bestCostByState.get(currentStateKey) ?? Number.POSITIVE_INFINITY) < current.cost) continue;

    for (const neighbor of getHexNeighbors(cur)) {
      const neighborKey = hexKey(neighbor);
      const neighborIsTarget = neighborKey === targetKey;
      const neighborIsInsideRegion = regionKeys.has(neighborKey);
      if (!neighborIsTarget && !neighborIsInsideRegion) continue;
      if (neighborIsInsideRegion && neighborKey === centerKey) continue;
      if (current.path.some((hex) => hexKey(hex) === neighborKey)) continue;
      if (isLakeHex(neighbor, hexTerrainByKey)) continue;

      const sharedEdge = getSharedHexEdgeVertexKeys(cur, neighbor);
      const riverEdgeKey = sharedEdge ? (sharedEdge[0] < sharedEdge[1] ? `${sharedEdge[0]}|${sharedEdge[1]}` : `${sharedEdge[1]}|${sharedEdge[0]}`) : undefined;
      const riverFullness = riverEdgeKey ? riverFullnessByEdge.get(riverEdgeKey) : undefined;
      const nextRiverCrossings = current.riverCrossings + (riverFullness ? 1 : 0);
      const riverPenalty = riverFullness && !(freeFirstRiverCrossing && current.riverCrossings === 0) ? 100 + riverFullness * 10 : 0;
      const nextCost = current.cost + 1 + riverPenalty;
      const nextStateKey = `${neighborKey}|${freeFirstRiverCrossing && nextRiverCrossings === 0 ? 0 : 1}`;
      const previousBestCost = bestCostByState.get(nextStateKey);
      if (previousBestCost !== undefined && previousBestCost <= nextCost) continue;
      bestCostByState.set(nextStateKey, nextCost);
      queue.push({ path: [...current.path, neighbor], cost: nextCost, riverCrossings: nextRiverCrossings });
    }
  }

  return null;
}


function getRoadRegionCenterHexes(road: Road, regions: Region[]): AxialHex[] {
  const roadHexKeys = getRoadHexKeySet(road);
  const roadCenterHexes = regions
    .filter((region) => roadHexKeys.has(hexKey(region.centerHex)))
    .map((region) => region.centerHex);
  if (roadCenterHexes.length > 0) return roadCenterHexes;

  const sourceRegion = regions.find((region) => region.id === road.regionId);
  return sourceRegion ? [sourceRegion.centerHex] : [];
}

function getRoadRegionCenterKeys(road: Road, regions: Region[]): Set<string> {
  const centerHexes = getRoadRegionCenterHexes(road, regions);
  if (centerHexes.length > 0) return new Set(centerHexes.map(hexKey));
  return new Set([`road-${road.id}`]);
}

function roadTouchesKnownRegionCenter(road: Road, regions: Region[]): boolean {
  const roadHexKeys = getRoadHexKeySet(road);
  return regions.some((region) => roadHexKeys.has(hexKey(region.centerHex)));
}

function roadsShareRegionCenter(a: Road, b: Road, regions: Region[]): boolean {
  const aCenterKeys = getRoadRegionCenterKeys(a, regions);
  const bCenterKeys = getRoadRegionCenterKeys(b, regions);
  for (const key of aCenterKeys) if (bCenterKeys.has(key)) return true;
  return false;
}

function shouldSkipWildIncomingRoadPairForSharedCenter(a: Road, b: Road, regions: Region[]): boolean {
  if (!roadsShareRegionCenter(a, b, regions)) return false;
  return roadTouchesKnownRegionCenter(a, regions) && roadTouchesKnownRegionCenter(b, regions);
}

function findAlternativeWildRoadPairPaths(options: {
  region: Region;
  from: AxialHex;
  target: AxialHex;
  roads: Road[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  maxAlternatives: number;
}): AxialHex[][] {
  const { region, from, target, roads, hexTerrainByKey, maxAlternatives } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const centerKey = hexKey(region.centerHex);
  const startKey = hexKey(from);
  const targetKey = hexKey(target);
  if (!regionKeys.has(startKey) || !regionKeys.has(targetKey)) return [];
  if (startKey === centerKey || targetKey === centerKey) return [];
  if (startKey === targetKey) return [];
  if (isLakeHex(from, hexTerrainByKey) || isLakeHex(target, hexTerrainByKey)) return [];

  const roadSegKeys = getRoadSegmentKeys(roads);
  const paths: AxialHex[][] = [];
  const pathKeys = new Set<string>();
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts && paths.length < maxAlternatives; attempt += 1) {
    const queue: AxialHex[][] = [[from]];
    const bestDepthByHex = new Map<string, number>([[startKey, 1]]);
    let found: AxialHex[] | null = null;

    while (queue.length > 0 && !found) {
      const path = queue.shift()!;
      const current = path[path.length - 1];
      const currentKey = hexKey(current);
      if (path.length > 1 && currentKey === targetKey) {
        found = path;
        break;
      }

      let neighbors = getHexNeighbors(current).filter((neighbor) => {
        const neighborKey = hexKey(neighbor);
        if (!regionKeys.has(neighborKey)) return false;
        if (neighborKey === centerKey) return false;
        if (path.some((hex) => hexKey(hex) === neighborKey)) return false;
        if (isLakeHex(neighbor, hexTerrainByKey)) return false;
        if (roadSegKeys.has(normalizeRoadSegmentKey(current, neighbor))) return false;
        return true;
      });

      if (attempt % 5 === 1) neighbors = neighbors.reverse();
      else if (attempt % 5 === 2) neighbors = shuffleArray(neighbors);
      else if (attempt % 5 === 3) neighbors = [...neighbors].sort((a, b) => hexDistance(a, target) - hexDistance(b, target));
      else if (attempt % 5 === 4) neighbors = [...neighbors].sort((a, b) => hexDistance(b, target) - hexDistance(a, target));

      for (const neighbor of neighbors) {
        const neighborKey = hexKey(neighbor);
        const nextDepth = path.length + 1;
        const bestDepth = bestDepthByHex.get(neighborKey);
        if (bestDepth !== undefined && bestDepth < nextDepth - 2) continue;
        bestDepthByHex.set(neighborKey, Math.min(bestDepth ?? nextDepth, nextDepth));
        queue.push([...path, neighbor]);
      }
    }

    if (!found) continue;
    const foundKey = found.map(hexKey).join('>');
    if (pathKeys.has(foundKey)) continue;
    pathKeys.add(foundKey);
    paths.push(found);
  }

  return paths;
}

function canAddWildIncomingRoadPairPath(options: {
  path: AxialHex[];
  roads: Road[];
  region: Region;
  hexTerrainByKey: Map<string, HexTerrainData>;
}): boolean {
  const { path, roads, region, hexTerrainByKey } = options;
  if (path.length < 2) return false;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const centerKey = hexKey(region.centerHex);
  const roadSegKeys = getRoadSegmentKeys(roads);
  const seen = new Set<string>();

  for (let i = 0; i < path.length; i += 1) {
    const current = path[i];
    const currentKey = hexKey(current);
    if (isLakeHex(current, hexTerrainByKey)) return false;
    if (currentKey === centerKey) return false;
    if (seen.has(currentKey)) return false;
    seen.add(currentKey);
    if (i > 0 && i < path.length - 1 && !regionKeys.has(currentKey)) return false;
    if (i === 0) continue;
    const previous = path[i - 1];
    if (!areHexesAdjacent(previous, current)) return false;
    if (roadSegKeys.has(normalizeRoadSegmentKey(previous, current))) return false;
    if (i > 1 && !regionKeys.has(hexKey(previous))) return false;
  }

  return true;
}

function getWildIncomingRoadPairCandidates(options: {
  region: Region;
  regions: Region[];
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
}): WildIncomingRoadPairCandidate[] {
  const { region, regions, roads, rivers, hexTerrainByKey } = options;
  const incoming = findIncomingRoadEndpointsForRegion(region, roads, hexTerrainByKey)
    .filter((incomingEndpoint) => !isSameHex(incomingEndpoint.entryHex, region.centerHex) && !isLakeHex(incomingEndpoint.entryHex, hexTerrainByKey));
  if (incoming.length < 2) return [];

  const candidates: WildIncomingRoadPairCandidate[] = [];
  for (let i = 0; i < incoming.length - 1; i += 1) {
    for (let j = i + 1; j < incoming.length; j += 1) {
      const start = incoming[i];
      const target = incoming[j];
      if (start.roadId === target.roadId) continue;
      const startRoad = roads.find((road) => road.id === start.roadId);
      const targetRoad = roads.find((road) => road.id === target.roadId);
      if (!startRoad || !targetRoad) continue;
      if (shouldSkipWildIncomingRoadPairForSharedCenter(startRoad, targetRoad, regions)) continue;

      const innerPaths = findAlternativeWildRoadPairPaths({
        region,
        from: start.entryHex,
        target: target.entryHex,
        roads,
        hexTerrainByKey,
        maxAlternatives: 5
      });

      for (const innerPath of innerPaths) {
        const fullPath = appendIncomingRoadEndpointToPath(buildPathFromIncomingRoadEndpoint(start.endpointHex, innerPath), target.endpointHex);
        if (!canAddWildIncomingRoadPairPath({ path: fullPath, roads, region, hexTerrainByKey })) continue;
        candidates.push({
          startRoadId: start.roadId,
          targetRoadId: target.roadId,
          path: fullPath,
          crossedRiverCount: countRoadPathRiverCrossings(innerPath, rivers)
        });
      }
    }
  }

  return candidates;
}

function chooseBestWildIncomingRoadPairCandidate(candidates: WildIncomingRoadPairCandidate[]): WildIncomingRoadPairCandidate | null {
  if (candidates.length === 0) return null;
  const minRiverCrossings = Math.min(...candidates.map((candidate) => candidate.crossedRiverCount));
  let best = candidates.filter((candidate) => candidate.crossedRiverCount === minRiverCrossings);
  const minLength = Math.min(...best.map((candidate) => candidate.path.length));
  best = best.filter((candidate) => candidate.path.length === minLength);
  return randomFrom(best);
}

function addWildIncomingRoadPairCandidate(options: {
  candidate: WildIncomingRoadPairCandidate;
  roads: Road[];
  region: Region;
  hexTerrainByKey: Map<string, HexTerrainData>;
}): boolean {
  const { candidate, roads, region, hexTerrainByKey } = options;
  if (!canAddWildIncomingRoadPairPath({ path: candidate.path, roads, region, hexTerrainByKey })) return false;
  const startRoad = roads.find((road) => road.id === candidate.startRoadId);
  if (!startRoad) return false;

  for (let i = 1; i < candidate.path.length; i += 1) {
    startRoad.segments.push({ from: candidate.path[i - 1], to: candidate.path[i], kind: 'road' });
  }

  const targetRoadIndex = roads.findIndex((road) => road.id === candidate.targetRoadId);
  if (targetRoadIndex >= 0 && roads[targetRoadIndex].id !== startRoad.id) {
    startRoad.segments.push(...roads[targetRoadIndex].segments);
    roads.splice(targetRoadIndex, 1);
  }

  return true;
}

function getSameCenterWildRoadTargets(options: {
  region: Region;
  regions: Region[];
  roads: Road[];
  startRoad: Road;
  startEntryHex: AxialHex;
  hexTerrainByKey: Map<string, HexTerrainData>;
}): Array<{ kind: 'road'; entryHex: AxialHex; outsideHex: AxialHex; roadId: number }> {
  const { region, regions, roads, startRoad, startEntryHex, hexTerrainByKey } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const startCenterKeys = getRoadRegionCenterKeys(startRoad, regions);
  const targets = new Map<string, { kind: 'road'; entryHex: AxialHex; outsideHex: AxialHex; roadId: number }>();

  for (const road of roads) {
    if (road.id === startRoad.id) continue;

    const roadCenterKeys = getRoadRegionCenterKeys(road, regions);
    const sharesCenter = Array.from(startCenterKeys).some((centerKey) => roadCenterKeys.has(centerKey));
    if (!sharesCenter) continue;

    for (const segment of road.segments) {
      for (const hex of [segment.from, segment.to]) {
        const key = hexKey(hex);
        if (!regionKeys.has(key)) continue;
        if (isSameHex(hex, startEntryHex)) continue;
        if (isSameHex(hex, region.centerHex)) continue;
        if (isLakeHex(hex, hexTerrainByKey)) continue;
        targets.set(`${road.id}:${key}`, { kind: 'road', entryHex: hex, outsideHex: hex, roadId: road.id });
      }
    }
  }

  return Array.from(targets.values()).sort((a, b) => hexDistance(a.entryHex, startEntryHex) - hexDistance(b.entryHex, startEntryHex));
}

function getWildRoadCandidates(options: {
  region: Region;
  regions: Region[];
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  candidateHexes: AxialHex[];
  usedEndpointKeys?: Set<string>;
}): WildRoadCandidate[] {
  const { region, regions, roads, rivers, hexTerrainByKey, candidateHexes, usedEndpointKeys = new Set<string>() } = options;
  const incoming = findIncomingRoadEndpointsForRegion(region, roads, hexTerrainByKey)
    .filter((incomingEndpoint) => !usedEndpointKeys.has(hexKey(incomingEndpoint.endpointHex)))
    .filter((incomingEndpoint) => !isSameHex(incomingEndpoint.entryHex, region.centerHex) && !isLakeHex(incomingEndpoint.entryHex, hexTerrainByKey));
  if (incoming.length === 0) return [];

  const regionKeys = new Set(region.hexes.map(hexKey));
  const candidateKeys = new Set(candidateHexes.map(hexKey));
  const candidateTargets = getRegionBorderHexes(region)
    .flatMap((borderHex) => getHexNeighbors(borderHex)
      .filter((neighbor) => candidateKeys.has(hexKey(neighbor)))
      .map((candidateHex) => ({ entryHex: borderHex, outsideHex: candidateHex })))
    .filter((target, index, allTargets) => allTargets.findIndex((other) => hexKey(other.entryHex) === hexKey(target.entryHex) && hexKey(other.outsideHex) === hexKey(target.outsideHex)) === index)
    .filter((target) => !isLakeHex(target.entryHex, hexTerrainByKey));

  const result: WildRoadCandidate[] = [];
  for (const start of incoming) {
    const startRoad = roads.find((road) => road.id === start.roadId);
    if (!startRoad) continue;
    const sameCenterRoadTargets = getSameCenterWildRoadTargets({
      region,
      regions,
      roads,
      startRoad,
      startEntryHex: start.entryHex,
      hexTerrainByKey
    });
    const startRoadCenterHexes = getRoadRegionCenterHexes(startRoad, regions);
    const targets: Array<{ kind: 'candidate' | 'road'; entryHex: AxialHex; outsideHex: AxialHex; roadId?: number }> = [];

    if (sameCenterRoadTargets.length > 0) {
      targets.push(...sameCenterRoadTargets);
    } else {
      for (const target of candidateTargets) {
        if (isSameHex(target.entryHex, start.entryHex)) continue;
        targets.push({ kind: 'candidate', entryHex: target.entryHex, outsideHex: target.outsideHex });
      }
      for (const target of incoming) {
        if (target.roadId === start.roadId) continue;
        if (isSameHex(target.entryHex, start.entryHex)) continue;
        targets.push({ kind: 'road', entryHex: target.entryHex, outsideHex: target.endpointHex, roadId: target.roadId });
      }
    }

    for (const target of targets) {
      if (target.roadId === start.roadId) continue;
      if (!regionKeys.has(hexKey(start.entryHex)) || !regionKeys.has(hexKey(target.entryHex))) continue;
      const innerPath = findLowestRiverCrossingPathWithinWildRegion({
        region,
        from: start.entryHex,
        target: target.entryHex,
        rivers,
        hexTerrainByKey,
        freeFirstRiverCrossing: target.kind === 'candidate'
      });
      if (!innerPath || innerPath.length < 2) continue;
      const pathFromIncoming = buildPathFromIncomingRoadEndpoint(start.endpointHex, innerPath);
      const fullPath = target.kind === 'candidate'
        ? pathFromIncoming
        : appendIncomingRoadEndpointToPath(pathFromIncoming, target.outsideHex);
      const targetEndpointHex = target.kind === 'candidate' ? target.entryHex : target.outsideHex;
      if (usedEndpointKeys.has(hexKey(targetEndpointHex))) continue;
      const crossedRiverCount = countRoadPathRiverCrossings(innerPath, rivers);
      const targetDistanceFromStartRoadCenter = target.kind === 'candidate' && startRoadCenterHexes.length > 0
        ? Math.max(...startRoadCenterHexes.map((centerHex) => hexDistance(centerHex, target.outsideHex))) - hexDistance(start.entryHex, target.entryHex)
        : 0;
      const candidate: WildRoadCandidate = {
        startRoadId: start.roadId,
        targetRoadId: target.roadId,
        path: fullPath,
        crossedRiverCount: target.kind === 'candidate' ? Math.max(0, crossedRiverCount - 1) : crossedRiverCount,
        targetKind: target.kind,
        targetDistanceFromStartRoadCenter,
        startEndpointKey: hexKey(start.endpointHex),
        targetEndpointKey: hexKey(targetEndpointHex)
      };
      if (!canAttachWildRoadCandidateToExistingRoad({ candidate, roads, region, hexTerrainByKey })) continue;
      result.push(candidate);
    }
  }
  return result;
}

function chooseBestWildRoadCandidate(candidates: WildRoadCandidate[]): WildRoadCandidate | null {
  if (candidates.length === 0) return null;
  const minRiverCrossings = Math.min(...candidates.map((candidate) => candidate.crossedRiverCount));
  let best = candidates.filter((candidate) => candidate.crossedRiverCount === minRiverCrossings);
  const maxTargetDistanceFromStartRoadCenter = Math.max(...best.map((candidate) => candidate.targetDistanceFromStartRoadCenter));
  best = best.filter((candidate) => candidate.targetDistanceFromStartRoadCenter === maxTargetDistanceFromStartRoadCenter);
  const minLength = Math.min(...best.map((candidate) => candidate.path.length));
  best = best.filter((candidate) => candidate.path.length === minLength);
  return randomFrom(best);
}

function canAttachWildRoadCandidateToExistingRoad(options: {
  candidate: WildRoadCandidate;
  roads: Road[];
  region: Region;
  hexTerrainByKey: Map<string, HexTerrainData>;
}): boolean {
  const { candidate, roads, region, hexTerrainByKey } = options;
  const startTouchHex = candidate.path[0];
  const targetTouchHex = candidate.path[candidate.path.length - 1];
  const allowedRoadHexes = [startTouchHex, targetTouchHex];
  if (!canAddRoadPath({ path: candidate.path, roads, region, hexTerrainByKey, allowedRoadHexes, allowExistingRoadOverlap: true })) return false;
  if (candidate.targetRoadId === candidate.startRoadId) return false;
  const startRoad = roads.find((road) => road.id === candidate.startRoadId);
  if (!startRoad) return false;
  const startNearHex = candidate.path.length > 1 ? candidate.path[1] : startTouchHex;
  const targetNearHex = candidate.path.length > 1 ? candidate.path[candidate.path.length - 2] : targetTouchHex;
  if (pathPassesNearSameRoad({
    path: candidate.path,
    road: startRoad,
    allowedTouchHexes: [startTouchHex],
    allowedNearHexes: [startNearHex]
  })) return false;
  if (candidate.targetRoadId !== undefined) {
    const targetRoad = roads.find((road) => road.id === candidate.targetRoadId);
    if (!targetRoad || pathPassesNearSameRoad({
      path: candidate.path,
      road: targetRoad,
      allowedTouchHexes: [targetTouchHex],
      allowedNearHexes: [targetNearHex]
    })) return false;
  }
  return true;
}

function addWildRoadCandidateToExistingRoad(options: {
  candidate: WildRoadCandidate;
  roads: Road[];
  region: Region;
  hexTerrainByKey: Map<string, HexTerrainData>;
}): boolean {
  const { candidate, roads, region, hexTerrainByKey } = options;
  if (!canAttachWildRoadCandidateToExistingRoad({ candidate, roads, region, hexTerrainByKey })) return false;
  const startRoad = roads.find((road) => road.id === candidate.startRoadId);
  if (!startRoad) return false;
  const segmentsToAdd: RoadSegment[] = [];
  for (let i = 1; i < candidate.path.length; i += 1) {
    segmentsToAdd.push({ from: candidate.path[i - 1], to: candidate.path[i], kind: 'road' });
  }
  startRoad.segments.push(...segmentsToAdd);

  if (candidate.targetRoadId !== undefined && candidate.targetRoadId !== candidate.startRoadId) {
    const targetRoadIndex = roads.findIndex((road) => road.id === candidate.targetRoadId);
    if (targetRoadIndex >= 0) {
      startRoad.segments.push(...roads[targetRoadIndex].segments);
      roads.splice(targetRoadIndex, 1);
    }
  }
  return true;
}


function getWildRoadCandidateBoundaryHexes(options: {
  region: Region;
  candidateHexes: AxialHex[];
  hexTerrainByKey: Map<string, HexTerrainData>;
}): AxialHex[] {
  const { region, candidateHexes, hexTerrainByKey } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const candidatesByKey = new Map(candidateHexes.map((candidateHex) => [hexKey(candidateHex), candidateHex]));
  const boundaryCandidates = new Map<string, AxialHex>();

  for (const candidateHex of candidatesByKey.values()) {
    const candidateKey = hexKey(candidateHex);
    if (regionKeys.has(candidateKey)) continue;
    if (isLakeHex(candidateHex, hexTerrainByKey)) continue;
    if (!getHexNeighbors(candidateHex).some((neighbor) => regionKeys.has(hexKey(neighbor)))) continue;
    boundaryCandidates.set(candidateKey, candidateHex);
  }

  return Array.from(boundaryCandidates.values());
}

function trimPathToRegionHexes(path: AxialHex[], region: Region): AxialHex[] {
  const regionKeys = new Set(region.hexes.map(hexKey));
  const firstRegionIndex = path.findIndex((hex) => regionKeys.has(hexKey(hex)));
  if (firstRegionIndex < 0) return [];
  let lastRegionIndex = -1;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (regionKeys.has(hexKey(path[i]))) {
      lastRegionIndex = i;
      break;
    }
  }
  if (lastRegionIndex < firstRegionIndex) return [];
  return path.slice(firstRegionIndex, lastRegionIndex + 1);
}

function getWildCandidateRoadCandidates(options: {
  region: Region;
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  candidateHexes: AxialHex[];
}): WildCandidateRoadCandidate[] {
  const { region, roads, rivers, hexTerrainByKey, candidateHexes } = options;
  const boundaryCandidates = getWildRoadCandidateBoundaryHexes({ region, candidateHexes, hexTerrainByKey });
  if (boundaryCandidates.length < 2) return [];

  const candidates: WildCandidateRoadCandidate[] = [];
  for (let i = 0; i < boundaryCandidates.length - 1; i += 1) {
    for (let j = i + 1; j < boundaryCandidates.length; j += 1) {
      const from = boundaryCandidates[i];
      const target = boundaryCandidates[j];
      const path = findLowestRiverCrossingPathWithinWildRegion({
        region,
        from,
        target,
        rivers,
        hexTerrainByKey,
        freeFirstRiverCrossing: true
      });
      if (!path || path.length < 3) continue;
      const trimmedPath = trimPathToRegionHexes(path, region);
      if (trimmedPath.length < 2) continue;
      if (pathPassesNearItself(trimmedPath)) continue;
      if (!canAddRoadPath({ path: trimmedPath, roads, region, hexTerrainByKey })) continue;
      candidates.push({
        path: trimmedPath,
        crossedRiverCount: countRoadPathRiverCrossings(trimmedPath, rivers)
      });
    }
  }
  return candidates;
}

function chooseBestWildCandidateRoadCandidate(candidates: WildCandidateRoadCandidate[]): WildCandidateRoadCandidate | null {
  if (candidates.length === 0) return null;
  const minRiverCrossings = Math.min(...candidates.map((candidate) => candidate.crossedRiverCount));
  const best = candidates.filter((candidate) => candidate.crossedRiverCount === minRiverCrossings);
  return randomFrom(best);
}

function addWildCandidateRoadCandidate(options: {
  candidate: WildCandidateRoadCandidate;
  roads: Road[];
  region: Region;
  hexTerrainByKey: Map<string, HexTerrainData>;
  nextRoadId: number;
}): { roads: Road[]; nextRoadId: number; added: boolean } {
  const { candidate, roads, region, hexTerrainByKey, nextRoadId } = options;
  const allowedRoadHexes = [candidate.path[0], candidate.path[candidate.path.length - 1]];
  if (pathPassesNearItself(candidate.path)) return { roads, nextRoadId, added: false };
  if (!canAddRoadPath({ path: candidate.path, roads, region, hexTerrainByKey, allowedRoadHexes })) return { roads, nextRoadId, added: false };
  const segments: RoadSegment[] = [];
  for (let i = 1; i < candidate.path.length; i += 1) {
    segments.push({ from: candidate.path[i - 1], to: candidate.path[i], kind: 'road' });
  }
  return {
    roads: [...roads, { id: nextRoadId, regionId: region.id, segments }],
    nextRoadId: nextRoadId + 1,
    added: true
  };
}


type WildTrailPoint = {
  hex: AxialHex;
  isInsideRegion: boolean;
};

function getRoadHexKeysByKind(roads: Road[], kind: RoadKind): Set<string> {
  const keys = new Set<string>();
  for (const road of roads) {
    for (const segment of road.segments) {
      if (segment.kind !== kind) continue;
      keys.add(hexKey(segment.from));
      keys.add(hexKey(segment.to));
    }
  }
  return keys;
}

function getPoiLikeHexesForRegion(region: Region): AxialHex[] {
  const points = new Map<string, AxialHex>();
  points.set(hexKey(region.centerHex), region.centerHex);
  for (const poi of region.pointsOfInterest) points.set(hexKey(poi), poi);
  return Array.from(points.values());
}

function getWildTrailPoints(options: {
  region: Region;
  regions: Region[];
  roads: Road[];
  hexTerrainByKey: Map<string, HexTerrainData>;
}): WildTrailPoint[] {
  const { region, regions, roads, hexTerrainByKey } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const neighboringHexKeys = new Set<string>();
  for (const hex of region.hexes) {
    for (const neighbor of getHexNeighbors(hex)) {
      const neighborKey = hexKey(neighbor);
      if (!regionKeys.has(neighborKey)) neighboringHexKeys.add(neighborKey);
    }
  }

  const roadHexKeys = getRoadHexKeysByKind(roads, 'road');
  const pointsByKey = new Map<string, WildTrailPoint>();
  const allRegions = [region, ...regions.filter((otherRegion) => otherRegion.id !== region.id)];

  for (const sourceRegion of allRegions) {
    for (const point of getPoiLikeHexesForRegion(sourceRegion)) {
      const pointKey = hexKey(point);
      const isInsideRegion = regionKeys.has(pointKey);
      if (!isInsideRegion && !neighboringHexKeys.has(pointKey)) continue;
      if (roadHexKeys.has(pointKey)) continue;
      if (isLakeHex(point, hexTerrainByKey)) continue;
      pointsByKey.set(pointKey, { hex: point, isInsideRegion });
    }
  }

  return Array.from(pointsByKey.values());
}

function pathStepCrossesRiver(from: AxialHex, to: AxialHex, riverFullnessByEdge: Map<string, RiverFullness>): boolean {
  const sharedEdge = getSharedHexEdgeVertexKeys(from, to);
  if (!sharedEdge) return false;
  const edge = sharedEdge[0] < sharedEdge[1] ? `${sharedEdge[0]}|${sharedEdge[1]}` : `${sharedEdge[1]}|${sharedEdge[0]}`;
  return riverFullnessByEdge.has(edge);
}

function findWildTrailPath(options: {
  region: Region;
  from: AxialHex;
  target: AxialHex;
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
}): AxialHex[] | null {
  const { region, from, target, rivers, hexTerrainByKey } = options;
  const regionKeys = new Set(region.hexes.map(hexKey));
  const startKey = hexKey(from);
  const targetKey = hexKey(target);
  if (startKey === targetKey) return null;
  if (isLakeHex(from, hexTerrainByKey) || isLakeHex(target, hexTerrainByKey)) return null;

  const startInside = regionKeys.has(startKey);
  const targetInside = regionKeys.has(targetKey);
  if (!startInside && !targetInside) return null;

  const riverFullnessByEdge = getRiverCrossingFullnessByEdge(rivers);
  const queue: AxialHex[][] = [[from]];
  const visited = new Set<string>([startKey]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    const currentKey = hexKey(current);
    if (path.length > 1 && currentKey === targetKey) return path;

    for (const neighbor of shuffleArray(getHexNeighbors(current))) {
      const neighborKey = hexKey(neighbor);
      if (visited.has(neighborKey)) continue;
      const neighborIsTarget = neighborKey === targetKey;
      const neighborInsideRegion = regionKeys.has(neighborKey);
      if (!neighborIsTarget && !neighborInsideRegion) continue;
      if (isLakeHex(neighbor, hexTerrainByKey)) continue;
      if (pathStepCrossesRiver(current, neighbor, riverFullnessByEdge)) continue;
      visited.add(neighborKey);
      queue.push([...path, neighbor]);
    }
  }

  return null;
}

function canBuildStandaloneWildRegionRoad(region: Region): boolean {
  return region.sizeCategory === 'large_region' || region.sizeCategory === 'land' || region.sizeCategory === 'vast_land';
}

function getWildRegionTrailBuildCount(region: Region): number {
  return canBuildStandaloneWildRegionRoad(region) ? 2 : 1;
}

function buildWildRegionTrail(options: {
  region: Region;
  regions: Region[];
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  nextRoadId: number;
}): { roads: Road[]; nextRoadId: number } {
  const { region, regions, roads, rivers, hexTerrainByKey, nextRoadId } = options;
  const trailPoints = getWildTrailPoints({ region, regions, roads, hexTerrainByKey });
  if (trailPoints.length < 2) {
    console.log('Wild trail result', { regionId: region.id, built: false, reason: 'fewer than two eligible points', eligiblePointCount: trailPoints.length });
    return { roads, nextRoadId };
  }

  const pairCandidates: Array<{ start: WildTrailPoint; target: WildTrailPoint }> = [];
  for (let i = 0; i < trailPoints.length - 1; i += 1) {
    for (let j = i + 1; j < trailPoints.length; j += 1) {
      const start = trailPoints[i];
      const target = trailPoints[j];
      if (!start.isInsideRegion && !target.isInsideRegion) continue;
      pairCandidates.push({ start, target });
    }
  }

  for (const pair of shuffleArray(pairCandidates)) {
    const path = findWildTrailPath({ region, from: pair.start.hex, target: pair.target.hex, rivers, hexTerrainByKey });
    if (!path || roadPathCrossesRiver(path, rivers)) continue;
    const addResult = addTrailPathWithoutDuplicateSegments({ path, roads, regionId: region.id, nextRoadId });
    console.log('Wild trail result', {
      regionId: region.id,
      built: addResult.added,
      from: hexKey(pair.start.hex),
      target: hexKey(pair.target.hex),
      fromInsideRegion: pair.start.isInsideRegion,
      targetInsideRegion: pair.target.isInsideRegion,
      pathLength: path.length
    });
    if (addResult.added) return { roads: addResult.roads, nextRoadId: addResult.nextRoadId };
  }

  console.log('Wild trail result', { regionId: region.id, built: false, reason: 'no valid path', eligiblePointCount: trailPoints.length });
  return { roads, nextRoadId };
}

function buildWildRegionTrails(options: {
  region: Region;
  regions: Region[];
  roads: Road[];
  rivers: River[];
  hexTerrainByKey: Map<string, HexTerrainData>;
  nextRoadId: number;
}): { roads: Road[]; nextRoadId: number } {
  const { region, regions, rivers, hexTerrainByKey } = options;
  const trailBuildCount = getWildRegionTrailBuildCount(region);
  let builtRoads = options.roads;
  let nextRoadId = options.nextRoadId;

  for (let trailIndex = 0; trailIndex < trailBuildCount; trailIndex += 1) {
    const result = buildWildRegionTrail({
      region,
      regions,
      roads: builtRoads,
      rivers,
      hexTerrainByKey,
      nextRoadId
    });
    builtRoads = result.roads;
    nextRoadId = result.nextRoadId;
  }

  return { roads: builtRoads, nextRoadId };
}

function renderRoadSegments(roads: Road[], offsetX: number, offsetY: number): Array<{ key: string; x1: number; y1: number; x2: number; y2: number; kind: RoadKind }> {
  const result: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; kind: RoadKind }> = [];
  for (const road of roads) {
    for (let i = 0; i < road.segments.length; i += 1) {
      const s = road.segments[i];
      const p1 = toPixel(s.from.q, s.from.r);
      const p2 = toPixel(s.to.q, s.to.r);
      result.push({ key: `road-${road.id}-${i}`, x1: p1.x + offsetX, y1: p1.y + offsetY, x2: p2.x + offsetX, y2: p2.y + offsetY, kind: s.kind });
    }
  }
  return result;
}

function renderTrailDots(
  roadSegments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; kind: RoadKind }>
): Array<{ key: string; x: number; y: number }> {
  const dots: Array<{ key: string; x: number; y: number }> = [];
  const dotSpacing = 14;
  for (const segment of roadSegments) {
    if (segment.kind !== 'trail') continue;
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) continue;
    const dotCount = Math.max(2, Math.floor(length / dotSpacing) + 1);
    for (let i = 0; i < dotCount; i += 1) {
      const t = dotCount === 1 ? 0.5 : i / (dotCount - 1);
      dots.push({
        key: `${segment.key}-dot-${i}`,
        x: segment.x1 + dx * t,
        y: segment.y1 + dy * t
      });
    }
  }
  return dots;
}

function getLakeVertices(allHexes: AxialHex[], hexTerrainByKey: Map<string, HexTerrainData>): LakeVertex[] {
  const uniqueVertices = new Map<string, LakeVertex>();
  for (const hex of allHexes) {
    const terrain = hexTerrainByKey.get(hexKey(hex));
    if (terrain?.terrainOverride !== 'lake') continue;
    for (const vertex of getHexCornerPoints(hex)) {
      uniqueVertices.set(vertex.key, vertex);
    }
  }
  return Array.from(uniqueVertices.values());
}

function getLakeEdgeKeys(allHexes: AxialHex[], hexTerrainByKey: Map<string, HexTerrainData>): Set<string> {
  const edgeKeys = new Set<string>();
  for (const hex of allHexes) {
    const terrain = hexTerrainByKey.get(hexKey(hex));
    if (terrain?.terrainOverride !== 'lake') continue;
    for (const edge of getHexEdgesAsVertexPairs(hex)) {
      edgeKeys.add(edge.edgeKey);
    }
  }
  return edgeKeys;
}

function isLakeEdge(edge: string, lakeEdgeKeys: Set<string>): boolean {
  return lakeEdgeKeys.has(edge);
}

function drawLakeVerticesDebug(lakeVertices: LakeVertex[], offsetX: number, offsetY: number) {
  return lakeVertices.map((vertex) => ({
    key: `dbg-lake-vertex-${vertex.key}`,
    cx: vertex.x + offsetX,
    cy: vertex.y + offsetY
  }));
}
function generateRoadsForRegion(options: {
  region: Region; regions: Region[]; roads: Road[]; rivers: River[]; hexTerrainByKey: Map<string, HexTerrainData>; nextRoadId: number; candidateHexes: AxialHex[];
}): { roads: Road[]; nextRoadId: number } {
  const { region, regions, roads, hexTerrainByKey, rivers, candidateHexes } = options;
  const usedRoadPoiKeys = new Set<string>();
  let nextRoadId = options.nextRoadId;
  let built = cloneRoads(roads);
  const settled = region.biomeLandType === 'settled';
  if (!settled) {
    let builtAnyWildRoad = false;
    const incomingWildRoadEndpoints = findIncomingRoadEndpointsForRegion(region, built, hexTerrainByKey)
      .filter((incomingEndpoint) => !isSameHex(incomingEndpoint.entryHex, region.centerHex) && !isLakeHex(incomingEndpoint.entryHex, hexTerrainByKey));
    const incomingWildRoadCount = getUniqueIncomingRoadCount(incomingWildRoadEndpoints);
    const usedWildRoadEndpointKeys = new Set<string>();
    while (true) {
      const wildCandidate = chooseBestWildRoadCandidate(getWildRoadCandidates({ region, regions, roads: built, rivers, hexTerrainByKey, candidateHexes, usedEndpointKeys: usedWildRoadEndpointKeys }));
      if (!wildCandidate) break;
      const added = addWildRoadCandidateToExistingRoad({ candidate: wildCandidate, roads: built, region, hexTerrainByKey });
      console.log('Wild road result', {
        regionId: region.id,
        built: added,
        startRoadId: wildCandidate.startRoadId,
        targetRoadId: wildCandidate.targetRoadId ?? null,
        targetKind: wildCandidate.targetKind,
        crossedRiverCount: wildCandidate.crossedRiverCount,
        pathLength: wildCandidate.path.length
      });
      if (!added) break;
      usedWildRoadEndpointKeys.add(wildCandidate.startEndpointKey);
      usedWildRoadEndpointKeys.add(wildCandidate.targetEndpointKey);
      builtAnyWildRoad = true;
    }

    if (!builtAnyWildRoad && incomingWildRoadCount === 0 && canBuildStandaloneWildRegionRoad(region)) {
      const candidateRoad = chooseBestWildCandidateRoadCandidate(getWildCandidateRoadCandidates({ region, roads: built, rivers, hexTerrainByKey, candidateHexes }));
      if (candidateRoad) {
        const addResult = addWildCandidateRoadCandidate({ candidate: candidateRoad, roads: built, region, hexTerrainByKey, nextRoadId });
        built = addResult.roads;
        nextRoadId = addResult.nextRoadId;
        builtAnyWildRoad = addResult.added;
        console.log('Wild candidate road result', {
          regionId: region.id,
          built: addResult.added,
          crossedRiverCount: candidateRoad.crossedRiverCount,
          pathLength: candidateRoad.path.length
        });
      }
    }

    if (!builtAnyWildRoad) {
      console.log('Wild road result', {
        regionId: region.id,
        built: false,
        reason: incomingWildRoadCount === 0
          ? (canBuildStandaloneWildRegionRoad(region) ? 'fewer than two candidate road endpoints' : 'standalone wild roads are only built for large regions and lands')
          : 'fewer than two incoming road endpoints or no valid cross-region road target'
      });
    }
    return buildWildRegionTrails({
      region,
      regions,
      roads: built,
      rivers,
      hexTerrainByKey,
      nextRoadId
    });
  }
  const finalizeSettledRoads = (result: { roads: Road[]; nextRoadId: number }) => normalizeSettledRegionRoadIds({ region, roads: result.roads, nextRoadId: result.nextRoadId });

  const boundaryHexes = getBoundaryHexes(region);
  const incoming = findIncomingRoadEndpointsForRegion(region, roads, hexTerrainByKey, true);
  const addRoadFromPath = (path: AxialHex[], kind: RoadKind, allowedRoadHexes: AxialHex[] = [], allowedDuplicateHexKeys = new Set<string>()) => {
    if (kind === 'trail' && roadPathCrossesRiver(path, rivers)) return false;
    if (!canAddRoadPath({ path, roads: built, region, hexTerrainByKey, allowedRoadHexes, allowedDuplicateHexKeys })) return false;
    const segs: RoadSegment[] = [];
    for (let i = 1; i < path.length; i += 1) segs.push({ from: path[i - 1], to: path[i], kind });
    built.push({ id: nextRoadId, regionId: region.id, segments: segs });
    nextRoadId += 1;
    return true;
  };
  const usedIncomingRoadIds = new Set<number>();
  let firstIncomingEntryHex: AxialHex | null = null;
  const buildBestIncomingRoadToTargets = (targetHexes: AxialHex[], logLabel: string): SettledIncomingRoadCandidate | null => {
    const candidates = incoming
      .filter((inc) => !usedIncomingRoadIds.has(inc.roadId))
      .flatMap((inc) => collectSettledIncomingRoadPathsToTarget({
        region,
        incoming: inc,
        targetHexes,
        roads: built,
        rivers,
        hexTerrainByKey,
        usedRoadPoiKeys,
        maxAlternatives: 6
      }));
    const best = chooseBestSettledIncomingRoadCandidate(candidates);
    if (!best) {
      console.log(logLabel, { regionId: region.id, built: false, reason: 'no valid incoming road path' });
      return null;
    }

    const added = addRoadFromPath(best.extendedPath, 'road', [best.incoming.endpointHex, best.incoming.entryHex, best.targetHex]);
    console.log(logLabel, {
      regionId: region.id,
      built: added,
      incomingRoadId: best.incoming.roadId,
      incomingRoadHex: hexKey(best.incoming.endpointHex),
      entryHex: hexKey(best.incoming.entryHex),
      targetHex: hexKey(best.targetHex),
      touchedPoiCount: best.touchedPoiCount,
      crossedRiverCount: best.crossedRiverCount,
      pathLength: best.extendedPath.length
    });
    if (!added) return null;

    usedIncomingRoadIds.add(best.incoming.roadId);
    if (!firstIncomingEntryHex) firstIncomingEntryHex = best.incoming.entryHex;
    markPoiOnPathAsUsed(best.extendedPath, region, usedRoadPoiKeys);
    return best;
  };

  const getSupplementalRoadStartHexes = (anchorHex: AxialHex, excludeHexKeys = new Set<string>()) => {
    const roadHexKeys = getRoadHexKeys(built);
    const uniqueStarts = new Map<string, AxialHex>();
    for (const hex of [...getUnusedPoiTargets(region, usedRoadPoiKeys, hexTerrainByKey), ...region.hexes]) {
      const key = hexKey(hex);
      if (uniqueStarts.has(key)) continue;
      if (excludeHexKeys.has(key)) continue;
      if (isSameHex(hex, region.centerHex)) continue;
      if (isLakeHex(hex, hexTerrainByKey)) continue;
      if (roadHexKeys.has(key)) continue;
      uniqueStarts.set(key, hex);
    }
    return Array.from(uniqueStarts.values()).sort((a, b) => hexDistance(b, anchorHex) - hexDistance(a, anchorHex));
  };

  const collectDirectSupplementalCandidates = (options: {
    startHexes: AxialHex[];
    targetHexes: AxialHex[];
    anchorHex: AxialHex;
    maxAlternatives: number;
  }): SupplementalSettledRoadCandidate[] => {
    const candidates: SupplementalSettledRoadCandidate[] = [];
    const uniqueTargets = options.targetHexes.filter((targetHex, index, allTargets) => allTargets.findIndex((other) => hexKey(other) === hexKey(targetHex)) === index);
    for (const startHex of options.startHexes) {
      for (const targetHex of uniqueTargets) {
        if (isSameHex(startHex, targetHex)) continue;
        const basePaths = findAlternativeRoadPathsWithinRegion({
          region,
          from: startHex,
          target: targetHex,
          roads: built,
          hexTerrainByKey,
          maxAlternatives: options.maxAlternatives
        });
        for (const basePath of basePaths) {
          if (!canAddRoadPath({ path: basePath, roads: built, region, hexTerrainByKey, allowedRoadHexes: [startHex, targetHex] })) continue;
          const touchedPoiKeys = getPoiKeysOnRoadPath(basePath, region);
          const touchedPoiCount = Array.from(touchedPoiKeys).filter((key) => !usedRoadPoiKeys.has(key)).length;
          candidates.push({
            startHex,
            anchorDistance: hexDistance(startHex, options.anchorHex),
            basePath,
            extendedPath: basePath,
            targetHex,
            targetIsPoi: isPointOfInterestHex(targetHex, region),
            crossedRiverCount: countRoadPathRiverCrossings(basePath, rivers),
            touchedPoiCount,
            touchedPoiKeys
          });
        }
      }
    }
    return candidates;
  };

  const buildSupplementalRoadToCenter = (anchorHex: AxialHex, logLabel: string): boolean => {
    const candidates = collectDirectSupplementalCandidates({
      startHexes: getSupplementalRoadStartHexes(anchorHex, new Set([hexKey(region.centerHex)])),
      targetHexes: [region.centerHex],
      anchorHex,
      maxAlternatives: 6
    });
    const best = chooseBestSupplementalSettledRoadCandidate(candidates);
    if (!best) {
      console.log(logLabel, { regionId: region.id, built: false, reason: 'no valid supplemental center road path' });
      return false;
    }
    const added = addRoadFromPath(best.extendedPath, 'road', [best.startHex, region.centerHex]);
    console.log(logLabel, {
      regionId: region.id,
      built: added,
      startHex: hexKey(best.startHex),
      targetHex: hexKey(region.centerHex),
      anchorDistance: best.anchorDistance,
      touchedPoiCount: best.touchedPoiCount,
      crossedRiverCount: best.crossedRiverCount,
      pathLength: best.extendedPath.length
    });
    if (!added) return false;
    markPoiOnPathAsUsed(best.extendedPath, region, usedRoadPoiKeys);
    return true;
  };

  const buildSupplementalRoadToExistingRoad = (anchorHex: AxialHex, logLabel: string): boolean => {
    const roadTargets = getRoadHexesInRegion(region, built).filter((hex) => !isLakeHex(hex, hexTerrainByKey));
    const availableStartHexes = getSupplementalRoadStartHexes(anchorHex);
    const collectStartHexes = (borderHexes: AxialHex[]) => borderHexes
      .filter((hex) => availableStartHexes.some((startHex) => isSameHex(startHex, hex)))
      .filter((hex) => !isAdjacentToRoadHex(hex, built));
    const startHexes = collectStartHexes(getCandidateFacingRegionBorderHexes(region, candidateHexes));
    const candidates = collectDirectSupplementalCandidates({ startHexes, targetHexes: roadTargets, anchorHex, maxAlternatives: 6 });
    const best = chooseBestSupplementalSettledRoadCandidate(candidates);
    if (!best) {
      console.log(logLabel, { regionId: region.id, built: false, reason: 'no valid supplemental road-to-road path' });
      return false;
    }
    const added = addRoadFromPath(best.extendedPath, 'road', [best.startHex, best.targetHex]);
    console.log(logLabel, {
      regionId: region.id,
      built: added,
      startHex: hexKey(best.startHex),
      targetHex: hexKey(best.targetHex),
      anchorDistance: best.anchorDistance,
      touchedPoiCount: best.touchedPoiCount,
      crossedRiverCount: best.crossedRiverCount,
      pathLength: best.extendedPath.length
    });
    if (!added) return false;
    markPoiOnPathAsUsed(best.extendedPath, region, usedRoadPoiKeys);
    return true;
  };

  const enforceSettledRoadMinimum = (anchorHex: AxialHex) => {
    const centerRoadMinimum = Math.min(2, getSettledMainRoadLimit(region));
    while (getRoadBuildCountForSettledRegion(region, built) < centerRoadMinimum) {
      if (!buildSupplementalRoadToCenter(anchorHex, 'Supplemental settled center road result')) break;
    }
    while (getRoadBuildCountForSettledRegion(region, built) < getSettledMainRoadLimit(region)) {
      if (!buildSupplementalRoadToExistingRoad(anchorHex, 'Supplemental settled road-to-road result')) break;
    }
  };

  if (incoming.length > 0) {
    buildBestIncomingRoadToTargets([region.centerHex], 'First settled incoming road result');
    buildBestIncomingRoadToTargets([region.centerHex], 'Second settled incoming road result');

    while (getRoadBuildCountForSettledRegion(region, built) < getSettledMainRoadLimit(region)) {
      const roadTargets = getRoadHexesInRegion(region, built)
        .filter((hex) => !isLakeHex(hex, hexTerrainByKey))
        .filter((hex) => !isSameHex(hex, region.centerHex));
      if (roadTargets.length === 0) break;
      if (!buildBestIncomingRoadToTargets(roadTargets, 'Additional settled incoming road result')) break;
    }

    enforceSettledRoadMinimum(firstIncomingEntryHex ?? region.centerHex);
    return finalizeSettledRoads(connectRemainingPoiWithTrails({ region, roads: built, rivers, hexTerrainByKey, nextRoadId }));
  }
  if (incoming.length === 0) {
    const maxCandidates = 3;
    const firstPoiTargets = getUnusedPoiTargets(region, usedRoadPoiKeys, hexTerrainByKey).sort((a, b) => hexDistance(b, region.centerHex) - hexDistance(a, region.centerHex));
    const firstFallbackTargets = getAvailableRoadFallbackHexes({ region, fromHex: region.centerHex, roads: built, hexTerrainByKey, usedRoadPoiKeys, excludeHexKeys: new Set([hexKey(region.centerHex)]) });
    let firstBest: RoadCandidatePath | null = null;
    for (const targetPoi of firstPoiTargets) {
      const candidates = collectAlternativeRoadPathsToTarget({ region, fromHex: region.centerHex, targetHex: targetPoi, targetIsPoi: true, roads: built, rivers, hexTerrainByKey, usedRoadPoiKeys, maxAlternatives: maxCandidates });
      firstBest = chooseBestRoadCandidate(candidates);
      if (firstBest) break;
    }
    if (!firstBest) {
      for (const fallbackHex of firstFallbackTargets) {
        const candidates = collectAlternativeRoadPathsToTarget({ region, fromHex: region.centerHex, targetHex: fallbackHex, targetIsPoi: false, roads: built, rivers, hexTerrainByKey, usedRoadPoiKeys, maxAlternatives: maxCandidates });
        firstBest = chooseBestRoadCandidate(candidates);
        if (firstBest) break;
      }
    }
    if (!firstBest) {
      enforceSettledRoadMinimum(region.centerHex);
      return finalizeSettledRoads(connectRemainingPoiWithTrails({ region, roads: built, rivers, hexTerrainByKey, nextRoadId }));
    }
    if (addRoadFromPath(firstBest.extendedPath, 'road', [region.centerHex, firstBest.targetHex, firstBest.extendedPath[firstBest.extendedPath.length - 1]], new Set([hexKey(firstBest.targetHex)]))) {
      markPoiOnPathAsUsed(firstBest.extendedPath, region, usedRoadPoiKeys);
    } else {
      enforceSettledRoadMinimum(region.centerHex);
      return finalizeSettledRoads(connectRemainingPoiWithTrails({ region, roads: built, rivers, hexTerrainByKey, nextRoadId }));
    }
    const firstAnchorHex = firstBest.targetHex;
    const firstPathKeys = new Set(firstBest.extendedPath.map(hexKey).filter((key) => key !== hexKey(region.centerHex)));
    const secondPoiTargets = getUnusedPoiTargets(region, usedRoadPoiKeys, hexTerrainByKey)
      .filter((poi) => !firstPathKeys.has(hexKey(poi)))
      .sort((a, b) => hexDistance(b, firstAnchorHex) - hexDistance(a, firstAnchorHex));
    const secondFallbackTargets = getAvailableRoadFallbackHexes({ region, fromHex: firstAnchorHex, roads: built, hexTerrainByKey, usedRoadPoiKeys, excludeHexKeys: new Set([hexKey(region.centerHex), ...Array.from(firstPathKeys)]) });
    let secondBest: RoadCandidatePath | null = null;
    for (const targetPoi of secondPoiTargets) {
      const candidates = collectAlternativeRoadPathsToTarget({ region, fromHex: region.centerHex, targetHex: targetPoi, targetIsPoi: true, roads: built, rivers, hexTerrainByKey, usedRoadPoiKeys, maxAlternatives: maxCandidates });
      secondBest = chooseBestRoadCandidate(candidates);
      if (secondBest) break;
    }
    if (!secondBest) {
      for (const fallbackHex of secondFallbackTargets) {
        const candidates = collectAlternativeRoadPathsToTarget({ region, fromHex: region.centerHex, targetHex: fallbackHex, targetIsPoi: false, roads: built, rivers, hexTerrainByKey, usedRoadPoiKeys, maxAlternatives: maxCandidates });
        secondBest = chooseBestRoadCandidate(candidates);
        if (secondBest) break;
      }
    }
    if (secondBest && addRoadFromPath(secondBest.extendedPath, 'road', [region.centerHex, secondBest.targetHex, secondBest.extendedPath[secondBest.extendedPath.length - 1]], new Set([hexKey(secondBest.targetHex)]))) {
      markPoiOnPathAsUsed(secondBest.extendedPath, region, usedRoadPoiKeys);
    }
    const largeRegionLabels = new Set<Region['sizeLabel']>(['Большой регион', 'Край', 'Обширный край']);
    if (largeRegionLabels.has(region.sizeLabel)) {
      const existingRoadHexKeys = getRoadHexKeys(built);
      const borderHexCandidates = getRegionBorderHexes(region)
        .filter((hex) => {
          const key = hexKey(hex);
          if (isSameHex(hex, region.centerHex)) return false;
          if (isLakeHex(hex, hexTerrainByKey)) return false;
          if (existingRoadHexKeys.has(key)) return false;
          if (isAdjacentToRoadHex(hex, built)) return false;
          return true;
        })
        .sort((a, b) => hexDistance(b, region.centerHex) - hexDistance(a, region.centerHex));
      const roadHexCandidates = getRoadHexesInRegion(region, built)
        .filter((hex) => !isLakeHex(hex, hexTerrainByKey));

      const thirdCandidates: RoadCandidatePath[] = [];
      for (const borderHex of borderHexCandidates) {
        const sortedRoadHexCandidates = [...roadHexCandidates].sort((a, b) => hexDistance(a, borderHex) - hexDistance(b, borderHex));
        for (const roadHex of sortedRoadHexCandidates) {
          if (thirdCandidates.length >= 10) break;
          const basePath = findRoadPathWithinRegion({
            region,
            from: borderHex,
            targets: [roadHex],
            roads: built,
            hexTerrainByKey,
            allowRoadHexes: [roadHex]
          });
          if (!basePath) continue;
          if (!canAddRoadPath({ path: basePath, roads: built, region, hexTerrainByKey, allowedRoadHexes: [borderHex, roadHex] })) continue;
          const touchedPoiKeys = getPoiKeysOnRoadPath(basePath, region);
          const touchedPoiCount = Array.from(touchedPoiKeys).filter((key) => !usedRoadPoiKeys.has(key)).length;
          thirdCandidates.push({
            basePath,
            extendedPath: basePath,
            targetHex: roadHex,
            targetIsPoi: isPointOfInterestHex(roadHex, region),
            crossedRiverCount: countRoadPathRiverCrossings(basePath, rivers),
            touchedPoiCount,
            touchedPoiKeys
          });
        }
        if (thirdCandidates.length >= 10) break;
      }
      const thirdBest = chooseBestThirdRoadCandidate(thirdCandidates);
      if (thirdBest) {
        const borderHex = thirdBest.extendedPath[0];
        const roadHex = thirdBest.extendedPath[thirdBest.extendedPath.length - 1];
        const borderEndIsRegionBorder = getRegionBorderHexes(region).some((hex) => isSameHex(hex, borderHex));
        const roadEndHasExistingRoad = hexHasRoad(roadHex, built);
        const preBuildBorderAdjacentToRoad = isAdjacentToRoadHex(borderHex, built);
        const pathHasLake = thirdBest.extendedPath.some((hex) => isLakeHex(hex, hexTerrainByKey));
        const isValid = borderEndIsRegionBorder && !isLakeHex(borderHex, hexTerrainByKey) && !preBuildBorderAdjacentToRoad && roadEndHasExistingRoad && !pathHasLake;
        if (isValid) {
          const added = addRoadFromPath(thirdBest.extendedPath, 'road', [borderHex, roadHex]);
          console.log('Third settled road result', {
            regionId: region.id,
            built: added,
            borderEnd: hexKey(borderHex),
            roadEnd: hexKey(roadHex),
            touchedPoiCount: thirdBest.touchedPoiCount,
            crossedRiverCount: thirdBest.crossedRiverCount,
            pathLength: thirdBest.extendedPath.length,
            borderEndIsRegionBorder,
            roadEndHasExistingRoad
          });
          if (added) markPoiOnPathAsUsed(thirdBest.extendedPath, region, usedRoadPoiKeys);
        } else {
          console.warn('Third settled road validation failed', {
            regionId: region.id,
            borderEnd: hexKey(borderHex),
            roadEnd: hexKey(roadHex),
            borderEndIsRegionBorder,
            roadEndHasExistingRoad,
            preBuildBorderAdjacentToRoad,
            pathHasLake
          });
          console.log('Third settled road result', {
            regionId: region.id,
            built: false,
            borderEnd: hexKey(borderHex),
            roadEnd: hexKey(roadHex),
            touchedPoiCount: thirdBest.touchedPoiCount,
            crossedRiverCount: thirdBest.crossedRiverCount,
            pathLength: thirdBest.extendedPath.length,
            borderEndIsRegionBorder,
            roadEndHasExistingRoad
          });
        }
      } else {
        console.log('Third settled road result', {
          regionId: region.id,
          built: false,
          borderEnd: null,
          roadEnd: null,
          touchedPoiCount: 0,
          crossedRiverCount: 0,
          pathLength: 0,
          borderEndIsRegionBorder: false,
          roadEndHasExistingRoad: false
        });
      }
    }
    enforceSettledRoadMinimum(firstAnchorHex ?? region.centerHex);
    return finalizeSettledRoads(connectRemainingPoiWithTrails({ region, roads: built, rivers, hexTerrainByKey, nextRoadId }));
  }
  let attempts = 0;
  while (countRoadSegmentsTouchingHex(region.centerHex, built) < 2 && attempts < 10) {
    attempts += 1;
    const roadHexes = getRoadHexKeys(built);
    const poiKeys = new Set(region.pointsOfInterest.map((poi) => hexKey(poi)));
    const freePoiTargets = getUnusedPoiTargets(region, usedRoadPoiKeys, hexTerrainByKey)
      .filter((h) => !isSameHex(h, region.centerHex));
    const freeHexTargets = region.hexes
      .filter((h) => !roadHexes.has(hexKey(h)) && !isSameHex(h, region.centerHex) && !poiKeys.has(hexKey(h)) && !isLakeHex(h, hexTerrainByKey));
    const candidateTargets = [...freePoiTargets, ...freeHexTargets]
      .filter((h, i, arr) => arr.findIndex((x) => hexKey(x) === hexKey(h)) === i)
      .sort((a, b) => hexDistance(a, region.centerHex) - hexDistance(b, region.centerHex));
    let added = false;
    for (const mid of candidateTargets) {
      const p1 = findRoadPathWithinRegion({ region, from: region.centerHex, targets: [mid], roads: built, hexTerrainByKey, allowRoadHexes: [region.centerHex, mid] });
      if (!p1) continue;
      const temporaryRoads = [...built, { id: -1, regionId: region.id, segments: p1.slice(1).map((h, i) => ({ from: p1[i], to: h, kind: 'road' as RoadKind })) }];
      const p2 = findRoadPathWithinRegion({ region, from: mid, targets: boundaryHexes, roads: temporaryRoads, hexTerrainByKey, allowRoadHexes: [region.centerHex, mid] });
      if (!p2) continue;
      const combined = [...p1, ...p2.slice(1)];
      if (addRoadFromPath(combined, 'road', [region.centerHex, mid, p2[p2.length - 1]], new Set([hexKey(mid)]))) {
        if (isPointOfInterestHex(mid, region)) usedRoadPoiKeys.add(hexKey(mid));
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return finalizeSettledRoads(connectRemainingPoiWithTrails({ region, roads: built, rivers, hexTerrainByKey, nextRoadId }));
}

export function App() {
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const mapToolbarRef = useRef<HTMLDivElement | null>(null);
  const jsonImportInputRef = useRef<HTMLInputElement | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [candidateHexes, setCandidateHexes] = useState<AxialHex[]>([]);
  const [rivers, setRivers] = useState<River[]>([]);
  const [roads, setRoads] = useState<Road[]>([]);
  const [selectedHex, setSelectedHex] = useState<AxialHex | null>(START_HEX);
  const [debugRivers, setDebugRivers] = useState(false);
  const [hexTerrainByKey, setHexTerrainByKey] = useState<Map<string, HexTerrainData>>(new Map());
  const [nextLakeId, setNextLakeId] = useState(1);
  const [nextRoadId, setNextRoadId] = useState(1);
  // Стек снимков состояния карты: один снимок на каждый добавленный регион.
  const [history, setHistory] = useState<MapSnapshot[]>([]);
  // Отложенная перегенерация: ставим заявку, ждём пока React применит
  // восстановленный снимок, и только потом генерируем регион заново.
  const [pendingRegen, setPendingRegen] = useState<{ anchorHex: AxialHex; options: GenerationOptions } | null>(null);
  // Параметры ручной генерации ('auto' — прежнее случайное поведение).
  const [genSizeCategory, setGenSizeCategory] = useState<'auto' | Region['sizeCategory']>('auto');
  const [genLandType, setGenLandType] = useState<'auto' | BiomeLandType>('auto');
  const [genBiome, setGenBiome] = useState<'auto' | BiomeId>('auto');
  const [genCoastal, setGenCoastal] = useState<'auto' | CoastalPreference>('mainland');
  // Режим ручной "кисти берега": клик по гексу кромки делает его морем и обратно.
  const [seaBrushActive, setSeaBrushActive] = useState(false);
  const [clickPromptCandidateKey, setClickPromptCandidateKey] = useState<string | null>(null);

  const allRegionHexes = useMemo(() => regions.flatMap((region) => region.hexes), [regions]);

  const metadataMap = useMemo(() => {
    const map = new Map<string, HexMeta>();
    for (const region of regions) {
      for (const hex of region.hexes) {
        const key = hexKey(hex);
        map.set(key, {
          regionId: region.id,
          isCenter: hexKey(region.centerHex) === key,
          isAnchor: hexKey(region.anchorHex) === key
        });
      }
    }
    return map;
  }, [regions]);

  const positionedHexes = useMemo(() => {
    const isStartPromptVisible = allRegionHexes.length === 0 && candidateHexes.length === 0;
    // Гексы-море берутся из карты terrain-данных (они не принадлежат ни одному региону).
    // Защита: если гекс почему-то числится и регионом, и морем (старые данные/импорт),
    // он считается сушей — море на гексе региона не рисуется.
    const regionHexKeySet = new Set(allRegionHexes.map(hexKey));
    const seaHexList: AxialHex[] = [];
    for (const [key, terrain] of hexTerrainByKey) {
      if (terrain.terrainOverride === 'sea' && !regionHexKeySet.has(key)) seaHexList.push(parseHexKey(key));
    }
    const all = [
      ...allRegionHexes.map((hex) => ({ ...hex, kind: 'region' as const })),
      ...seaHexList.map((hex) => ({ ...hex, kind: 'sea' as const })),
      ...candidateHexes.map((hex) => ({ ...hex, kind: 'candidate' as const }))
    ];
    if (all.length === 0) {
      all.push({ ...START_HEX, kind: 'candidate' as const });
    }

    const withPixels = all.map((hex) => ({ ...hex, ...toPixel(hex.q, hex.r), key: hexKey(hex), regionId: metadataMap.get(hexKey(hex))?.regionId }));
    const minX = Math.min(...withPixels.map((h) => h.x));
    const maxX = Math.max(...withPixels.map((h) => h.x));
    const minY = Math.min(...withPixels.map((h) => h.y));
    const maxY = Math.max(...withPixels.map((h) => h.y));
    const hexWidth = HEX_SIZE * SQRT3;
    const hexHeight = HEX_SIZE * 2;
    const promptPadding = isStartPromptVisible ? START_PROMPT_HEX_PADDING : 0;
    const offsetX = -minX + hexWidth / 2 + promptPadding;
    const offsetY = -minY + HEX_SIZE + promptPadding;

    return {
      width: maxX - minX + hexWidth + promptPadding * 2,
      height: maxY - minY + hexHeight + promptPadding * 2,
      hexes: withPixels.map((h) => ({ ...h, x: h.x + offsetX, y: h.y + offsetY }))
    };
  }, [allRegionHexes, candidateHexes, metadataMap, hexTerrainByKey]);

  useEffect(() => {
    if (regions.length < 1 || regions.length > 2 || candidateHexes.length === 0) {
      setClickPromptCandidateKey(null);
      return;
    }

    const pickRandomCandidateKey = (previousKey: string | null = null) => {
      const candidateKeys = candidateHexes.map(hexKey);
      const availableKeys = candidateKeys.length > 1
        ? candidateKeys.filter((candidateKey) => candidateKey !== previousKey)
        : candidateKeys;
      return availableKeys[Math.floor(Math.random() * availableKeys.length)] ?? null;
    };

    setClickPromptCandidateKey((previousKey) => pickRandomCandidateKey(previousKey));
    const intervalId = window.setInterval(() => {
      setClickPromptCandidateKey((previousKey) => pickRandomCandidateKey(previousKey));
    }, CLICK_PROMPT_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [regions.length, candidateHexes]);

  const lakeVertices = useMemo(() => getLakeVertices(allRegionHexes, hexTerrainByKey), [allRegionHexes, hexTerrainByKey]);
  const lakeEdgeKeys = useMemo(() => getLakeEdgeKeys(allRegionHexes, hexTerrainByKey), [allRegionHexes, hexTerrainByKey]);

  const riverSegments = useMemo(() => {
    const all = positionedHexes.hexes;
    if (all.length === 0) return [];
    const minBaseX = Math.min(...all.map((h) => toPixel(h.q, h.r).x));
    const minBaseY = Math.min(...all.map((h) => toPixel(h.q, h.r).y));
    const offsetX = (HEX_SIZE * SQRT3) / 2 - minBaseX;
    const offsetY = HEX_SIZE - minBaseY;
    return rivers.flatMap((river) => renderRiverSegments(river, offsetX, offsetY, lakeEdgeKeys));
  }, [positionedHexes, rivers, lakeEdgeKeys]);
  const riverDirectionArrows = useMemo(() => {
    const all = positionedHexes.hexes;
    if (all.length === 0) return [];
    const minBaseX = Math.min(...all.map((h) => toPixel(h.q, h.r).x));
    const minBaseY = Math.min(...all.map((h) => toPixel(h.q, h.r).y));
    const offsetX = (HEX_SIZE * SQRT3) / 2 - minBaseX;
    const offsetY = HEX_SIZE - minBaseY;
    return rivers.flatMap((river) => renderRiverDirectionArrows(river, offsetX, offsetY, lakeEdgeKeys));
  }, [positionedHexes, rivers, lakeEdgeKeys]);
  const roadSegments = useMemo(() => {
    const all = positionedHexes.hexes;
    if (all.length === 0) return [];
    const minBaseX = Math.min(...all.map((h) => toPixel(h.q, h.r).x));
    const minBaseY = Math.min(...all.map((h) => toPixel(h.q, h.r).y));
    return renderRoadSegments(roads, (HEX_SIZE * SQRT3) / 2 - minBaseX, HEX_SIZE - minBaseY);
  }, [positionedHexes, roads]);
  const trailDots = useMemo(() => renderTrailDots(roadSegments), [roadSegments]);

  const riverOffset = useMemo(() => {
    const all = positionedHexes.hexes;
    if (all.length === 0) return { x: 0, y: 0 };
    const minBaseX = Math.min(...all.map((h) => toPixel(h.q, h.r).x));
    const minBaseY = Math.min(...all.map((h) => toPixel(h.q, h.r).y));
    return { x: (HEX_SIZE * SQRT3) / 2 - minBaseX, y: HEX_SIZE - minBaseY };
  }, [positionedHexes]);
  const lakeVerticesDebug = useMemo(
    () => drawLakeVerticesDebug(lakeVertices, riverOffset.x, riverOffset.y),
    [lakeVertices, riverOffset.x, riverOffset.y]
  );

  const riverGraphsByRegion = useMemo(() => {
    const map = new Map<number, RiverGraph>();
    for (const region of regions) {
      try {
        map.set(region.id, buildRiverGraphForRegion(region.hexes, region.hexes, candidateHexes));
      } catch {
        // debug only
      }
    }
    return map;
  }, [regions, candidateHexes]);

  const candidateBoundaryDebugByRegion = useMemo(() => {
    const map = new Map<number, { edges: HexEdge[]; vertices: RiverVertex[]; invalidVertices: RiverVertex[]; edgeKeys: string[]; vertexKeys: string[] }>();
    for (const region of regions) {
      const edges = getCandidateBoundaryEdgesForRegion(region.hexes, candidateHexes);
      const vertices = getCandidateBoundaryVerticesForRegion(region.hexes, candidateHexes);
      const invalidVertices = validateCandidateBoundaryVertices(region.hexes, candidateHexes, vertices);
      map.set(region.id, {
        edges,
        vertices,
        invalidVertices,
        edgeKeys: edges.map((edge) => edge.edgeKey),
        vertexKeys: vertices.map((vertex) => vertex.key)
      });
    }
    return map;
  }, [regions, candidateHexes]);

  const addRegionToMap = (anchorHex: AxialHex, options: GenerationOptions = {}) => {
    const maxRegionAttempts = 30;
    const autoCoastRoll = Math.random();
    for (let attempt = 0; attempt < maxRegionAttempts; attempt += 1) {
      const targetSize = options.targetSize ?? rollRegionTargetSize();
      const occupiedHexes = new Set(allRegionHexes.map(hexKey));
      // Море — не суша: рост региона не должен захватывать гексы моря.
      for (const seaKey of getSeaHexKeys(hexTerrainByKey)) occupiedHexes.add(seaKey);
      const regionId = Math.max(0, ...regions.map((region) => region.id)) + 1;
      const regionHexes = generateConnectedRegionFromAnchor(anchorHex, targetSize, occupiedHexes);
      const finalSize = regionHexes.length;
      const { sizeCategory, sizeLabel } = getRegionSizeCategory(finalSize);
      const centerHex = chooseRegionCenter(regionHexes);
      const regionByHexKey = new Map<string, Region>();
      for (const region of regions) {
        for (const hex of region.hexes) regionByHexKey.set(hexKey(hex), region);
      }
      const adjacentBiomeIds = getAdjacentRegionBiomes(regionHexes, regionByHexKey);
      const nextAllHexesPreview = [...allRegionHexes, ...regionHexes];
      const nextCandidateHexesPreview = getCandidateHexes(nextAllHexesPreview);
      const candidateRegionForTopologyCheck: Region = {
        id: regionId,
        hexes: regionHexes,
        centerHex,
        anchorHex,
        targetSize,
        finalSize,
        sizeCategory,
        sizeLabel,
        biomeLandType: 'wild',
        heightLevel: 1,
        biomeId: FALLBACK_BIOME_ID,
        biomeLabel: BIOMES[FALLBACK_BIOME_ID].label,
        biomePrimaryEmoji: BIOMES[FALLBACK_BIOME_ID].primaryEmoji,
        biomeSecondaryEmojis: [...BIOMES[FALLBACK_BIOME_ID].secondaryEmojis],
        biomeEmojiLabel: BIOMES[FALLBACK_BIOME_ID].primaryEmoji + BIOMES[FALLBACK_BIOME_ID].secondaryEmojis.join(''),
        pointsOfInterest: []
      };
      const candidateRiverGraph = buildRiverGraphForRegion(
        candidateRegionForTopologyCheck.hexes,
        candidateRegionForTopologyCheck.hexes,
        nextCandidateHexesPreview
      );
      const touchingEndpoints = findRiverEndpointsTouchingRegion(
        candidateRegionForTopologyCheck,
        rivers,
        candidateRiverGraph
      );
      const existingSeaKeys = getSeaHexKeys(hexTerrainByKey);
      const forcedCoastContinuation = regionForcesCoastContinuation(regionHexes, existingSeaKeys);
      const hasOutgoingRiverToExistingRegion = regionHasOutgoingRiverToExistingRegion(touchingEndpoints);
      if (options.coastalPreference === 'coast' && hasOutgoingRiverToExistingRegion) {
        console.warn('Discarding coastal candidate region because it has outgoing river to existing region', { attempt, regionId });
        return;
      }
      const isCoastalRegion =
        options.coastalPreference === 'coast' ? true
        : options.coastalPreference === 'mainland' ? false
        : forcedCoastContinuation ? true
        : hasOutgoingRiverToExistingRegion ? false
        : regions.length === 0 ? autoCoastRoll < START_REGION_AUTO_COAST_PROBABILITY
        : autoCoastRoll < coastProbabilityFromSpan(computeMapMaxSpanTiles(allRegionHexes));
      // Прибрежный регион тяготеет к низинам (уровень моря).
      const effectiveCoastalPreference: CoastalPreference | undefined =
        options.coastalPreference ?? (isCoastalRegion ? 'coast' : undefined);
      const biomeLandType = options.landType ?? chooseCoastalAwareLandType(isCoastalRegion);
      // Выбор биома: либо принудительно заданный пользователем, либо обычный
      // взвешенный выбор. Принудительный биом всё равно проверяется на
      // совместимость с ограничением высоты от рек.
      const pickBiome = (constraint: RiverHeightConstraint): ChooseBiomeResult => {
        if (options.biomeId) {
          return isBiomeAllowedByRiverHeightConstraint(options.biomeId, constraint)
            ? { biomeId: options.biomeId }
            : { biomeId: null, reason: 'river_height_constraint_failed' };
        }
        return chooseBiomeId(biomeLandType, adjacentBiomeIds, regionId, constraint, effectiveCoastalPreference);
      };
      const candidateRegionForRiverCheck: Region = {
        ...candidateRegionForTopologyCheck,
        biomeLandType
      };
      const riverHeightConstraint = getRiverHeightConstraintForCandidateRegion(
        candidateRegionForRiverCheck,
        regions,
        rivers,
        nextCandidateHexesPreview
      );
      console.log('River height constraint for candidate region', {
        regionId,
        minHeight: riverHeightConstraint.minHeight,
        maxHeight: riverHeightConstraint.maxHeight,
        reasons: riverHeightConstraint.reasons
      });
      let riversForGeneration = rivers;
      let effectiveRiverHeightConstraint = riverHeightConstraint;
      let biomeChoice = pickBiome(effectiveRiverHeightConstraint);

      if (!biomeChoice.biomeId && biomeChoice.reason === 'river_height_constraint_failed') {
        console.warn('Region failed because of river height constraint; trying outgoing river trimming fallback', {
          regionId,
          attempt,
          riverHeightConstraint,
          adjacentBiomeIds,
          biomeLandType
        });
        const conflictingOutgoingRiverIds = getConflictingOutgoingRiverIds(
          touchingEndpoints,
          regions,
          riverHeightConstraint
        );
        if (conflictingOutgoingRiverIds.length === 0) {
          console.warn('River height conflict detected but no outgoing river ids found for trimming', {
            regionId,
            attempt,
            touchingEndpoints,
            riverHeightConstraint
          });
        } else {
          riversForGeneration = trimConflictingOutgoingRiversAwayFromRegion(
            rivers,
            conflictingOutgoingRiverIds,
            regionHexes,
            regionId
          );
          effectiveRiverHeightConstraint = getRiverHeightConstraintForCandidateRegion(
            candidateRegionForRiverCheck,
            regions,
            riversForGeneration,
            nextCandidateHexesPreview
          );
          console.warn('Recalculated river height constraint after outgoing river trimming', {
            regionId,
            attempt,
            originalConstraint: riverHeightConstraint,
            patchedConstraint: effectiveRiverHeightConstraint,
            conflictingOutgoingRiverIds
          });
          biomeChoice = pickBiome(effectiveRiverHeightConstraint);
        }
      }
      if (!biomeChoice.biomeId) {
        console.warn('No biome available after river height fallback; retrying region generation', {
          regionId,
          attempt,
          riverHeightConstraint,
          effectiveRiverHeightConstraint,
          adjacentBiomeIds,
          biomeLandType
        });
        continue;
      }
      const biomeId = biomeChoice.biomeId;
      const biome = BIOMES[biomeId] ?? BIOMES[FALLBACK_BIOME_ID];
      const heightLevel = BIOMES[biomeId]?.heightLevel ?? 1;
      const { lakesByHex, nextLakeId: computedNextLakeId } = assignLakesForRegion(regionHexes, centerHex, nextLakeId, biomeId);
      const regionBase: Omit<Region, 'pointsOfInterest'> = {
        id: regionId,
        hexes: regionHexes,
        centerHex,
        anchorHex,
        targetSize,
        finalSize,
        sizeCategory,
        sizeLabel,
        biomeLandType,
        heightLevel,
        biomeId,
        biomeLabel: biome.label,
        biomePrimaryEmoji: biome.primaryEmoji,
        biomeSecondaryEmojis: [...biome.secondaryEmojis],
        biomeEmojiLabel: biome.primaryEmoji + biome.secondaryEmojis.join(''),
        isCoastal: isCoastalRegion
      };
      const regionForRiverGeneration: Region = {
        ...regionBase,
        pointsOfInterest: []
      };
      console.log('Region size generated', { regionId, targetSize, finalSize, sizeLabel });
      console.log('Biome selected', {
        regionId,
        regionCount: regions.length,
        biomeLandType,
        adjacentBiomeIds,
        selectedBiomeId: biomeId,
        selectedBiomeLabel: BIOMES[biomeId]?.label
      });
      if (finalSize > targetSize) {
        console.log('Region size exceeded target because enclosed areas were filled', {
          regionId,
          targetSize,
          finalSize,
          exceededBy: finalSize - targetSize
        });
      }
      const nextRegionsForRiverGeneration = [...regions, regionForRiverGeneration];
      const nextHexTerrainByKeyPreview = new Map(hexTerrainByKey);
      for (const [key, terrain] of lakesByHex) nextHexTerrainByKeyPreview.set(key, terrain);
      const nextAllHexes = nextRegionsForRiverGeneration.flatMap((r) => r.hexes);
      const nextCandidateHexes = getCandidateHexes(nextAllHexes);
      const riverResult = generateRiverForRegion(
        regionForRiverGeneration,
        nextRegionsForRiverGeneration,
        riversForGeneration,
        nextCandidateHexes,
        nextHexTerrainByKeyPreview
      );
      if (!riverResult.success) {
        console.warn('Discarding failed candidate region', { attempt, reason: riverResult.reason });
        continue;
      }

      if (!validateExistingRiverEdgeFullnessPreserved(rivers, riverResult.rivers)) {
        console.warn('Discarding failed candidate region because old river edge fullness was not preserved', { attempt });
        continue;
      }
      const finalizedRivers = assignRiverSectors(
        riverResult.rivers,
        getLakesForRegions(nextRegionsForRiverGeneration, nextHexTerrainByKeyPreview),
        nextRegionsForRiverGeneration,
        nextCandidateHexes
      );
      if (!validateExistingRiverEdgeFullnessPreserved(rivers, finalizedRivers)) {
        console.warn('Discarding failed candidate region because final river sector assignment changed old edge fullness', { attempt });
        continue;
      }

      const regionTerrainByHex = new Map<string, HexTerrainData>();
      for (const hex of regionHexes) {
        const terrain = nextHexTerrainByKeyPreview.get(hexKey(hex));
        if (terrain) regionTerrainByHex.set(hexKey(hex), terrain);
      }

      // Море прибрежного региона: ставится ПОСЛЕ генерации рек, поэтому реки
      // региона уже завершились на этом внешнем фронте — то есть впадают в море.
      const occupiedRegionKeysForSea = new Set(allRegionHexes.map(hexKey));
      const seaHexKeys = isCoastalRegion
        ? extendSeaToCoastalCenterCandidate(
          regionHexes,
          computeSeaHexKeysForCoastalRegion(regionHexes, centerHex, nextHexTerrainByKeyPreview, occupiedRegionKeysForSea, regions, finalizedRivers, regionId),
          nextHexTerrainByKeyPreview,
          occupiedRegionKeysForSea,
          finalizedRivers
        )
        : [];
      const coastalSeaValidation = isCoastalRegion
        ? validateCoastalSeaArea(regionHexes, seaHexKeys, getSeaHexKeys(hexTerrainByKey), finalizedRivers, regionId, regions)
        : { valid: true as const };
      if (coastalSeaValidation.valid === false) {
        console.warn('Discarding failed coastal candidate region because sea area is invalid', { attempt, regionId, reason: coastalSeaValidation.reason });
        continue;
      }
      const coastalCenterHex = seaHexKeys.length > 0
        ? chooseCoastalCenterHex(regionHexes, new Set(seaHexKeys), finalizedRivers)
        : null;
      if (isCoastalRegion && (!coastalCenterHex || seaHexKeys.length === 0)) {
        console.warn('Discarding failed coastal candidate region because no center hex touches both sea and river', { attempt, regionId });
        continue;
      }
      const finalCenterHex = coastalCenterHex ?? centerHex;
      const pointsOfInterest = assignPointsOfInterestForRegion(regionHexes, finalCenterHex, regionTerrainByHex);

      const finalRegion: Region = {
        ...regionForRiverGeneration,
        centerHex: finalCenterHex,
        pointsOfInterest,
        // Регион считается прибрежным, только если у него реально появилось море.
        isCoastal: seaHexKeys.length > 0
      };
      const roadResult = generateRoadsForRegion({
        region: finalRegion,
        regions,
        roads,
        rivers: finalizedRivers,
        hexTerrainByKey: nextHexTerrainByKeyPreview,
        nextRoadId,
        candidateHexes: nextCandidateHexes
      });
      const nextRegions = [...regions, finalRegion];

      // Кликабельный фронт роста не должен включать ни старое, ни новое море.
      const allSeaKeys = getSeaHexKeys(hexTerrainByKey);
      for (const key of seaHexKeys) allSeaKeys.add(key);
      const nextCandidateHexesExclSea = getCandidateHexes(nextAllHexes, allSeaKeys);

      // Снимок состояния ДО добавления этого региона — для удаления/перегенерации.
      const snapshot: MapSnapshot = {
        regions,
        candidateHexes,
        rivers,
        roads: cloneRoads(roads),
        hexTerrainByKey,
        nextLakeId,
        nextRoadId
      };
      setHistory((current) => [...current, snapshot]);
      setRegions(nextRegions);
      setCandidateHexes(nextCandidateHexesExclSea);
      setHexTerrainByKey(() => {
        const next = new Map(nextHexTerrainByKeyPreview);
        for (const key of seaHexKeys) next.set(key, { terrainOverride: 'sea' });
        // BR-004: озеро, соседствующее с морем, удаляется (гекс возвращается к биому региона).
        if (seaHexKeys.length > 0) {
          const seaSet = getSeaHexKeys(next);
          for (const [key, terrain] of next) {
            if (terrain.terrainOverride !== 'lake') continue;
            const touchesSea = getHexNeighbors(parseHexKey(key)).some((n) => seaSet.has(hexKey(n)));
            if (touchesSea) next.delete(key);
          }
        }
        return next;
      });
      setNextLakeId(Math.max(computedNextLakeId, getNextLakeIdFromTerrain(nextHexTerrainByKeyPreview)));

      setRivers(finalizedRivers);
      setRoads(roadResult.roads);
      setNextRoadId(roadResult.nextRoadId);
      setSelectedHex(centerHex);
      return;
    }
    console.warn('Could not create region after max attempts', {
      anchorHex,
      maxRegionAttempts
    });
  };

  const resetMap = () => {
    setRegions([]);
    setCandidateHexes([]);
    setRivers([]);
    setRoads([]);
    setNextRoadId(1);
    setSelectedHex(START_HEX);
    setHexTerrainByKey(new Map());
    setNextLakeId(1);
    setIsMapRotated(false);
    setHistory([]);
    setPendingRegen(null);
    setSeaBrushActive(false);
  };

  // Текущие параметры генерации, собранные из выпадающих списков.
  // Размер перебрасывается в момент вызова, чтобы каждая генерация в рамках
  // выбранной категории давала новое случайное значение из её диапазона.
  const buildGenerationOptions = (): GenerationOptions => ({
    targetSize: genSizeCategory === 'auto' ? undefined : rollRegionSizeInCategory(genSizeCategory),
    landType: genLandType === 'auto' ? undefined : genLandType,
    biomeId: genBiome === 'auto' ? undefined : genBiome,
    coastalPreference: 'mainland'
  });

  // Ручная кисть берега: переключает гекс кромки между морем и сушей-кандидатом.
  // Гексы регионов не трогаются. После правки пересчитываем фронт роста.
  const toggleSeaHex = (hex: AxialHex) => {
    const key = hexKey(hex);
    if (metadataMap.has(key)) return; // это гекс региона — не трогаем
    const nextTerrain = new Map(hexTerrainByKey);
    if (nextTerrain.get(key)?.terrainOverride === 'sea') {
      nextTerrain.delete(key);
    } else {
      nextTerrain.set(key, { terrainOverride: 'sea' });
    }
    setHexTerrainByKey(nextTerrain);
    setCandidateHexes(getCandidateHexes(allRegionHexes, getSeaHexKeys(nextTerrain)));
  };

  // Удаление последнего региона = восстановление снимка состояния, сделанного
  // перед его добавлением. Это надёжно откатывает и реки, и дороги, в том
  // числе изменения, которые новый регион внёс в соседние регионы.
  const restoreSnapshot = (snapshot: MapSnapshot) => {
    setRegions(snapshot.regions);
    setCandidateHexes(snapshot.candidateHexes);
    setRivers(snapshot.rivers);
    setRoads(pruneRoadsToRegionHexes(cloneRoads(snapshot.roads), snapshot.regions));
    setHexTerrainByKey(snapshot.hexTerrainByKey);
    setNextLakeId(snapshot.nextLakeId);
    setNextRoadId(snapshot.nextRoadId);
  };

  const deleteLastRegion = () => {
    if (history.length === 0) return;
    const snapshot = history[history.length - 1];
    restoreSnapshot(snapshot);
    setHistory(history.slice(0, -1));
    const previousRegions = snapshot.regions;
    setSelectedHex(
      previousRegions.length > 0
        ? previousRegions[previousRegions.length - 1].centerHex
        : START_HEX
    );
  };

  const regenerateLastRegion = () => {
    if (regions.length === 0 || history.length === 0) return;
    const lastAnchor = regions[regions.length - 1].anchorHex;
    const snapshot = history[history.length - 1];
    restoreSnapshot(snapshot);
    setHistory(history.slice(0, -1));
    // Генерируем не сразу: ждём, пока React применит восстановленный снимок,
    // иначе addRegionToMap прочитает из замыкания ещё старое состояние.
    setPendingRegen({ anchorHex: lastAnchor, options: buildGenerationOptions() });
  };

  useEffect(() => {
    if (!pendingRegen) return;
    addRegionToMap(pendingRegen.anchorHex, pendingRegen.options);
    setPendingRegen(null);
    // addRegionToMap намеренно не в зависимостях: эффект должен сработать
    // ровно один раз на установку заявки, уже с восстановленным состоянием.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRegen]);

  const selectedHexKey = selectedHex ? hexKey(selectedHex) : null;
  const selectedMeta = selectedHexKey ? metadataMap.get(selectedHexKey) : undefined;
  const selectedTerrain = selectedHexKey ? hexTerrainByKey.get(selectedHexKey) : undefined;
  const isSelectedLake = selectedTerrain?.terrainOverride === 'lake';
  const isSelectedCandidate = selectedHex ? candidateHexes.some((c) => hexKey(c) === selectedHexKey) : false;
  const selectedHexRivers = selectedHex ? getRiversForHex(selectedHex, rivers) : [];
  const selectedHexRiverSectors = selectedHex ? getRiverSectorsForHex(selectedHex, rivers) : [];
  const selectedHexRoadKinds = selectedHex
    ? roads.flatMap((road) => road.segments.filter((s) => hexKey(s.from) === selectedHexKey || hexKey(s.to) === selectedHexKey).map((s) => s.kind))
    : [];
  const selectedHexRoadIds = selectedHex
    ? Array.from(new Set(roads
      .filter((road) => road.segments.some((s) => s.kind === 'road' && (hexKey(s.from) === selectedHexKey || hexKey(s.to) === selectedHexKey)))
      .map((road) => road.id)))
    : [];

  const selectedType: HexType | 'none' = !selectedHex
    ? 'none'
    : selectedMeta?.isCenter
      ? 'center'
      : selectedMeta
        ? 'region'
        : isSelectedCandidate
          ? 'candidate'
          : 'none';

  const regionSharedVerticesByRegion = useMemo(() => {
    const map = new Map<number, { candidateVertices: RiverVertex[]; neighborRegionVertices: RiverVertex[] }>();
    for (const region of regions) map.set(region.id, getRegionSharedVertices(region, regions, candidateHexes));
    return map;
  }, [regions, candidateHexes]);

  const regionExteriorVertexUsageByRegion = useMemo(() => {
    const map = new Map<number, Map<string, VertexUsage>>();
    for (const region of regions) {
      map.set(region.id, getVertexUsageByKeyForRegion(region, regions, candidateHexes));
    }
    return map;
  }, [regions, candidateHexes]);

  const lastRegion = regions[regions.length - 1];
  const selectedRegion = selectedMeta ? regions.find((region) => region.id === selectedMeta.regionId) : undefined;
  const selectedRegionRiver = selectedRegion ? rivers.find((river) => river.regionId === selectedRegion.id) : undefined;
  const selectedRegionRivers = selectedRegion ? getRiversForRegion(selectedRegion, rivers) : [];
  const selectedRegionRiverSectors = selectedRegion ? getRiverSectorsForRegion(selectedRegion, rivers) : [];
  const selectedRegionConfluences = selectedRegion ? getRiverConfluencesForRegion(selectedRegion, rivers) : [];
  const selectedRegionLakes = selectedRegion ? getLakeSummariesForRegion(selectedRegion, hexTerrainByKey) : [];
  const selectedRegionRoadStats = selectedRegion ? (() => {
    const regionKeys = new Set(selectedRegion.hexes.map(hexKey));
    const roadIds = new Set<number>();
    let trail = 0;
    for (const r of roads) for (const s of r.segments) {
      if (regionKeys.has(hexKey(s.from)) || regionKeys.has(hexKey(s.to))) {
        if (s.kind === 'road') roadIds.add(r.id); else trail += 1;
      }
    }
    return { road: roadIds.size, trail };
  })() : { road: 0, trail: 0 };
  const selectedRegionGraph = selectedRegion ? riverGraphsByRegion.get(selectedRegion.id) : undefined;
  const selectedRegionSharedVertices = selectedRegion
    ? (regionSharedVerticesByRegion.get(selectedRegion.id) ?? { candidateVertices: [], neighborRegionVertices: [] })
    : { candidateVertices: [], neighborRegionVertices: [] };
  const selectedRegionRedVertices = useMemo(() => {
    const orangeKeys = new Set(selectedRegionSharedVertices.neighborRegionVertices.map((vertex) => vertex.key));
    return selectedRegionSharedVertices.candidateVertices.filter((vertex) => !orangeKeys.has(vertex.key));
  }, [selectedRegionSharedVertices]);
  const debugVerticesByRegion = useMemo(() => {
    const map = new Map<number, { key: string; x: number; y: number; type: 'red' | 'orange' | 'purple' }[]>();
    for (const region of regions) {
      const sharedVertices = regionSharedVerticesByRegion.get(region.id) ?? { candidateVertices: [], neighborRegionVertices: [] };
      const orangeKeys = new Set(sharedVertices.neighborRegionVertices.map((vertex) => vertex.key));
      const redVertices = sharedVertices.candidateVertices.filter((vertex) => !orangeKeys.has(vertex.key));
      const orangeVertices = sharedVertices.neighborRegionVertices;
      const centralHexVertices = region.centerHex ? getHexCornerPoints(region.centerHex) : [];
      const redSet = new Set(redVertices.map((vertex) => vertex.key));
      const orangeSet = new Set(orangeVertices.map((vertex) => vertex.key));
      const purpleSet = new Set(centralHexVertices.map((vertex) => vertex.key));
      const byKey = new Map<string, RiverVertex>();
      for (const vertex of [...centralHexVertices, ...orangeVertices, ...redVertices]) byKey.set(vertex.key, vertex);
      const merged = new Map<string, { key: string; x: number; y: number; type: 'red' | 'orange' | 'purple' }>();
      for (const [key, vertex] of byKey) {
        if (orangeSet.has(key)) merged.set(key, { ...vertex, type: 'orange' });
        else if (redSet.has(key)) merged.set(key, { ...vertex, type: 'red' });
        else if (purpleSet.has(key)) merged.set(key, { ...vertex, type: 'purple' });
      }

      map.set(region.id, Array.from(merged.values()));
    }
    return map;
  }, [regions, regionSharedVerticesByRegion]);
  const selectedRegionVertexUsage = selectedRegion ? regionExteriorVertexUsageByRegion.get(selectedRegion.id) : undefined;
  const selectedRedVertexFromHex = selectedRegion && selectedHex
    ? getHexCornerPoints(selectedHex).find((vertex) => selectedRegionRedVertices.some((redVertex) => redVertex.key === vertex.key))
    : undefined;
  const selectedRedVertexUsage = selectedRedVertexFromHex && selectedRegionVertexUsage
    ? selectedRegionVertexUsage.get(selectedRedVertexFromHex.key)
    : undefined;
  const selectedIssues = selectedRegion && selectedRegionRiver && selectedRegionGraph
    ? validateRiverEndpoints(selectedRegion, selectedRegionRiver, selectedRegionGraph)
    : [];
  const selectedCandidateBoundaryDebug = selectedRegion ? candidateBoundaryDebugByRegion.get(selectedRegion.id) : undefined;
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(MOBILE_LAYOUT_QUERY).matches));
  const [mapScale, setMapScale] = useState(1);
  const [isMapRotated, setIsMapRotated] = useState(false);
  const [mapToolbarHeight, setMapToolbarHeight] = useState(0);
  const isInfoPanelCollapsed = !isMobileLayout && isInfoCollapsed;
  const mapZoomPercent = Math.round(mapScale * 100);
  const displayMapWidth = isMapRotated ? positionedHexes.height : positionedHexes.width;
  const displayMapHeight = isMapRotated ? positionedHexes.width : positionedHexes.height;
  const mapRotationTransform = isMapRotated ? `translate(${positionedHexes.height} 0) rotate(90)` : undefined;
  const mapCardStyle = { '--map-toolbar-height': `${mapToolbarHeight}px` } as CSSProperties;

  useEffect(() => {
    if (isMobileLayout) {
      setMapToolbarHeight(0);
      return;
    }

    const toolbar = mapToolbarRef.current;
    if (!toolbar) return;

    const updateToolbarHeight = () => setMapToolbarHeight(toolbar.offsetHeight);
    updateToolbarHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateToolbarHeight);
      return () => window.removeEventListener('resize', updateToolbarHeight);
    }

    const resizeObserver = new ResizeObserver(updateToolbarHeight);
    resizeObserver.observe(toolbar);

    return () => resizeObserver.disconnect();
  }, [isMobileLayout]);

  useEffect(() => {
    const mobileLayout = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const syncMobileLayout = () => setIsMobileLayout(mobileLayout.matches);

    syncMobileLayout();
    mobileLayout.addEventListener('change', syncMobileLayout);

    return () => mobileLayout.removeEventListener('change', syncMobileLayout);
  }, []);

  const updateMapScale = (scale: number) => {
    setMapScale(Math.min(3, Math.max(0.5, scale)));
  };

  const handleMapWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    updateMapScale(mapScale + (event.deltaY > 0 ? -0.1 : 0.1));
  };

  const createSaveData = (): HexcrawlSaveData => ({
    schema: HEXCRAWL_SAVE_SCHEMA,
    version: HEXCRAWL_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    map: {
      regions,
      candidateHexes,
      rivers,
      roads,
      terrainByHexKey: Object.fromEntries(hexTerrainByKey.entries())
    },
    counters: {
      nextLakeId,
      nextRoadId
    },
    ui: {
      selectedHex,
      isMapRotated,
      mapScale
    }
  });

  const handleExportPng = async () => {
    if (!mapSvgRef.current) return;
    try {
      await exportSvgToPng(mapSvgRef.current, `${EXPORT_FILE_PREFIX}-${getTimestampForFilename()}.png`);
    } catch (error) {
      console.error('PNG export failed', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось выгрузить PNG-файл.');
    }
  };

  const handleExportJson = () => {
    const saveData = createSaveData();
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${EXPORT_FILE_PREFIX}-${getTimestampForFilename()}.json`);
  };

  const handleImportJsonClick = () => {
    jsonImportInputRef.current?.click();
  };

  const handleImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await readTextFile(file);
      const parsed: unknown = JSON.parse(text);
      assertHexcrawlSaveData(parsed);

      const importedRegions = parsed.map.regions;
      const importedAllHexes = importedRegions.flatMap((region) => region.hexes);
      const importedTerrain = new Map<string, HexTerrainData>(Object.entries(parsed.map.terrainByHexKey));
      const importedSeaKeys = getSeaHexKeys(importedTerrain);
      const importedCandidateHexes = importedAllHexes.length > 0 ? getCandidateHexes(importedAllHexes, importedSeaKeys) : [];
      const fallbackNextLakeId = Math.max(0, ...Array.from(importedTerrain.values()).map((terrain) => terrain.lakeId ?? 0)) + 1;
      const fallbackNextRoadId = Math.max(0, ...parsed.map.roads.map((road) => road.id)) + 1;

      setRegions(importedRegions);
      setCandidateHexes(importedCandidateHexes);
      setRivers(parsed.map.rivers);
      setRoads(parsed.map.roads);
      setHexTerrainByKey(importedTerrain);
      setNextLakeId(Math.max(parsed.counters.nextLakeId, fallbackNextLakeId));
      setNextRoadId(Math.max(parsed.counters.nextRoadId, fallbackNextRoadId));
      setSelectedHex(parsed.ui.selectedHex ?? START_HEX);
      setIsMapRotated(parsed.ui.isMapRotated);
      updateMapScale(parsed.ui.mapScale);
    } catch (error) {
      console.error('JSON import failed', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось загрузить JSON-файл.');
    }
  };

  if (debugRivers && selectedRegion && selectedCandidateBoundaryDebug) {
    console.log('Candidate boundary debug', {
      regionId: selectedRegion.id,
      regionHexesLength: selectedRegion.hexes.length,
      candidateBoundaryEdgesLength: selectedCandidateBoundaryDebug.edges.length,
      candidateBoundaryVerticesLength: selectedCandidateBoundaryDebug.vertices.length,
      edgeKeys: selectedCandidateBoundaryDebug.edgeKeys,
      vertexKeys: selectedCandidateBoundaryDebug.vertexKeys
    });
  }

  return (
    <div className="app">
      <section className="content">
        <div className="map-card" style={mapCardStyle}>
          <div ref={mapToolbarRef} className="map-toolbar" aria-label="Управление картой">
            <div className="controls">
              <button onClick={resetMap} className="secondary">Сбросить</button>
              <button
                type="button"
                onClick={regenerateLastRegion}
                className="secondary"
                disabled={regions.length === 0}
              >
                Перегенерировать регион
              </button>
              <button
                type="button"
                onClick={deleteLastRegion}
                className="secondary"
                disabled={regions.length === 0}
              >
                Удалить последний регион
              </button>
              <button
                type="button"
                onClick={() => setSeaBrushActive((v) => !v)}
                className="secondary"
                aria-pressed={seaBrushActive}
                disabled
              >
                Кисть берега: {seaBrushActive ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
              <button type="button" onClick={() => void handleExportPng()} className="secondary">Выгрузить PNG</button>
              <button type="button" onClick={handleExportJson} className="secondary">Выгрузить JSON</button>
              <button type="button" onClick={handleImportJsonClick} className="secondary">Загрузить JSON</button>
              <input ref={jsonImportInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void handleImportJson(event)} />
              <button onClick={() => setDebugRivers((v) => !v)} className="secondary">
                Debug rivers / Отладка рек: {debugRivers ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="gen-params" aria-label="Параметры генерации">
              <label>
                Размер
                <select value={genSizeCategory} onChange={(e) => setGenSizeCategory(e.target.value as typeof genSizeCategory)}>
                  <option value="auto">Авто</option>
                  <option value="locality">Местность</option>
                  <option value="small_region">Малый регион</option>
                  <option value="region">Регион</option>
                  <option value="large_region">Большой регион</option>
                  <option value="land">Край</option>
                  <option value="vast_land">Обширный край</option>
                </select>
              </label>
              <label>
                Освоенность
                <select value={genLandType} onChange={(e) => setGenLandType(e.target.value as typeof genLandType)}>
                  <option value="auto">Авто</option>
                  <option value="settled">Освоенный</option>
                  <option value="wild">Дикий</option>
                </select>
              </label>
              <label>
                Биом
                <select value={genBiome} onChange={(e) => setGenBiome(e.target.value as typeof genBiome)}>
                  <option value="auto">Авто</option>
                  {(Object.values(BIOMES)).map((biome) => (
                    <option key={biome.id} value={biome.id}>{biome.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Берег
                <select value={genCoastal} disabled onChange={(e) => setGenCoastal(e.target.value as typeof genCoastal)}>
                  <option value="mainland">Материк</option>
                </select>
              </label>
            </div>
            <div className="zoom-controls" aria-label="Масштаб карты">
              <button type="button" className="secondary" onClick={() => updateMapScale(mapScale - 0.1)} aria-label="Отдалить карту">−</button>
              <span>{mapZoomPercent}%</span>
              <button type="button" className="secondary" onClick={() => updateMapScale(mapScale + 0.1)} aria-label="Приблизить карту">+</button>
            </div>
            <button
              type="button"
              className="rotate-map-button"
              onClick={() => setIsMapRotated((value) => !value)}
              aria-label={isMapRotated ? 'Вернуть исходный поворот карты' : 'Повернуть карту на 90 градусов'}
              title={isMapRotated ? 'Вернуть исходный поворот карты' : 'Повернуть карту на 90°'}
            >
              <svg className="rotate-map-button__icon" viewBox="0 0 64 48" aria-hidden="true" focusable="false">
                <polygon
                  points={isMapRotated ? '32,4 56,16 56,32 32,44 8,32 8,16' : '20,4 44,4 56,24 44,44 20,44 8,24'}
                  className="rotate-map-button__hex"
                />
                <text x="32" y="25" className="rotate-map-button__sign">{isMapRotated ? '↺' : '↻'}</text>
              </svg>
            </button>
          </div>
          <div className="map-viewport" onWheel={handleMapWheel}>
            <svg
              ref={mapSvgRef}
              viewBox={`0 0 ${displayMapWidth} ${displayMapHeight}`}
              preserveAspectRatio="xMinYMin meet"
              style={{ width: `${displayMapWidth * mapScale}px`, height: `${displayMapHeight * mapScale}px` }}
            >
            <defs>
              {([1, 2, 3, 4, 5] as RiverFullness[]).map((fullness) => {
                const markerSize = 5 * getRiverArrowScale(fullness);
                return (
                  <marker key={`river-arrowhead-${fullness}`} id={`river-arrowhead-${fullness}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth={markerSize} markerHeight={markerSize} orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" className="river-arrow-head" />
                  </marker>
                );
              })}
              {positionedHexes.hexes.map((hex) => (
                <clipPath key={`hex-clip-${hex.key}`} id={`hex-clip-${hex.key}`}>
                  <polygon points={hexPoints(hex.x, hex.y, HEX_SIZE)} />
                </clipPath>
              ))}
            </defs>
            <g className="map-rotation-layer" transform={mapRotationTransform}>
            {positionedHexes.hexes.map((hex) => {
              const meta = metadataMap.get(hex.key);
              const isStartClickPrompt = regions.length === 0 && hex.kind === 'candidate' && hex.key === hexKey(START_HEX);
              const isCandidateClickPrompt = regions.length >= 1 && regions.length <= 2 && hex.kind === 'candidate' && hex.key === clickPromptCandidateKey;
              const cls = `${hex.kind === 'sea' ? 'hex sea' : hex.kind === 'candidate' ? 'hex candidate' : meta?.isCenter ? 'hex center' : 'hex region'}${isStartClickPrompt || isCandidateClickPrompt ? ' click-prompt' : ''}`;
              const hexRenderSize = isStartClickPrompt ? HEX_SIZE * START_PROMPT_HEX_SCALE : HEX_SIZE;
              const terrain = hexTerrainByKey.get(hex.key);
              const isLakeHex = terrain?.terrainOverride === 'lake';
              const region = meta?.regionId ? regions.find((item) => item.id === meta.regionId) : undefined;
              const fill = hex.kind === 'sea' ? SEA_HEX_COLOR : hex.kind === 'candidate' ? undefined : isLakeHex ? LAKE_HEX_COLOR : getBiomeColor(region?.biomeId);
              const fallbackBiome = BIOMES[FALLBACK_BIOME_ID];
              const biomePrimaryEmoji = region?.biomePrimaryEmoji ?? fallbackBiome.primaryEmoji;
              const biomeSecondaryEmojis = region?.biomeSecondaryEmojis ?? fallbackBiome.secondaryEmojis;
              const biomeEmojis = [
                biomePrimaryEmoji,
                ...biomeSecondaryEmojis.slice(0, 2)
              ];
              const isPointOfInterest = region?.pointsOfInterest.some((poi) => hexKey(poi) === hex.key) ?? false;
              const hexEmojis = [
                ...(meta?.isCenter ? [REGION_CENTER_EMOJI] : []),
                ...(isPointOfInterest ? [POI_EMOJI] : []),
                ...biomeEmojis
              ];
              const hexEmojiLayout = getHexEmojiLayout(hexEmojis, hex.x, hex.y, HEX_SIZE);
              return (
                <g
                  key={`${hex.kind}-${hex.key}`}
                  onClick={() => {
                    if (seaBrushActive) {
                      // В режиме кисти клик по кромке/морю переключает море, по региону — игнор.
                      if (hex.kind !== 'region') toggleSeaHex({ q: hex.q, r: hex.r });
                    } else if (hex.kind === 'candidate') {
                      addRegionToMap({ q: hex.q, r: hex.r }, buildGenerationOptions());
                    } else {
                      setSelectedHex({ q: hex.q, r: hex.r });
                    }
                  }}
                >
                  <polygon points={hexPoints(hex.x, hex.y, hexRenderSize)} className={cls} style={{ fill }} />
                  <polygon points={hexPoints(hex.x, hex.y, hexRenderSize)} className={cls} style={{ fill: 'none' }} />
                  {SHOW_HEX_COORDINATES ? <text x={hex.x} y={hex.y + 4} textAnchor="middle" className="hex-label">{hex.q}/{hex.r}</text> : null}
                </g>
              );
            })}
            <g className="rivers-layer">
              {riverSegments.map((segment) => (
                <line
                  key={segment.key}
                  x1={segment.x1}
                  y1={segment.y1}
                  x2={segment.x2}
                  y2={segment.y2}
                  className="river-polyline"
                  strokeWidth={segment.width}
                />
              ))}
              {riverDirectionArrows.map((arrow) => (
                <line
                  key={arrow.key}
                  x1={arrow.x1}
                  y1={arrow.y1}
                  x2={arrow.x2}
                  y2={arrow.y2}
                  className="river-direction-arrow"
                  strokeWidth={1.2 * getRiverArrowScale(arrow.fullness)}
                  markerEnd={`url(#river-arrowhead-${arrow.fullness})`}
                />
              ))}
            </g>
            <g className="roads-layer">
              {roadSegments.filter((segment) => segment.kind === 'road').map((segment) => (
                <line key={segment.key} x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} className="road-line" />
              ))}
              {trailDots.map((dot) => (
                <circle key={dot.key} cx={dot.x} cy={dot.y} r={2.1} className="road-trail-dot" />
              ))}
            </g>
            </g>
            <g className="emoji-layer">
              {positionedHexes.hexes.map((hex) => {
                const isStartClickPrompt = regions.length === 0 && hex.kind === 'candidate' && hex.key === hexKey(START_HEX);
                const isCandidateClickPrompt = regions.length >= 1 && regions.length <= 2 && hex.kind === 'candidate' && hex.key === clickPromptCandidateKey;
                if (!isStartClickPrompt && !isCandidateClickPrompt) return null;
                const position = isMapRotated ? rotateMapPoint(hex.x, hex.y, positionedHexes.height) : hex;
                return (
                  <text
                    key={`click-prompt-${hex.key}`}
                    x={position.x}
                    y={position.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="click-prompt-label"
                  >
                    {CLICK_PROMPT_LABEL}
                  </text>
                );
              })}
              {positionedHexes.hexes.map((hex) => {
                const meta = metadataMap.get(hex.key);
                const terrain = hexTerrainByKey.get(hex.key);
                const isLakeHex = terrain?.terrainOverride === 'lake';
                const region = meta?.regionId ? regions.find((item) => item.id === meta.regionId) : undefined;
                const fallbackBiome = BIOMES[FALLBACK_BIOME_ID];
                const biomePrimaryEmoji = region?.biomePrimaryEmoji ?? fallbackBiome.primaryEmoji;
                const biomeSecondaryEmojis = region?.biomeSecondaryEmojis ?? fallbackBiome.secondaryEmojis;
                const biomeEmojis = [biomePrimaryEmoji, ...biomeSecondaryEmojis.slice(0, 2)];
                const isPointOfInterest = region?.pointsOfInterest.some((poi) => hexKey(poi) === hex.key) ?? false;
                const hexEmojis = [...(meta?.isCenter ? [REGION_CENTER_EMOJI] : []), ...(isPointOfInterest ? [POI_EMOJI] : []), ...biomeEmojis];
                const hexEmojiLayout = getHexEmojiLayout(hexEmojis, hex.x, hex.y, HEX_SIZE);
                return SHOW_BIOME_EMOJI && hex.kind === 'region' && hex.regionId && region && !isLakeHex ? hexEmojiLayout.map((item, index) => {
                  const position = isMapRotated ? rotateMapPoint(item.x, item.y, positionedHexes.height) : item;
                  return (
                    <text key={`biome-emoji-${hex.key}-${index}`} x={position.x} y={position.y} textAnchor="middle" dominantBaseline="central" fontSize={item.fontSize} pointerEvents="none">{item.emoji}</text>
                  );
                }) : null;
              })}
            </g>
            {debugRivers ? (
              <g className="river-debug-layer" transform={mapRotationTransform}>
                {Array.from(riverGraphsByRegion.values()).flatMap((graph, graphIndex) => Array.from(graph.nodes.values()).map((node) => (
                  <circle key={`dbg-all-${graphIndex}-${node.key}`} cx={node.x + riverOffset.x} cy={node.y + riverOffset.y} r={2} className="dbg-node-all" />
                )))}
                {Array.from(riverGraphsByRegion.values()).flatMap((graph, graphIndex) => Array.from(graph.nodes.values()).filter((node) => node.isRegionBoundaryVertex).map((node) => (
                  <circle key={`dbg-rb-${graphIndex}-${node.key}`} cx={node.x + riverOffset.x} cy={node.y + riverOffset.y} r={2} className="dbg-node-boundary" />
                )))}
                {(selectedRegion
                  ? (candidateBoundaryDebugByRegion.get(selectedRegion.id)?.vertices ?? []).map((vertex) => (
                    <circle key={`dbg-cb-sel-${selectedRegion.id}-${vertex.key}`} cx={vertex.x + riverOffset.x} cy={vertex.y + riverOffset.y} r={2} className="dbg-node-candidate" />
                  ))
                  : regions.flatMap((region) => (candidateBoundaryDebugByRegion.get(region.id)?.vertices ?? []).map((vertex) => (
                    <circle key={`dbg-cb-all-${region.id}-${vertex.key}`} cx={vertex.x + riverOffset.x} cy={vertex.y + riverOffset.y} r={2} className="dbg-node-candidate" />
                  ))))}
                {(selectedRegion
                  ? (debugVerticesByRegion.get(selectedRegion.id) ?? []).map((vertex) => (
                    <circle key={`dbg-vertex-sel-${selectedRegion.id}-${vertex.key}`} cx={vertex.x + riverOffset.x} cy={vertex.y + riverOffset.y} r={1.5} className={vertex.type === 'red' ? 'dbg-node-exterior' : vertex.type === 'orange' ? 'dbg-node-neighbor-region' : 'dbg-node-central'} />
                  ))
                  : regions.flatMap((region) => (debugVerticesByRegion.get(region.id) ?? []).map((vertex) => (
                    <circle key={`dbg-vertex-all-${region.id}-${vertex.key}`} cx={vertex.x + riverOffset.x} cy={vertex.y + riverOffset.y} r={1.5} className={vertex.type === 'red' ? 'dbg-node-exterior' : vertex.type === 'orange' ? 'dbg-node-neighbor-region' : 'dbg-node-central'} />
                  ))))}
                {rivers.map((river) => {
                  if (!river.vertexPath || river.vertexPath.length < 2) return null;
                  const start = river.vertexPath[0];
                  const end = river.vertexPath[river.vertexPath.length - 1];
                  const first = [start, river.vertexPath[1]];
                  const last = [river.vertexPath[river.vertexPath.length - 2], end];
                  const mid = river.vertexPath[Math.floor(river.vertexPath.length / 2)];
                  return (
                    <g key={`dbg-river-${river.id}`}>
                      <line x1={first[0].x + riverOffset.x} y1={first[0].y + riverOffset.y} x2={first[1].x + riverOffset.x} y2={first[1].y + riverOffset.y} className="dbg-first-segment" />
                      <line x1={last[0].x + riverOffset.x} y1={last[0].y + riverOffset.y} x2={last[1].x + riverOffset.x} y2={last[1].y + riverOffset.y} className="dbg-last-segment" />
                      <circle cx={start.x + riverOffset.x} cy={start.y + riverOffset.y} r={5} className="dbg-start" />
                      <circle cx={end.x + riverOffset.x} cy={end.y + riverOffset.y} r={5} className="dbg-end" />
                      <text x={mid.x + riverOffset.x + 4} y={mid.y + riverOffset.y - 4} className="dbg-river-id">#{river.id}</text>
                    </g>
                  );
                })}
                {lakeVerticesDebug.map((vertex) => (
                  <circle key={vertex.key} cx={vertex.cx} cy={vertex.cy} r={2.2} className="dbg-lake-vertex" />
                ))}
              </g>
            ) : null}
            </svg>
          </div>

          <aside className={`roll-card${isInfoPanelCollapsed ? ' is-collapsed' : ''}`}>
            {isMobileLayout ? (
              <div className="info-toggle info-toggle--static">
                <span>Информация</span>
              </div>
            ) : (
            <button
              type="button"
              className="info-toggle secondary"
              onClick={() => setIsInfoCollapsed((value) => !value)}
              aria-expanded={!isInfoCollapsed}
            >
              <span>Информация</span>
              <span>{isInfoCollapsed ? 'Развернуть' : 'Свернуть'}</span>
            </button>
            )}
            {!isInfoPanelCollapsed ? (
              <div className="info-body">
          {regions.length === 0 ? <p>Нажмите на стартовый гекс 0/0 на карте, чтобы создать первый регион.</p> : null}
          {lastRegion ? (
            <>
              <p>Регионов: {regions.length}</p>
              <p>Последний регион: #{lastRegion.id}</p>
              <p>Размер региона: {getRegionSizeDisplay(lastRegion)}</p>
              <p>Высота: {getRegionHeightLabel(lastRegion.heightLevel ?? getRegionHeightLevelFromBiomeId(lastRegion.biomeId))}</p>
              <p>Целевой размер: {lastRegion.targetSize}</p>
              <p>Фактический размер региона: {lastRegion.finalSize}</p>
              <p>Точек интереса: {lastRegion.pointsOfInterest.length}</p>
            </>
          ) : null}
          <hr />
          <p><strong>Выбранный гекс:</strong> {selectedHex ? `${selectedHex.q}/${selectedHex.r}` : '—'}</p>
          <p><strong>Тип:</strong> {selectedType}</p>
          <p><strong>Регион:</strong> {selectedMeta?.regionId ?? '—'}</p>
          <p><strong>centralHex:</strong> {selectedMeta?.isCenter ? 'да' : 'нет'}</p>
          <p><strong>anchorHex:</strong> {selectedMeta?.isAnchor ? 'да' : 'нет'}</p>
          <div>
            <strong>Реки:</strong>
            {selectedHexRiverSectors.length > 0 ? (
              <ul>
                {selectedHexRiverSectors.map((sector) => (
                  <li key={sector.id}>Река #{sector.riverId}, сектор {sector.sectorIndex}, полноводность {sector.fullness}</li>
                ))}
              </ul>
            ) : selectedHexRivers.length > 0 ? (
              <ul>
                {selectedHexRivers.map((river) => (
                  <li key={river.id}>Река #{river.id}</li>
                ))}
              </ul>
            ) : ' —'}
          </div>
          <p><strong>Точка интереса:</strong> {!isSelectedCandidate && selectedRegion ? (selectedRegion.pointsOfInterest.some((poi) => selectedHexKey === hexKey(poi)) ? 'да' : 'нет') : '—'}</p>
          <p><strong>Дорога:</strong> {selectedHexRoadKinds.includes('road') ? 'да' : 'нет'}</p>
          <p><strong>Тропа:</strong> {selectedHexRoadKinds.includes('trail') ? 'да' : 'нет'}</p>
          <p><strong>Номера дорог:</strong> {selectedHexRoadIds.length > 0 ? selectedHexRoadIds.map((roadId) => `#${roadId}`).join('; ') : '—'}</p>
          {isSelectedCandidate ? <p><strong>Статус:</strong> Кандидат для нового региона</p> : null}
          {isSelectedLake && !isSelectedCandidate && selectedRegion ? (
            <>
              <p><strong>Тип гекса:</strong> Озеро</p>
              <p><strong>Озеро:</strong> {selectedTerrain?.lakeId ?? '—'}</p>
              <p><strong>Регион:</strong> #{selectedRegion.id}</p>
              <p><strong>Исходный биом региона:</strong> {selectedRegion.biomeLabel}</p>
              <p><strong>Высота:</strong> {getRegionHeightLabel(selectedRegion.heightLevel ?? getRegionHeightLevelFromBiomeId(selectedRegion.biomeId))}</p>
            </>
          ) : null}
          {!isSelectedCandidate && selectedRegion && !isSelectedLake ? (
            <>
              <p><strong>Тип местности:</strong> {selectedRegion.biomeLandType === 'settled' ? 'Освоенная' : 'Дикая'}</p>
              <p><strong>Биом:</strong> {selectedRegion.biomePrimaryEmoji}{selectedRegion.biomeSecondaryEmojis.join('')} {selectedRegion.biomeLabel}</p>
              <p><strong>Высота:</strong> {getRegionHeightLabel(selectedRegion.heightLevel ?? getRegionHeightLevelFromBiomeId(selectedRegion.biomeId))}</p>
              <p><strong>Размер:</strong> {getRegionSizeDisplay(selectedRegion)}</p>
              <p><strong>Точек интереса в регионе:</strong> {selectedRegion.pointsOfInterest.length}</p>
              <p><strong>Дорог региона:</strong> {selectedRegionRoadStats.road}</p>
              <p><strong>Троп региона:</strong> {selectedRegionRoadStats.trail}</p>
              <p>
                <strong>Реки региона:</strong>{' '}
                {selectedRegionRivers.length > 0
                  ? selectedRegionRivers
                    .map((river) => `#${river.id}`)
                    .join('; ')
                  : '—'}
              </p>
              <div>
                <strong>Речные сектора:</strong>
                {selectedRegionRiverSectors.length > 0 ? (
                  <ul>
                    {selectedRegionRiverSectors.map((sector) => (
                      <li key={sector.id}>Река #{sector.riverId}: сектор {sector.sectorIndex}, полноводность {sector.fullness}</li>
                    ))}
                  </ul>
                ) : ' —'}
              </div>
              <div>
                <strong>Слияния:</strong>
                {selectedRegionConfluences.length > 0 ? (
                  <ul>
                    {selectedRegionConfluences.map((confluence) => (
                      <li key={confluence.id}>Река {confluence.tributaryRiverId} впадает в Реку {confluence.mainRiverId}</li>
                    ))}
                  </ul>
                ) : ' —'}
              </div>
              <p>
                <strong>Озёра региона:</strong>{' '}
                {selectedRegionLakes.length > 0
                  ? selectedRegionLakes
                    .map((lake) => `#${lake.lakeId} — ${lake.size} ${formatHexCount(lake.size)}`)
                    .join('; ')
                  : '—'}
              </p>
            </>
          ) : null}
          {debugRivers ? (
            <>
              <hr />
              <p><strong>River debug</strong></p>
              {!selectedRegion ? <p>Выберите региональный гекс.</p> : null}
              {selectedRegion && !selectedRegionGraph ? <p>no graph</p> : null}
              {selectedRegion && selectedRegionGraph && selectedRegionRiver ? (() => {
                const path = selectedRegionRiver.vertexPath;
                const start = path?.[0];
                const end = path?.[path.length - 1];
                const startNode = start ? selectedRegionGraph.nodes.get(start.key) : undefined;
                const endNode = end ? selectedRegionGraph.nodes.get(end.key) : undefined;
                const firstEdgeKey = path && path.length >= 2 ? edgeKey(path[0], path[1]) : '—';
                const lastEdgeKey = path && path.length >= 2 ? edgeKey(path[path.length - 2], path[path.length - 1]) : '—';
                const firstEdge = path && path.length >= 2 ? selectedRegionGraph.edges.get(firstEdgeKey) : undefined;
                const lastEdge = path && path.length >= 2 ? selectedRegionGraph.edges.get(lastEdgeKey) : undefined;
                const riverPathEdgeKeys = path ? getRiverPathEdgeKeys(path, selectedRegionGraph) : undefined;
                const riverEdgeCount = riverPathEdgeKeys?.length ?? 0;
                const duplicateRiverEdgeCount = riverPathEdgeKeys
                  ? riverEdgeCount - new Set(riverPathEdgeKeys).size
                  : 0;
                const duplicateRiverVertexCount = path ? path.length - new Set(path.map((vertex) => vertex.key)).size : 0;
                const existingRiverEndpointVerticesInRegion = getExistingRiverEndpointVerticesInRegion(selectedRegion, rivers, selectedRegionGraph);
                const riverHasDuplicateEdges = riverPathEdgeKeys ? hasDuplicateEdgeKeys(riverPathEdgeKeys) : false;
                return (
                  <>
                    <p>regionId: {selectedRegion.id}</p>
                    <p>regionHexes.length: {selectedRegion.hexes.length}</p>
                    <p>redCandidateVertices.length: {selectedRegionRedVertices.length}</p>
                    <p>orangeNeighborRegionVertices.length: {selectedRegionSharedVertices.neighborRegionVertices.length}</p>
                    <p>purpleCentralHexVertices.length: {selectedRegion.centerHex ? getHexCornerPoints(selectedRegion.centerHex).length : 0}</p>
                    <p>centralHex coordinate: {selectedRegion.centerHex ? `${selectedRegion.centerHex.q}/${selectedRegion.centerHex.r}` : '—'}</p>
                    <p>centralHexVertices.length: {selectedRegion.centerHex ? getHexCornerPoints(selectedRegion.centerHex).length : 0}</p>
                    <p>selectedRedVertex key: {selectedRedVertexFromHex?.key ?? '—'}</p>
                    <p>selectedRedVertex currentRegionCount: {selectedRedVertexUsage?.currentRegionCount ?? 0}</p>
                    <p>selectedRedVertex otherRegionCount: {selectedRedVertexUsage?.otherRegionCount ?? 0}</p>
                    <p>selectedRedVertex candidateCount: {selectedRedVertexUsage?.candidateCount ?? 0}</p>
                    <p>riverId: {selectedRegionRiver.id}</p>
                    <p>existingRiverEndpointVerticesInRegion.length: {existingRiverEndpointVerticesInRegion.length ?? 0}</p>
                    <p>selected start mode: {selectedRegionRiver.controlPoints?.startMode ?? 'none'}</p>
                    <p>selected startVertex key: {selectedRegionRiver.controlPoints?.startVertex.key ?? 'none'}</p>
                    <p>selected middlePurpleVertex key: {selectedRegionRiver.controlPoints?.middlePurpleVertex?.key ?? '-'}</p>
                    <p>selected endVertex key: {selectedRegionRiver.controlPoints?.endVertex.key ?? 'none'}</p>
                    <p>startRiverExteriorVertex key: {start?.key ?? "—"}</p>
                    <p>endRiverExteriorVertex key: {end?.key ?? "—"}</p>
                    <p>riverPath.length: {path?.length ?? 0}</p>
                    <p>riverEdgeCount: {riverEdgeCount}</p>
                    <p>duplicateRiverEdgeCount: {duplicateRiverEdgeCount ?? 0}</p>
                    <p>duplicateRiverVertexCount: {duplicateRiverVertexCount ?? 0}</p>
                    <p>riverHasDuplicateEdges: {riverHasDuplicateEdges ? 'true' : 'false'}</p>
                    <p>startVertex key: {start?.key ?? '—'}</p>
                    <p>endVertex key: {end?.key ?? '—'}</p>
                    <p>start isRegionBoundaryVertex: {startNode?.isRegionBoundaryVertex ? 'true' : 'false'}</p>
                    <p>end isRegionBoundaryVertex: {endNode?.isRegionBoundaryVertex ? 'true' : 'false'}</p>
                    <p>start isCandidateBoundaryVertex: {startNode?.isCandidateBoundaryVertex ? 'true' : 'false'}</p>
                    <p>end isCandidateBoundaryVertex: {endNode?.isCandidateBoundaryVertex ? 'true' : 'false'}</p>
                    <p>first edge key: {firstEdgeKey}</p>
                    <p>last edge key: {lastEdgeKey}</p>
                    <p>first edge isRegionBoundaryEdge: {firstEdge?.isRegionBoundaryEdge ? 'true' : 'false'}</p>
                    <p>last edge isRegionBoundaryEdge: {lastEdge?.isRegionBoundaryEdge ? 'true' : 'false'}</p>
                    <p>first edge isCandidateBoundaryEdge: {firstEdge?.isCandidateBoundaryEdge ? 'true' : 'false'}</p>
                    <p>last edge isCandidateBoundaryEdge: {lastEdge?.isCandidateBoundaryEdge ? 'true' : 'false'}</p>
                    <p>issues: {selectedIssues.length > 0 ? selectedIssues.slice(0, 6).join(', ') : 'none'}</p>
                    <p>candidateBoundaryEdges count: {selectedCandidateBoundaryDebug?.edges.length ?? 0}</p>
                    <p>candidateBoundaryVertices count: {selectedCandidateBoundaryDebug?.vertices.length ?? 0}</p>
                    <p>invalidCandidateBoundaryVertices count: {selectedCandidateBoundaryDebug?.invalidVertices.length ?? 0}</p>
                  </>
                );
              })() : null}
            </>
          ) : null}
          {candidateHexes.length > 0 ? <p>Выберите гекс-кандидат на карте для добавления следующего региона.</p> : null}
              </div>
            ) : null}
          </aside>
        </div>
      </section>

    </div>
  );
}
