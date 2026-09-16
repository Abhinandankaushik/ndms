import { Ambulance, Building, Flame, Landmark, PhoneCall, Siren, type LucideIcon } from 'lucide-react';
import { CitizenPage, PageHeader } from '@/components/citizen/common/page';
import { cn } from '@/lib/utils';

type HelplineScope = 'National helpline' | 'State helpline' | 'District control room';

interface Helpline {
  number: string;
  name: string;
  description: string;
  scope: HelplineScope;
  icon: LucideIcon;
}

// Static on purpose: standard national and state numbers only, never district phone numbers NDMS cannot verify.
const HELPLINES: readonly Helpline[] = [
  {
    number: '112',
    name: 'Emergency (ERSS)',
    description: 'Police, fire and ambulance through one number.',
    scope: 'National helpline',
    icon: Siren,
  },
  {
    number: '108',
    name: 'Ambulance',
    description: 'Emergency ambulance service.',
    scope: 'State helpline',
    icon: Ambulance,
  },
  {
    number: '101',
    name: 'Fire',
    description: 'Fire and rescue services.',
    scope: 'National helpline',
    icon: Flame,
  },
  {
    number: '1070',
    name: 'State emergency operations helpline',
    description: "The state's disaster emergency operations centre.",
    scope: 'State helpline',
    icon: Landmark,
  },
  {
    number: '1077',
    name: 'District disaster control room',
    description: 'The disaster control room of the district you are calling from.',
    scope: 'District control room',
    icon: Building,
  },
];

export function HelplineList() {
  return (
    <CitizenPage>
      <PageHeader
        title="Emergency helplines"
        description="National and state helpline numbers in India. Calls are free and work without mobile data."
      />
      <ul className="grid gap-3">
        {HELPLINES.map((helpline) => (
          <li key={helpline.number}>
            <HelplineCard helpline={helpline} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-foreground/75">
        1070 and 1077 are run by state governments, so whether they answer can vary by state. If a life is in danger,
        call 112 first.
      </p>
    </CitizenPage>
  );
}

function HelplineCard({ helpline }: { helpline: Helpline }) {
  const Icon = helpline.icon;
  const isPrimary = helpline.number === '112';

  return (
    <a
      href={`tel:${helpline.number}`}
      aria-label={`Call ${helpline.number}, ${helpline.name}. ${helpline.scope}.`}
      className={cn(
        'flex min-h-20 items-center gap-4 rounded-xl border-2 p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isPrimary ? 'border-red-700 bg-red-600 text-white hover:bg-red-700' : 'bg-card hover:bg-accent',
      )}
    >
      <Icon aria-hidden className="size-7 shrink-0" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-3xl leading-none font-black tracking-wide">{helpline.number}</span>
        <span className="text-base font-semibold">{helpline.name}</span>
        <span className={cn('text-sm', isPrimary ? 'text-white/90' : 'text-foreground/75')}>{helpline.description}</span>
        <span
          className={cn(
            'mt-1 w-fit rounded-md border px-2 py-0.5 text-xs font-bold uppercase',
            isPrimary ? 'border-white/80' : 'border-foreground/30',
          )}
        >
          {helpline.scope}
        </span>
      </span>
      <PhoneCall aria-hidden className="size-6 shrink-0" />
    </a>
  );
}
