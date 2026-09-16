import { readFileSync } from 'node:fs';
import { distanceM, type LonLat } from './geo.ts';

export interface PopulationRaster {
  width: number;
  height: number;
  originLon: number;
  originLat: number;
  cellWidthDeg: number;
  cellHeightDeg: number;
  nodata: number | null;
  values: Float32Array;
}

const TAG = {
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  planarConfiguration: 284,
  tileWidth: 322,
  sampleFormat: 339,
  modelPixelScale: 33550,
  modelTiepoint: 33922,
  geoKeyDirectory: 34735,
  gdalNodata: 42113,
} as const;

const GEO_KEY = { modelType: 1024, rasterType: 1025 } as const;
const MODEL_TYPE_GEOGRAPHIC = 2;
const RASTER_PIXEL_IS_POINT = 2;
const SAMPLE_FORMAT_FLOAT = 3;

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 };

type TagValue = number[] | string;

// Only what tools/data/clip-worldpop.sh writes: a classic, uncompressed, striped,
// single-band Float32 GeoTIFF in geographic coordinates. Anything else is rejected rather
// than misread.
export function readPopulationRaster(path: string): PopulationRaster {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = readByteOrder(bytes);
  if (view.getUint16(2, littleEndian) !== 42) throw new Error(`${path} is not a classic TIFF (BigTIFF is unsupported)`);

  const tags = readFirstDirectory(view, view.getUint32(4, littleEndian), littleEndian);
  const number = (tag: number, fallback?: number): number => {
    const value = tags.get(tag);
    if (Array.isArray(value) && value[0] !== undefined) return value[0];
    if (fallback !== undefined) return fallback;
    throw new Error(`${path} lacks TIFF tag ${tag}`);
  };
  const numbers = (tag: number): number[] => {
    const value = tags.get(tag);
    if (!Array.isArray(value)) throw new Error(`${path} lacks TIFF tag ${tag}`);
    return value;
  };

  const unsupported =
    number(TAG.compression, 1) !== 1 ||
    number(TAG.bitsPerSample) !== 32 ||
    number(TAG.sampleFormat, 1) !== SAMPLE_FORMAT_FLOAT ||
    number(TAG.samplesPerPixel, 1) !== 1 ||
    number(TAG.planarConfiguration, 1) !== 1 ||
    tags.has(TAG.tileWidth);
  if (unsupported) throw new Error(`${path} is not an uncompressed, striped, single-band Float32 GeoTIFF`);

  const geoKeys = readGeoKeys(numbers(TAG.geoKeyDirectory));
  if (geoKeys.get(GEO_KEY.modelType) !== MODEL_TYPE_GEOGRAPHIC) {
    throw new Error(`${path} is not in geographic (longitude/latitude) coordinates`);
  }

  const width = number(TAG.imageWidth);
  const height = number(TAG.imageLength);
  const [cellWidthDeg, cellHeightDeg] = numbers(TAG.modelPixelScale) as [number, number];
  const [tieColumn, tieRow, , tieLon, tieLat] = numbers(TAG.modelTiepoint) as [number, number, number, number, number];
  const pointShift = geoKeys.get(GEO_KEY.rasterType) === RASTER_PIXEL_IS_POINT ? 0.5 : 0;
  const nodataText = tags.get(TAG.gdalNodata);

  return {
    width,
    height,
    originLon: tieLon - (tieColumn + pointShift) * cellWidthDeg,
    originLat: tieLat + (tieRow + pointShift) * cellHeightDeg,
    cellWidthDeg,
    cellHeightDeg,
    nodata: typeof nodataText === 'string' ? Number.parseFloat(nodataText) : null,
    values: readStrips(view, littleEndian, width, height, number(TAG.rowsPerStrip, height), numbers(TAG.stripOffsets)),
  };
}

function readByteOrder(bytes: Buffer): boolean {
  const marker = bytes.toString('latin1', 0, 2);
  if (marker === 'II') return true;
  if (marker === 'MM') return false;
  throw new Error('Not a TIFF file');
}

