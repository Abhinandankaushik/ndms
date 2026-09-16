import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LonLat, MultiPolygonCoordinates } from './geo.ts';
import { readPopulationRaster, type PopulationRaster } from './geotiff.ts';

const PLACE_KINDS = ['city', 'town', 'suburb', 'village', 'hamlet'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

const AMENITIES = ['school', 'college', 'community_centre', 'hospital', 'clinic', 'police', 'fire_station'] as const;
export type Amenity = (typeof AMENITIES)[number];

export interface District {
  name: string;
  state: string;
  boundary: MultiPolygonCoordinates;
  boundaryGeoJson: string;
}

export interface OsmPlace {
  osmId: string;
  name: string | null;
  place: PlaceKind;
  location: LonLat;
}

export interface OsmFacility {
  osmId: string;
  name: string | null;
  amenity: Amenity;
  iscedLevel: string | null;
  location: LonLat;
}

export interface OsmWaterway {
  osmId: string;
  name: string | null;
  waterway: string;
  lines: LonLat[][];
}

export interface SeedInputs {
  district: District;
  places: OsmPlace[];
  facilities: OsmFacility[];
  waterways: OsmWaterway[];
  raster: PopulationRaster | null;
  rasterPath: string;
}

interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

const OSM_EXTRACT_HINT = 'docker compose run --rm gdal sh tools/data/extract-osm-features.sh';

export function loadSeedInputs(repoRoot: string): SeedInputs {
  const seedDir = join(repoRoot, 'data', 'seed', 'darbhanga');
  const rasterPath = join(repoRoot, 'data', 'raw', 'worldpop', 'darbhanga_ppp_2020.tif');
  return {
    district: loadDistrict(join(seedDir, 'district.geojson')),
    places: readFeatures(join(seedDir, 'osm-places.geojson'), OSM_EXTRACT_HINT).map(toPlace),
    facilities: readFeatures(join(seedDir, 'osm-facilities.geojson'), OSM_EXTRACT_HINT).map(toFacility),
    waterways: readFeatures(join(seedDir, 'osm-waterways.geojson'), OSM_EXTRACT_HINT).map(toWaterway),
    raster: existsSync(rasterPath) ? readPopulationRaster(rasterPath) : null,
    rasterPath,
  };
}

function readFeatures(path: string, hint: string): Feature[] {
  if (!existsSync(path)) throw new Error(`${path} is missing: run ${hint}`);
  return (JSON.parse(readFileSync(path, 'utf8')) as { features: Feature[] }).features;
}

function loadDistrict(path: string): District {
  const [feature] = readFeatures(path, 'docker compose run --rm gdal sh tools/data/extract-district-boundary.sh');
  if (!feature || feature.geometry.type !== 'MultiPolygon') throw new Error(`${path} must hold one MultiPolygon feature`);
  return {
    name: String(feature.properties['DISTRICT']),
    state: String(feature.properties['ST_NM']),
    boundary: feature.geometry.coordinates as MultiPolygonCoordinates,
    boundaryGeoJson: JSON.stringify(feature.geometry),
  };
}

const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

function pointOf(feature: Feature): LonLat {
  if (feature.geometry.type !== 'Point') throw new Error(`Expected a Point for ${String(feature.properties['osm_id'])}`);
  const [lon, lat] = feature.geometry.coordinates as [number, number];
  return { lon, lat };
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, what: string): T {
  if (!allowed.includes(value as T)) throw new Error(`Unexpected ${what} ${String(value)}`);
  return value as T;
}

const toPlace = (feature: Feature): OsmPlace => ({
  osmId: String(feature.properties['osm_id']),
  name: optionalText(feature.properties['name']),
  place: oneOf(PLACE_KINDS, feature.properties['place'], 'place'),
  location: pointOf(feature),
});

const toFacility = (feature: Feature): OsmFacility => ({
  osmId: String(feature.properties['osm_id']),
  name: optionalText(feature.properties['name']),
  amenity: oneOf(AMENITIES, feature.properties['amenity'], 'amenity'),
  iscedLevel: optionalText(feature.properties['isced_level']),
  location: pointOf(feature),
});

function toWaterway(feature: Feature): OsmWaterway {
  const { type, coordinates } = feature.geometry;
  if (type !== 'LineString' && type !== 'MultiLineString') throw new Error(`Unexpected waterway geometry ${type}`);
  const parts = type === 'LineString' ? [coordinates as number[][]] : (coordinates as number[][][]);
  return {
    osmId: String(feature.properties['osm_id']),
    name: optionalText(feature.properties['name']),
    waterway: String(feature.properties['waterway']),
    lines: parts.map((part) => part.map(([lon, lat]) => ({ lon: lon!, lat: lat! }))),
  };
}
