import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { IncidentStatus, UserRole } from '../../common/domain/enums';

const OFFICIAL_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  REPORTED: ['VERIFIED', 'ASSIGNED', 'RESOLVED', 'REJECTED_DUPLICATE', 'REJECTED_FAKE'],
  VERIFIED: ['ASSIGNED', 'RESOLVED', 'REJECTED_DUPLICATE', 'REJECTED_FAKE'],
  ASSIGNED: ['IN_PROGRESS', 'VERIFIED', 'RESOLVED'],
  IN_PROGRESS: ['ASSIGNED', 'RESOLVED'],
  RESOLVED: ['REPORTED'],
  REJECTED_DUPLICATE: ['REPORTED'],
  REJECTED_FAKE: ['REPORTED'],
};

// Rescue teams move work forward on the ground; verification and rejection stay with
// officials so every rejection is a human decision (CLAUDE.md rule 8).
const RESCUE_TEAM_TRANSITIONS: Partial<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
};

export function assertTransitionAllowed(from: IncidentStatus, to: IncidentStatus, role: UserRole): void {
  if (role !== 'GOVT_OFFICIAL' && role !== 'RESCUE_TEAM') {
    throw new ForbiddenException({ code: 'FORBIDDEN_ROLE', message: 'Only officials and rescue teams change status' });
  }

  const table = role === 'GOVT_OFFICIAL' ? OFFICIAL_TRANSITIONS : RESCUE_TEAM_TRANSITIONS;
  if (!table[from]?.includes(to)) {
    throw new ConflictException({
      code: 'INVALID_TRANSITION',
      message: `${role} cannot move an incident from ${from} to ${to}`,
    });
  }
}
