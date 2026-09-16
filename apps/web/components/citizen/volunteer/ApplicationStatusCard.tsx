import { BadgeCheck, CircleX, Hourglass, SquarePen, type LucideIcon } from 'lucide-react';
import { formatTimestamp } from '@/components/citizen/common/format';
import { Button } from '@/components/ui/button';
import type { VerificationStatus, VolunteerProfile } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { skillLabel } from './skills';

interface StatusPresentation {
  icon: LucideIcon;
  title: string;
  detail: string;
  tone: string;
}

const STATUS_PRESENTATION: Record<VerificationStatus, StatusPresentation> = {
  PENDING: {
    icon: Hourglass,
    title: 'Application under review',
    detail: 'A district official checks every volunteer before they can take tasks. An ID document helps them decide.',
    tone: 'border-amber-600 bg-amber-50 text-amber-950',
  },
  REJECTED: {
    icon: CircleX,
    title: 'Application not approved',
    detail: 'You can change your details and apply again.',
    tone: 'border-red-700 bg-red-50 text-red-950',
  },
  VERIFIED: {
    icon: BadgeCheck,
    title: 'Verified volunteer',
    detail: 'You can accept tasks near you.',
    tone: 'border-emerald-700 bg-emerald-50 text-emerald-950',
  },
};

export function ApplicationStatusCard({ profile, now, onEdit }: { profile: VolunteerProfile; now: number; onEdit: () => void }) {
  const presentation = STATUS_PRESENTATION[profile.verificationStatus];
  const Icon = presentation.icon;

  return (
    <section aria-label="Volunteer application" className={cn('grid gap-3 rounded-xl border-2 p-4', presentation.tone)}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden className="size-8 shrink-0" />
        <div className="grid gap-1">
          <h2 className="text-xl font-bold">{presentation.title}</h2>
          <p className="text-base">{presentation.detail}</p>
          {profile.verificationStatus === 'REJECTED' && profile.rejectionReason && (
            <p className="text-base">
              <span className="font-semibold">Reason: </span>
              {profile.rejectionReason}
            </p>
          )}
          <p className="text-sm opacity-90">
            {profile.reviewedAt
              ? `Reviewed ${formatTimestamp(profile.reviewedAt, now)}`
              : `Applied ${formatTimestamp(profile.createdAt, now)}`}
          </p>
        </div>
      </div>
      <dl className="grid gap-2 rounded-lg bg-white/70 p-3 text-base text-foreground">
        <div>
          <dt className="text-sm font-medium text-foreground/70">Skills</dt>
          <dd className="font-medium">{profile.skills.length > 0 ? profile.skills.map(skillLabel).join(', ') : 'General help'}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-foreground/70">Travel distance</dt>
          <dd className="font-medium">Up to {profile.serviceRadiusKm} km</dd>
        </div>
      </dl>
      <Button type="button" size="xl" variant="outline" className="w-full bg-white text-foreground" onClick={onEdit}>
        <SquarePen />
        {profile.verificationStatus === 'REJECTED' ? 'Change details and apply again' : 'Edit details'}
      </Button>
    </section>
  );
}
