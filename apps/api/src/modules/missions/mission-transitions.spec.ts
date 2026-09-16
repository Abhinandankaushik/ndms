import { ConflictException } from '@nestjs/common';
import type { MissionStatus } from '../../common/domain/enums';
import { decideStep, OPEN_MISSION_STATUSES, type MissionActor } from './mission-transitions';

function refusalOf(from: MissionStatus, to: MissionStatus, actor: MissionActor): unknown {
  try {
    decideStep(from, to, actor);
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse();
  }
  throw new Error(`${actor} was allowed ${from} -> ${to}`);
}

describe('decideStep', () => {
  it.each([
    ['ASSIGNED', 'ACCEPTED'],
    ['ASSIGNED', 'REJECTED'],
    ['ACCEPTED', 'EN_ROUTE'],
    ['EN_ROUTE', 'ON_SITE'],
    ['ON_SITE', 'COMPLETED'],
  ] as const)('lets the team move a mission from %s to %s', (from, to) => {
    expect(decideStep(from, to, 'TEAM')).toBe('APPLY');
  });

  it.each(OPEN_MISSION_STATUSES)('lets an official cancel a mission that is %s', (from) => {
    expect(decideStep(from, 'CANCELLED', 'OFFICIAL')).toBe('APPLY');
  });

  it.each([
    ['ASSIGNED', 'EN_ROUTE', 'TEAM'],
    ['ACCEPTED', 'REJECTED', 'TEAM'],
    ['ACCEPTED', 'COMPLETED', 'TEAM'],
    ['COMPLETED', 'CANCELLED', 'OFFICIAL'],
    ['REJECTED', 'ACCEPTED', 'TEAM'],
    ['ACCEPTED', 'CANCELLED', 'TEAM'],
    ['ASSIGNED', 'ACCEPTED', 'OFFICIAL'],
    ['ACCEPTED', 'ASSIGNED', 'OFFICIAL'],
  ] as const)('refuses %s -> %s by the %s', (from, to, actor) => {
    expect(refusalOf(from, to, actor)).toMatchObject({ code: 'INVALID_MISSION_TRANSITION' });
  });

  it('treats a repeat of the current step as a replay', () => {
    expect(decideStep('ACCEPTED', 'ACCEPTED', 'TEAM')).toBe('REPLAY');
    expect(decideStep('CANCELLED', 'CANCELLED', 'OFFICIAL')).toBe('REPLAY');
  });

  it('still refuses a repeat the actor could never have made', () => {
    expect(refusalOf('CANCELLED', 'CANCELLED', 'TEAM')).toMatchObject({ code: 'INVALID_MISSION_TRANSITION' });
  });
});
