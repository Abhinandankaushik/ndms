import type { DisasterType } from './contract';

export interface PriorityInput {
  type: DisasterType;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  isSos: boolean;
  minutesWaiting: number;
}

export interface PriorityResult {
  priorityScore: number;
  severityLevel: number;
}

// Rule-based triage for the Minor phase; the Major phase trains a model on labels bootstrapped
// from rules like these (implementation plan §8.2, B9.3). The maxima of the five parts add up
// to 100, so each weight reads as that factor's share of the score:
// hazard 30 + people 20 + vulnerability 25 + SOS 15 + waiting 10.

// Hazards that trap people come first, because survival odds fall within hours. Floods and
// cyclones usually arrive with warning and allow sheltering. OTHER also covers one-tap SOS
// reports that never picked a type, so it is not scored as a minor hazard.
const HAZARD_POINTS: Record<DisasterType, number> = {
  BUILDING_COLLAPSE: 30,
  EARTHQUAKE: 28,
  LANDSLIDE: 26,
  FIRE: 26,
  FLOOD: 22,
  CYCLONE: 18,
  OTHER: 14,
};

// Each doubling of the people affected adds 4 points: a family outranks one person, but a crowd
// cannot drown out every other report. The cap is reached at about 30 people.
const POINTS_PER_DOUBLING_OF_PEOPLE = 4;
const MAX_PEOPLE_POINTS = 20;

// Injury threatens life now; children and elderly people are the groups least able to evacuate
// on their own.
const INJURED_POINTS = 12;
const CHILDREN_POINTS = 7;
const ELDERLY_POINTS = 6;

// The SOS button is what people press when there is no time to fill in a report.
const SOS_POINTS = 15;

// A report held offline is older and more urgent, not newer (CLAUDE.md rule 3): one point per
// 12 minutes waited, capped at two hours.
const MINUTES_PER_WAITING_POINT = 12;
const MAX_WAITING_POINTS = 10;

const MAX_HARM_POINTS =
  Math.max(...Object.values(HAZARD_POINTS)) + MAX_PEOPLE_POINTS + INJURED_POINTS + CHILDREN_POINTS + ELDERLY_POINTS + SOS_POINTS;
const SEVERITY_LEVELS = 5;

export function scoreIncident(input: PriorityInput): PriorityResult {
  const harm = harmPoints(input);
  return {
    priorityScore: toHundredths(clamp(harm + waitingPoints(input.minutesWaiting), 0, 100)),
    severityLevel: severityLevel(harm),
  };
}

function harmPoints(input: PriorityInput): number {
  // An enum value added by a later migration still gets scored, as OTHER, until this table learns it.
  const hazard = HAZARD_POINTS[input.type] ?? HAZARD_POINTS.OTHER;
  const people = Math.min(MAX_PEOPLE_POINTS, POINTS_PER_DOUBLING_OF_PEOPLE * Math.log2(1 + atLeastZero(input.peopleAffected)));
  const vulnerability =
    (input.hasInjured ? INJURED_POINTS : 0) + (input.hasChildren ? CHILDREN_POINTS : 0) + (input.hasElderly ? ELDERLY_POINTS : 0);
  return hazard + people + vulnerability + (input.isSos ? SOS_POINTS : 0);
}

function waitingPoints(minutesWaiting: number): number {
  return Math.min(MAX_WAITING_POINTS, atLeastZero(minutesWaiting) / MINUTES_PER_WAITING_POINT);
}

// Severity describes the situation itself, so waiting raises priority but never severity.
function severityLevel(harm: number): number {
  const share = clamp(harm, 0, MAX_HARM_POINTS) / MAX_HARM_POINTS;
  return Math.min(SEVERITY_LEVELS, 1 + Math.floor(share * SEVERITY_LEVELS));
}

const atLeastZero = (value: number) => (value > 0 ? value : 0);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toHundredths = (value: number) => Math.round(value * 100) / 100;