function readFirstDirectory(view: DataView, offset: number, littleEndian: boolean): Map<number, TagValue> {
  const tags = new Map<number, TagValue>();
  const entryCount = view.getUint16(offset, littleEndian);
  for (let index = 0; index < entryCount; index++) {
    const entry = offset + 2 + index * 12;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const count = view.getUint32(entry + 4, littleEndian);
    const size = TYPE_SIZES[type];
    if (size === undefined) continue;
    const valueOffset = size * count <= 4 ? entry + 8 : view.getUint32(entry + 8, littleEndian);
    tags.set(tag, readTagValue(view, type, count, valueOffset, littleEndian));
  }
  return tags;
}

function readTagValue(view: DataView, type: number, count: number, offset: number, littleEndian: boolean): TagValue {
  if (type === 2) {
    return new TextDecoder('latin1').decode(new Uint8Array(view.buffer, view.byteOffset + offset, count)).replace(/\0+$/, '');
  }
  return Array.from({ length: count }, (_, index) => {
    switch (type) {
      case 1:
        return view.getUint8(offset + index);
      case 3:
        return view.getUint16(offset + index * 2, littleEndian);
      case 4:
        return view.getUint32(offset + index * 4, littleEndian);
      default:
        return view.getFloat64(offset + index * 8, littleEndian);
    }
  });
}

function readGeoKeys(directory: number[]): Map<number, number> {
  const keys = new Map<number, number>();
  const keyCount = directory[3] ?? 0;
  for (let index = 1; index <= keyCount; index++) {
    const [keyId, location, , value] = directory.slice(index * 4, index * 4 + 4) as [number, number, number, number];
    if (location === 0) keys.set(keyId, value);
  }
  return keys;
}

function readStrips(
  view: DataView,
  littleEndian: boolean,
  width: number,
  height: number,
  rowsPerStrip: number,
  stripOffsets: number[],
): Float32Array {
  const values = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    const strip = Math.floor(row / rowsPerStrip);
    const rowStart = stripOffsets[strip]! + (row - strip * rowsPerStrip) * width * 4;
    for (let column = 0; column < width; column++) {
      values[row * width + column] = view.getFloat32(rowStart + column * 4, littleEndian);
    }
  }
  return values;
}

const isPopulated = (raster: PopulationRaster, value: number): boolean => value !== raster.nodata && value > 0;

export function totalPopulation(raster: PopulationRaster): { people: number; populatedCells: number } {
  let people = 0;
  let populatedCells = 0;
  for (const value of raster.values) {
    if (!isPopulated(raster, value)) continue;
    people += value;
    populatedCells++;
  }
  return { people, populatedCells };
}

// Sums every populated cell whose centre lies within the radius (plan §B2).
export function populationWithin(raster: PopulationRaster, centre: LonLat, radiusM: number): number {
  const latSpan = radiusM / 111_000 + raster.cellHeightDeg;
  const lonSpan = radiusM / (111_000 * Math.cos((centre.lat * Math.PI) / 180)) + raster.cellWidthDeg;
  const firstRow = Math.max(0, Math.floor((raster.originLat - (centre.lat + latSpan)) / raster.cellHeightDeg));
  const lastRow = Math.min(raster.height - 1, Math.floor((raster.originLat - (centre.lat - latSpan)) / raster.cellHeightDeg));
  const firstColumn = Math.max(0, Math.floor((centre.lon - lonSpan - raster.originLon) / raster.cellWidthDeg));
  const lastColumn = Math.min(raster.width - 1, Math.floor((centre.lon + lonSpan - raster.originLon) / raster.cellWidthDeg));

  let people = 0;
  for (let row = firstRow; row <= lastRow; row++) {
    const lat = raster.originLat - (row + 0.5) * raster.cellHeightDeg;
    for (let column = firstColumn; column <= lastColumn; column++) {
      const value = raster.values[row * raster.width + column]!;
      if (!isPopulated(raster, value)) continue;
      const lon = raster.originLon + (column + 0.5) * raster.cellWidthDeg;
      if (distanceM(centre, { lon, lat }) <= radiusM) people += value;
    }
  }
  return people;
}
