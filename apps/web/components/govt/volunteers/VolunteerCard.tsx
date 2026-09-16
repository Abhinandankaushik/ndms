'use client';

import { CircleCheck, FileText, ImageIcon, MapPin, Phone, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { VolunteerApplication, VolunteerDocumentLink } from '@/lib/api/types';
import { VERIFICATION_STATUS_LABELS } from '@/lib/labels';
import { formatPhoneForDisplay } from '@/lib/phone';
import { formatAge, formatBytes, formatCoordinates, formatDateTime, humanizeCode } from '../lib/format';

export function VolunteerCard({
  application,
  now,
  linksExpired,
  onApprove,
  onReject,
}: {
  application: VolunteerApplication;
  now: number;
  linksExpired: boolean;
  onApprove?: (application: VolunteerApplication) => void;
  onReject?: (application: VolunteerApplication) => void;
}) {
  const isPending = application.verificationStatus === 'PENDING';

  return (
    <article className="grid gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="font-semibold">{application.fullName ?? 'Name not provided'}</h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Phone aria-hidden className="size-3.5" />
              <a href={`tel:${application.phone}`} className="underline-offset-4 hover:underline">
                {formatPhoneForDisplay(application.phone)}
              </a>
            </span>
            <span>Applied {formatAge(application.createdAt, now)}</span>
          </p>
        </div>
        <Badge variant="outline">{VERIFICATION_STATUS_LABELS[application.verificationStatus]}</Badge>
      </header>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="grid gap-1">
          <dt className="text-xs text-muted-foreground">Skills</dt>
          <dd className="flex flex-wrap gap-1">
            {application.skills.length === 0 ? (
              <span className="text-muted-foreground">None listed</span>
            ) : (
              application.skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="font-normal">
                  {humanizeCode(skill)}
                </Badge>
              ))
            )}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-xs text-muted-foreground">Service area</dt>
          <dd className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5 text-muted-foreground" />
            {application.serviceRadiusKm} km around{' '}
            {application.lat !== null && application.lon !== null
              ? formatCoordinates(application.lat, application.lon)
              : 'an unknown location'}
          </dd>
        </div>
        {application.reviewedAt && (
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Reviewed</dt>
            <dd>{formatDateTime(application.reviewedAt)}</dd>
          </div>
        )}
        {application.rejectionReason && (
          <div className="grid gap-1 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Reason given</dt>
            <dd className="whitespace-pre-wrap">{application.rejectionReason}</dd>
          </div>
        )}
      </dl>

      <section className="grid gap-1.5">
        <h4 className="text-xs text-muted-foreground">Identity documents</h4>
        {application.documents.length === 0 ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-amber-800">
            <TriangleAlert aria-hidden className="size-4" />
            No documents uploaded yet.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {application.documents.map((document, index) => (
              <li key={document.id}>
                <DocumentLink document={document} index={index} expired={linksExpired} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {isPending && onApprove && onReject && (
        <footer className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => onReject(application)}>
            Reject…
          </Button>
          <Button onClick={() => onApprove(application)}>
            <CircleCheck />
            Approve
          </Button>
        </footer>
      )}
    </article>
  );
}

function DocumentLink({ document, index, expired }: { document: VolunteerDocumentLink; index: number; expired: boolean }) {
  const isPdf = document.contentType === 'application/pdf';
  const Icon = isPdf ? FileText : ImageIcon;
  const label = `${isPdf ? 'PDF' : 'Photo'} ${index + 1}${document.sizeBytes ? ` · ${formatBytes(document.sizeBytes)}` : ''}`;

  if (expired) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-sm text-muted-foreground">
        <Icon aria-hidden className="size-4" />
        {label} (link expired)
      </span>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <a href={document.url} target="_blank" rel="noreferrer">
        <Icon aria-hidden />
        {label}
      </a>
    </Button>
  );
}
