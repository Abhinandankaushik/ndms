'use client';

import { CircleAlert, CircleCheckBig, Hourglass, PhoneCall, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SosButton } from './SosButton';
import {
  dismissSosOutcome,
  retrySos,
  startSos,
  useSosPhase,
  useSosScreenPresence,
  type SosPhase,
} from './sos-flow';

export function SosPanel() {
  const router = useRouter();
  const phase = useSosPhase();
  const instructionsId = useId();
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const openedConfirmationFor = useRef<string | null>(null);
  useSosScreenPresence();

  useEffect(() => {
    if (phase.kind !== 'sent' || openedConfirmationFor.current === phase.incidentId) return;
    openedConfirmationFor.current = phase.incidentId;
    router.push(`/citizen/incidents/${encodeURIComponent(phase.incidentId)}?sent=sos`);
  }, [phase, router]);

  const isBusy = phase.kind === 'locating' || phase.kind === 'sending' || phase.kind === 'sent' || phase.kind === 'queued';

  return (
    <section aria-labelledby={`${instructionsId}-title`} className="grid justify-items-center gap-4 text-center">
      <h1 id={`${instructionsId}-title`} className="text-2xl font-bold tracking-tight">
        Need help now?
      </h1>
      <SosButton
        busy={isBusy}
        statusLabel={BUSY_LABELS[phase.kind]}
        describedBy={instructionsId}
        onActivate={() => void startSos()}
        onAssistiveActivate={() => setConfirmOpen(true)}
      />
      <div id={instructionsId} className="w-full">
        <SosStatus phase={phase} />
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send an SOS?</DialogTitle>
            <DialogDescription className="text-base">
              NDMS will send your location to the district control room.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="xl" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="xl"
              onClick={() => {
                setConfirmOpen(false);
                void startSos();
              }}
            >
              Send SOS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const BUSY_LABELS: Record<SosPhase['kind'], string> = {
  idle: '',
  locating: 'Finding your location…',
  sending: 'Sending…',
  sent: 'Sent',
  queued: 'Saved on this phone',
  failed: '',
};

function SosStatus({ phase }: { phase: SosPhase }) {
  switch (phase.kind) {
    case 'idle':
      return (
        <p className="mx-auto max-w-xs text-base text-foreground/80">
          Press and hold for 3 seconds. NDMS sends your location to the district control room.
        </p>
      );
    case 'locating':
      return (
        <p role="status" className="mx-auto max-w-xs text-base font-medium">
          Finding your location. If it takes longer than 12 seconds, the SOS is sent without it.
        </p>
      );
    case 'sending':
      return (
        <p role="status" className="mx-auto max-w-xs text-base font-medium">
          Sending your SOS. On a weak network this can take a few seconds.
        </p>
      );
    case 'sent':
      return (
        <p role="status" className="mx-auto flex max-w-xs items-center justify-center gap-2 text-base font-semibold text-emerald-700">
          <CircleCheckBig aria-hidden className="size-5" />
          SOS sent. Opening its status…
        </p>
      );
    case 'queued':
      return (
        <Alert variant="warning" className="text-left">
          <Hourglass />
          <AlertTitle className="line-clamp-none text-base">Saved on this phone</AlertTitle>
          <AlertDescription className="text-base">
            <p>Your SOS will be sent automatically as soon as you have a connection. If you can, call 112 now.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CallEmergencyButton />
              <Button type="button" variant="outline" className="h-11" onClick={dismissSosOutcome}>
                OK
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );
    case 'failed':
      return (
        <Alert variant="destructive" className="border-destructive/60 text-left">
          <CircleAlert />
          <AlertTitle className="line-clamp-none text-base">Your SOS was not sent</AlertTitle>
          <AlertDescription className="text-base text-foreground">
            <p>{phase.message}</p>
            <div className="mt-2 grid w-full gap-2 min-[400px]:grid-cols-2">
              <Button type="button" size="xl" variant="destructive" onClick={() => void retrySos()}>
                <RefreshCw />
                Try again
              </Button>
              <CallEmergencyButton />
            </div>
          </AlertDescription>
        </Alert>
      );
  }
}

function CallEmergencyButton() {
  return (
    <Button asChild size="xl" variant="outline">
      <a href="tel:112">
        <PhoneCall />
        Call 112
      </a>
    </Button>
  );
}
