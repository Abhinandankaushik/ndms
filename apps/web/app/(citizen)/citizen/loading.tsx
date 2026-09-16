import { LoaderCircle } from 'lucide-react';

export default function CitizenLoading() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-3 px-4 py-16 text-base font-medium">
      <LoaderCircle aria-hidden className="size-6 animate-spin" />
      Loading…
    </div>
  );
}
