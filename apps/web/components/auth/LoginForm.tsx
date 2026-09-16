'use client';

import { CircleAlert, KeyRound, LoaderCircle, ShieldAlert, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/api-error';
import { sendOtp, verifyOtp } from '@/lib/api/endpoints/auth';
import { landingPathFor, startSession, useSessionStatus, useSessionUser } from '@/lib/auth/session';
import { formatPhoneForDisplay, toE164 } from '@/lib/phone';

const SHOW_DEV_OTP_HINT = process.env.NEXT_PUBLIC_SHOW_DEV_OTP_HINT === 'true';
const DEV_OTP_CODE = '123456';

type LoginStep = { kind: 'phone' } | { kind: 'code'; phone: string; expiresInSeconds: number };

export function LoginForm() {
  const router = useRouter();
  const status = useSessionStatus();
  const role = useSessionUser()?.role ?? null;
  const [step, setStep] = useState<LoginStep>({ kind: 'phone' });
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBusy = isPending || status === 'authenticated';

  useEffect(() => {
    if (status !== 'authenticated' || !role) return;
    const requested = new URLSearchParams(window.location.search).get('next');
    router.replace(landingPathFor(role, requested));
  }, [status, role, router]);

  const run = async (action: () => Promise<void>) => {
    setIsPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(describeLoginError(caught));
    } finally {
      setIsPending(false);
    }
  };

  const requestCode = (phone: string) =>
    run(async () => {
      const sent = await sendOtp(phone);
      setStep({ kind: 'code', phone, expiresInSeconds: sent.expiresInSeconds });
    });

  const resendCode = (phone: string) =>
    run(async () => {
      const sent = await sendOtp(phone);
      setStep({ kind: 'code', phone, expiresInSeconds: sent.expiresInSeconds });
      toast({ title: 'New code sent', description: `Check the messages on ${formatPhoneForDisplay(phone)}.` });
    });

  const confirmCode = (phone: string, code: string) =>
    run(async () => {
      startSession(await verifyOtp(phone, code));
    });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert aria-hidden className="size-6" />
        </div>
        <CardTitle className="text-xl">Sign in to NDMS</CardTitle>
        <CardDescription>
          {step.kind === 'phone'
            ? 'We will send a one-time code to your mobile number.'
            : `Enter the 6-digit code sent to ${formatPhoneForDisplay(step.phone)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {SHOW_DEV_OTP_HINT && (
          <Alert>
            <KeyRound />
            <AlertTitle>Development build</AlertTitle>
            <AlertDescription>No SMS is sent. Use {DEV_OTP_CODE} as the code.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {step.kind === 'phone' ? (
          <PhoneStep
            isBusy={isBusy}
            isPending={isPending}
            onInvalid={setError}
            onSubmit={(phone) => void requestCode(phone)}
          />
        ) : (
          <CodeStep
            key={step.phone}
            expiresInSeconds={step.expiresInSeconds}
            isBusy={isBusy}
            isPending={isPending}
            onInvalid={setError}
            onSubmit={(code) => void confirmCode(step.phone, code)}
            onResend={() => void resendCode(step.phone)}
            onChangeNumber={() => {
              setError(null);
              setStep({ kind: 'phone' });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface StepProps {
  isBusy: boolean;
  isPending: boolean;
  onInvalid: (message: string) => void;
}

function PhoneStep({ isBusy, isPending, onInvalid, onSubmit }: StepProps & { onSubmit: (phone: string) => void }) {
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState('');
  const isInternational = value.trimStart().startsWith('+');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const phone = toE164(value);
    if (phone) onSubmit(phone);
    else onInvalid('Enter a 10-digit mobile number, or a full international number starting with +.');
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor={inputId}>Mobile number</Label>
        <div className="flex">
          {!isInternational && (
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              +91
            </span>
          )}
          <Input
            id={inputId}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            className={isInternational ? 'h-11' : 'h-11 rounded-l-none'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={hintId}
            autoFocus
            required
          />
        </div>
        <p id={hintId} className="text-xs text-muted-foreground">
          Indian numbers need only the 10 digits. For another country, type the full number starting with +.
        </p>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isBusy}>
        {isPending ? <LoaderCircle className="animate-spin" /> : <Smartphone />}
        Send code
      </Button>
    </form>
  );
}

function CodeStep({
  expiresInSeconds,
  isBusy,
  isPending,
  onInvalid,
  onSubmit,
  onResend,
  onChangeNumber,
}: StepProps & {
  expiresInSeconds: number;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const [code, setCode] = useState('');
  const expiresInMinutes = Math.max(1, Math.round(expiresInSeconds / 60));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (/^\d{6}$/.test(code)) onSubmit(code);
    else onInvalid('Enter all 6 digits of the code.');
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor={inputId}>6-digit code</Label>
        <Input
          id={inputId}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          className="h-12 text-center font-mono text-lg tracking-[0.5em]"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-describedby={hintId}
          autoFocus
          required
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          The code expires in {expiresInMinutes} {expiresInMinutes === 1 ? 'minute' : 'minutes'}.
        </p>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isBusy}>
        {isPending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
        Verify and sign in
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="link" className="h-auto px-0" onClick={onChangeNumber} disabled={isBusy}>
          Use a different number
        </Button>
        <Button type="button" variant="link" className="h-auto px-0" onClick={onResend} disabled={isBusy}>
          Send a new code
        </Button>
      </div>
    </form>
  );
}

function describeLoginError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'You appear to be offline. Check your connection and try again.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a few minutes before trying again.';
    case 'VALIDATION_FAILED':
      return 'That does not look right. Check the number or code and try again.';
    default:
      return error.message;
  }
}
