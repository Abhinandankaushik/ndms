export const VOLUNTEER_SKILLS = ['DOCTOR', 'NURSE', 'DRIVER', 'SWIMMER', 'ELECTRICIAN', 'ENGINEER', 'COOK', 'FIRST_AID'] as const;
export type VolunteerSkill = (typeof VOLUNTEER_SKILLS)[number];

const SKILL_LABELS: Record<VolunteerSkill, string> = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  DRIVER: 'Driver',
  SWIMMER: 'Swimmer',
  ELECTRICIAN: 'Electrician',
  ENGINEER: 'Engineer',
  COOK: 'Cook',
  FIRST_AID: 'First aid',
};

export const SERVICE_RADIUS_OPTIONS_KM = [2, 5, 10, 25, 50] as const;
export const DEFAULT_SERVICE_RADIUS_KM = 10;

// Tasks may ask for skills outside the registration list; the API stores every skill as UPPER_SNAKE_CASE.
export function skillLabel(skill: string): string {
  const known = VOLUNTEER_SKILLS.find((candidate) => candidate === skill);
  if (known) return SKILL_LABELS[known];
  const words = skill.toLowerCase().replace(/_+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
