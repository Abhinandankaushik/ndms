'use client';

import { CircleAlert, CircleCheck, FileUp, LoaderCircle, RefreshCw } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { describeApiError, hasErrorCode } from '@/components/citizen/common/api-errors';
import { Panel } from '@/components/citizen/common/page';
import { compressImage, DOCUMENT_PHOTO_TARGET } from '@/components/citizen/report/compress-image';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { uploadVolunteerDocument } from '@/lib/api/endpoints/volunteers';
import { IMAGE_CONTENT_TYPES, MAX_UPLOAD_BYTES, VOLUNTEER_DOCUMENT_CONTENT_TYPES } from '@/lib/api/types';
import { createClientUuid } from '@/lib/client-uuid';

type DocumentStage = 'preparing' | 'uploading' | 'done' | 'failed';

interface DocumentUpload {
  id: string;
  file: File;
  stage: DocumentStage;
  fractionSent: number;
  error: string | null;
}

const ACCEPTED_DOCUMENT_TYPES = VOLUNTEER_DOCUMENT_CONTENT_TYPES.join(',');

export function DocumentUploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<readonly DocumentUpload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const isBusy = uploads.some((upload) => upload.stage === 'preparing' || upload.stage === 'uploading');

  const patch = (id: string, changes: Partial<DocumentUpload>) =>
    setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, ...changes } : upload)));

  const upload = async (id: string, file: File) => {
    patch(id, { stage: 'preparing', fractionSent: 0, error: null });
    try {
      const prepared = isImage(file) ? await compressImage(file, DOCUMENT_PHOTO_TARGET).catch(() => file) : file;
      patch(id, { stage: 'uploading' });
      let lastPercent = -1;
      await uploadVolunteerDocument(prepared, (fraction) => {
        const percent = Math.floor(fraction * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        patch(id, { fractionSent: fraction });
      });
      patch(id, { stage: 'done', fractionSent: 1 });
    } catch (error) {
      patch(id, { stage: 'failed', error: describeDocumentError(error) });
    }
  };

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    setNotice(null);
    const accepted = chosen.filter(isAcceptedDocument);
    if (accepted.length < chosen.length) setNotice('Documents must be JPEG, PNG or WebP photos, or PDFs under 10 MB.');
    const added = accepted.map((file): DocumentUpload => ({
      id: createClientUuid(),
      file,
      stage: 'preparing',
      fractionSent: 0,
      error: null,
    }));
    setUploads((current) => [...current, ...added]);
    for (const item of added) await upload(item.id, item.file);
  };

  return (
    <Panel title="Identity and skill documents">
      <p className="text-base text-foreground/80">
        Add a photo or PDF of a government ID, and a certificate for skills such as nursing or first aid. Only the
        district officials who review applications can open them.
      </p>
      {uploads.length > 0 && (
        <ul className="grid gap-2" aria-label="Document uploads">
          {uploads.map((item) => (
            <li key={item.id} className="grid gap-1.5 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-base font-semibold break-all">
                <DocumentStageIcon stage={item.stage} />
                {item.file.name}
              </p>
              {item.stage === 'uploading' && (
                <Progress value={item.fractionSent * 100} aria-label={`${item.file.name} upload progress`} />
              )}
              <p className={item.stage === 'failed' ? 'text-sm font-medium text-destructive' : 'text-sm text-foreground/75'}>
                {item.stage === 'failed'
                  ? item.error
                  : item.stage === 'done'
                    ? 'Uploaded. Officials can see it with your application.'
                    : item.stage === 'uploading'
                      ? `Uploading ${Math.round(item.fractionSent * 100)}%`
                      : 'Preparing…'}
              </p>
              {item.stage === 'failed' && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-fit"
                  disabled={isBusy}
                  onClick={() => void upload(item.id, item.file)}
                >
                  <RefreshCw />
                  Try again
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_TYPES}
        multiple
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(event) => void handleChange(event)}
      />
      <Button type="button" size="xl" variant="outline" className="w-full" disabled={isBusy} onClick={() => inputRef.current?.click()}>
        <FileUp />
        Add a document
      </Button>
      {notice && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {notice}
        </p>
      )}
      <p className="text-sm text-foreground/70">Documents you uploaded before are kept with your application but are not listed here again.</p>
    </Panel>
  );
}

function DocumentStageIcon({ stage }: { stage: DocumentStage }) {
  if (stage === 'done') return <CircleCheck aria-hidden className="size-5 shrink-0 text-emerald-700" />;
  if (stage === 'failed') return <CircleAlert aria-hidden className="size-5 shrink-0 text-destructive" />;
  return <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin" />;
}

function isImage(file: File): boolean {
  return IMAGE_CONTENT_TYPES.some((type) => type === file.type);
}

function isAcceptedDocument(file: File): boolean {
  return VOLUNTEER_DOCUMENT_CONTENT_TYPES.some((type) => type === file.type) && file.size > 0 && file.size <= MAX_UPLOAD_BYTES;
}

function describeDocumentError(error: unknown): string {
  if (hasErrorCode(error, 'VOLUNTEER_NOT_FOUND')) return 'Apply to volunteer before adding documents.';
  if (hasErrorCode(error, 'MEDIA_REJECTED')) return 'The server did not accept this file.';
  return describeApiError(error, 'The document could not be uploaded.');
}
