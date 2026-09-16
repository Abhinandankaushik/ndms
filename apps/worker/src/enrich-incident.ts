import type { Pool, PoolClient } from 'pg';
import { OPEN_INCIDENT_STATUSES, rooms, type ReviewReason } from './contract';
import { withTransaction } from './db';
import type { PublishEvent } from './events';
import {
  findDuplicateCandidate,
  findIncidentForEnrichment,
  insertReview,
  saveScore,
  type IncidentForEnrichment,
  type NewReview,
  type ReviewRecord,
} from './incidents.repository';
import { scoreIncident } from './priority';

const DUPLICATE_RULE = { radiusM: 150, windowMinutes: 15 };

export interface EnrichmentDeps {
  pool: Pool;
  publish: PublishEvent;
}

export interface EnrichmentResult {
  priorityScore: number;
  severityLevel: number;
  flags: ReviewReason[];
  reviewsCreated: number;
}

export async function enrichIncident({ pool, publish }: EnrichmentDeps, incidentId: string): Promise<EnrichmentResult | null> {
  const incident = await findIncidentForEnrichment(pool, incidentId);
  if (!incident) return null;

  const { priorityScore, severityLevel } = scoreIncident(incident);
  const findings = await findReviewReasons(pool, incident);
  const createdReviews = await withTransaction(pool, async (db) => {
    await saveScore(db, incident.id, { priorityScore, severityLevel });
    return insertNewReviews(db, incident.id, findings);
  });
  const flags = findings.map((finding) => finding.reason);

  await publish({
    name: 'incident:enriched',
    rooms: [rooms.district(incident.districtId), rooms.incident(incident.id)],
    payload: { id: incident.id, priorityScore, severityLevel, flags },
  });
  for (const review of createdReviews) {
    await publish({ name: 'review:created', rooms: [rooms.district(incident.districtId)], payload: review });
  }

  return { priorityScore, severityLevel, flags, reviewsCreated: createdReviews.length };
}

// Flags only route a report to a human (rule 8). A report already closed by the time enrichment
// runs needs no review, so it gets none.
async function findReviewReasons(pool: Pool, incident: IncidentForEnrichment): Promise<NewReview[]> {
  if (!OPEN_INCIDENT_STATUSES.includes(incident.status)) return [];

  if (incident.locationSource === 'NONE') {
    return [{ reason: 'LOCATION_UNCERTAIN', relatedIncidentId: null, details: { locationSource: 'NONE' } }];
  }

  const duplicate = await findDuplicateCandidate(pool, incident.id, DUPLICATE_RULE);
  if (!duplicate) return [];
  return [
    {
      reason: 'POSSIBLE_DUPLICATE',
      relatedIncidentId: duplicate.id,
      details: { distanceM: duplicate.distanceM, minutesApart: duplicate.minutesApart },
    },
  ];
}

async function insertNewReviews(db: PoolClient, incidentId: string, findings: NewReview[]): Promise<ReviewRecord[]> {
  const created: ReviewRecord[] = [];
  for (const finding of findings) {
    const review = await insertReview(db, incidentId, finding);
    if (review) created.push(review);
  }
  return created;
}
