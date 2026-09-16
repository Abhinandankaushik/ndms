import type { DisasterType } from './domain.ts';
import type { SeededAgency } from './teams.ts';

// Synthetic free text for seeded reports and decisions. Nothing here describes a real event.

export const REPORT_DESCRIPTIONS: Record<DisasterType, readonly string[]> = {
  FLOOD: [
    'Flood water entered the house; family waiting on the roof',
    'Village road under water; people cannot get out',
    'Water rising fast near the embankment',
    'Elderly couple stranded in waist-deep water',
    'Families and cattle stuck on high ground',
    'Hand pump submerged; no drinking water left',
  ],
  FIRE: [
    'Fire in thatched houses, spreading with the wind',
    'Kitchen fire spread to neighbouring huts',
    'Short-circuit fire in a shop',
    'Haystack fire close to houses',
  ],
  BUILDING_COLLAPSE: [
    'Mud house wall collapsed after heavy rain',
    'Old building partly collapsed; people may be trapped',
    'Roof caved in; one person hurt',
  ],
  EARTHQUAKE: ['Cracks in walls after the tremor; family staying outside', 'House damaged by the tremor'],
  CYCLONE: ['Storm blew away tin roofs', 'Tree fell on a house during the storm'],
  LANDSLIDE: ['River bank gave way near houses'],
  OTHER: [
    'Snake bite; needs medical help',
    'Person swept away while crossing the water',
    'Pregnant woman needs transport to hospital',
    'Diarrhoea cases among stranded families',
  ],
};

export const CLUSTER_DESCRIPTIONS: readonly string[] = [
  'Fire in the market; shops burning',
  'Big fire near the market, smoke everywhere',
  'Shops on fire, people running out',
  'Market fire spreading to the next lane',
  'Fire in the bazaar; gas cylinders inside',
];

export const VERIFICATION_NOTE = 'Verified by call-back';
export const DUPLICATE_RESOLUTION_NOTE = 'Same event as an earlier report';

export const RESOLUTION_NOTES: readonly string[] = [
  'Water receded; family safe',
  'Handled by local volunteers',
  'Family moved to relatives nearby',
  'Resolved on call-back; no rescue needed',
];

export const FAKE_REJECTION_NOTES: readonly string[] = [
  'Caller unreachable and nothing found at the location',
  'No incident found on site verification',
  'Caller admitted it was a false alarm',
];

export const FAKE_FLAG_NOTE = 'Caller unreachable; no corroborating reports nearby';

export const MISSION_OUTCOMES: Record<SeededAgency, string> = {
  NDRF: 'Evacuated by boat to the nearest shelter',
  SDRF: 'Evacuated by boat to the nearest shelter',
  FIRE: 'Fire put out; no further spread',
  POLICE: 'Residents evacuated and the road cleared',
  HEALTH: 'First aid given; patient taken to hospital',
};

export const REPORTER_NAMES = {
  groups: [
    {
      share: 0.77,
      given: ['Ram', 'Sita', 'Mohan', 'Gita', 'Ramesh', 'Sunita', 'Mahesh', 'Anita', 'Rakesh', 'Kiran', 'Sanjay', 'Pooja', 'Manoj', 'Rekha', 'Vijay', 'Kavita', 'Dinesh', 'Priya', 'Mukesh', 'Sushila'],
      family: ['Jha', 'Mishra', 'Thakur', 'Yadav', 'Paswan', 'Sah', 'Mandal', 'Singh', 'Choudhary', 'Mahto', 'Sada', 'Das', 'Pandit', 'Raut'],
    },
    {
      share: 0.23,
      given: ['Imran', 'Salma', 'Shahid', 'Nasreen', 'Farhan', 'Rubina', 'Aftab', 'Zeenat', 'Irfan', 'Shabnam'],
      family: ['Ansari', 'Khan', 'Alam', 'Rahman', 'Siddiqui', 'Hussain'],
    },
  ],
} as const;
