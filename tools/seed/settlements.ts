import { distanceM, distanceToLinesM, type LonLat } from './geo.ts';
import { populationWithin, type PopulationRaster } from './geotiff.ts';
import type { OsmPlace, OsmWaterway, PlaceKind } from './inputs.ts';
import { compareText, normaliseName } from './text.ts';

// Plan §B2: a village's population is estimated from the WorldPop cells within 1 km of its
// point. Neighbouring buffers can overlap, so these do not sum to the district total.
const POPULATION_RADIUS_M = 1000;

// Plan §B11: p(incident) ∝ population × exp(-distance_to_river / 2000).
const WATERWAY_DECAY_M = 2000;

// Two place points with the same name this close are one settlement mapped twice; the first
// in file order is kept (data/SOURCES.md lists the merged ones).
const DOUBLE_MAPPED_PLACE_DISTANCE_M = 250;

const URBAN_KINDS: readonly PlaceKind[] = ['city', 'town', 'suburb'];
const KIND_RANK: Record<PlaceKind, number> = { city: 0, town: 1, suburb: 2, village: 3, hamlet: 4 };

export interface Settlement {
  osmId: string;
  osmName: string | null;
  name: string;
  place: PlaceKind;
  location: LonLat;
  population: number | null;
  waterwayDistanceM: number;
  incidentWeight: number;
}

export function withoutDoubleMappedPlaces(places: readonly OsmPlace[]): OsmPlace[] {
  const kept: OsmPlace[] = [];
  for (const place of places) {
    const mappedTwice = kept.some(
      (other) =>
        other.name !== null &&
        place.name !== null &&
        normaliseName(other.name) === normaliseName(place.name) &&
        distanceM(other.location, place.location) <= DOUBLE_MAPPED_PLACE_DISTANCE_M,
    );
    if (!mappedTwice) kept.push(place);
  }
  return kept;
}

export function describeSettlements(
  places: readonly OsmPlace[],
  waterways: readonly OsmWaterway[],
  raster: PopulationRaster | null,
): Settlement[] {
  const waterwayLines = waterways.flatMap((waterway) => waterway.lines);
  return places.map((place) => {
    const population = raster ? Math.round(populationWithin(raster, place.location, POPULATION_RADIUS_M)) : null;
    const waterwayDistanceM = waterwayLines.length > 0 ? distanceToLinesM(place.location, waterwayLines) : Infinity;
    return {
      osmId: place.osmId,
      osmName: place.name,
      name: place.name ?? `Unnamed ${place.place} (OSM ${place.osmId})`,
      place: place.place,
      location: place.location,
      population,
      waterwayDistanceM,
      // Without the raster every place counts as one person: the documented fallback.
      incidentWeight: (population ?? 1) * Math.exp(-waterwayDistanceM / WATERWAY_DECAY_M),
    };
  });
}

// Largest first: the city, towns and suburbs before villages, then by estimated population.
export function rankSettlements(settlements: readonly Settlement[]): Settlement[] {
  const isUrban = (settlement: Settlement) => URBAN_KINDS.includes(settlement.place);
  return [...settlements].sort(
    (a, b) =>
      Number(isUrban(b)) - Number(isUrban(a)) ||
      (b.population ?? -1) - (a.population ?? -1) ||
      KIND_RANK[a.place] - KIND_RANK[b.place] ||
      compareText(a.osmId, b.osmId),
  );
}
