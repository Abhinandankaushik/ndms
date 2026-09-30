'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  SEARCH_DEBOUNCE_MS,
  clearSearchTerm,
  setSearchTerm,
  useIncidentSearch,
} from './incident-search';

export function IncidentSearchBox({ className }: { className?: string }) {
  const committed = useIncidentSearch((state) => state.term);
  const [typed, setTyped] = useState(committed);
  const inputId = useId();

  // The store is the one the query reads, so typing is held back until it settles; a reset
  // elsewhere clears the store, and this pulls the box back in step with it.
  useEffect(() => {
    if (committed === '') setTyped('');
  }, [committed]);

  useEffect(() => {
    if (typed === committed) return;
    const timer = setTimeout(() => setSearchTerm(typed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, committed]);

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={inputId} className="sr-only">
        Search incidents by place, description, id or reporter phone
      </label>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={inputId}
        type="search"
        value={typed}
        placeholder="Search place, words, id or phone"
        autoComplete="off"
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setSearchTerm(typed);
          if (event.key === 'Escape') {
            setTyped('');
            clearSearchTerm();
          }
        }}
        className="h-9 w-full ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {typed !== '' && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          onClick={() => {
            setTyped('');
            clearSearchTerm();
          }}
          className="absolute end-1 top-1/2 size-7 -translate-y-1/2"
        >
          <X />
        </Button>
      )}
    </div>
  );
}
