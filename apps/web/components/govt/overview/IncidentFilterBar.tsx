'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ListFilter, RotateCcw } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DISASTER_TYPES,
  INCIDENT_STATUSES,
  OPEN_INCIDENT_STATUSES,
  QUEUE_SORTS,
  type DisasterType,
  type IncidentStatus,
  type QueueSort,
} from '@/lib/api/types';
import { DISASTER_TYPE_LABELS, INCIDENT_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { districtQuery } from '../queries';
import {
  CLOSED_INCIDENT_STATUSES,
  clearTypeFilter,
  isDefaultIncidentFilters,
  resetIncidentFilters,
  setSosOnly,
  setStatusFilter,
  toggleStatusFilter,
  toggleTypeFilter,
  useIncidentFilters,
} from './incident-filters';
import {
  TIME_WINDOWS,
  isDefaultIncidentSearch,
  isSearching,
  resetIncidentSearch,
  setQueueSort,
  setTimeWindow,
  useIncidentSearch,
  type TimeWindowId,
} from './incident-search';
import { IncidentSearchBox } from './IncidentSearchBox';

// Selecting an item would otherwise close the menu after every tick of a multi-select.
const keepMenuOpen = (event: Event) => event.preventDefault();

export function IncidentFilterBar({ className }: { className?: string }) {
  const filters = useIncidentFilters();
  const sosSwitchId = useId();
  const { data: district } = useQuery(districtQuery());

  const search = useIncidentSearch();
  const searching = isSearching(search.term);
  const isDefault = isDefaultIncidentFilters(filters) && isDefaultIncidentSearch(search);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <IncidentSearchBox className="w-full sm:w-72" />
      {/* Every control except the time window shapes the queue. A search deliberately spans
          all statuses and types — that is how a resolved or rejected report stays findable —
          so showing them while one runs would promise filtering that is not applied. */}
      <div role="group" aria-label="Incident filters" className="flex flex-wrap items-center gap-2">
        <ListFilter aria-hidden className="size-4 text-muted-foreground" />
        {!searching && (
          <>
            <StatusFilterMenu selected={filters.statuses} />
            <TypeFilterMenu selected={filters.types} />
            <SortMenu selected={search.sort} />
          </>
        )}
        <TimeWindowMenu selected={search.window} />
        {!searching && (
          <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3">
            <Switch id={sosSwitchId} checked={filters.sosOnly} onCheckedChange={setSosOnly} />
            <Label htmlFor={sosSwitchId} className="text-sm font-normal">
              SOS only
            </Label>
          </div>
        )}
        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetIncidentFilters();
              resetIncidentSearch();
            }}
          >
            <RotateCcw />
            Reset
          </Button>
        )}
      </div>
      {district && (
        <p className="ml-auto text-sm text-muted-foreground">
          {district.name}, {district.state}
        </p>
      )}
    </div>
  );
}

const SORT_LABELS: Record<QueueSort, string> = {
  priority: 'Highest priority',
  newest: 'Newest first',
};

function SortMenu({ selected }: { selected: QueueSort }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-40 justify-between">
          <span>
            <span className="sr-only">Sort: </span>
            {SORT_LABELS[selected]}
          </span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Sort the queue by</DropdownMenuLabel>
        {QUEUE_SORTS.map((sort) => (
          <DropdownMenuCheckboxItem key={sort} checked={selected === sort} onCheckedChange={() => setQueueSort(sort)}>
            {SORT_LABELS[sort]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TimeWindowMenu({ selected }: { selected: TimeWindowId }) {
  const label = TIME_WINDOWS.find((entry) => entry.id === selected)?.label ?? 'Any time';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-36 justify-between">
          <span>
            <span className="sr-only">Reported: </span>
            {label}
          </span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>Reported within</DropdownMenuLabel>
        {TIME_WINDOWS.map((entry) => (
          <DropdownMenuCheckboxItem
            key={entry.id}
            checked={selected === entry.id}
            onCheckedChange={() => setTimeWindow(entry.id)}
          >
            {entry.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function statusSummary(selected: readonly IncidentStatus[]): string {
  if (selected.length === INCIDENT_STATUSES.length) return 'All statuses';
  if (sameSet(selected, OPEN_INCIDENT_STATUSES)) return 'Open incidents';
  if (sameSet(selected, CLOSED_INCIDENT_STATUSES)) return 'Closed incidents';
  const [only] = selected;
  return selected.length === 1 && only ? INCIDENT_STATUS_LABELS[only] : `${selected.length} statuses`;
}

function StatusFilterMenu({ selected }: { selected: readonly IncidentStatus[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-40 justify-between">
          <span>
            <span className="sr-only">Status: </span>
            {statusSummary(selected)}
          </span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setStatusFilter(OPEN_INCIDENT_STATUSES)}>Open incidents</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setStatusFilter(CLOSED_INCIDENT_STATUSES)}>Closed incidents</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setStatusFilter(INCIDENT_STATUSES)}>All statuses</DropdownMenuItem>
        <DropdownMenuSeparator />
        {INCIDENT_STATUSES.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={selected.includes(status)}
            disabled={selected.length === 1 && selected.includes(status)}
            onCheckedChange={() => toggleStatusFilter(status)}
            onSelect={keepMenuOpen}
          >
            {INCIDENT_STATUS_LABELS[status]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TypeFilterMenu({ selected }: { selected: readonly DisasterType[] }) {
  const [only] = selected;
  const summary =
    selected.length === 0 ? 'All types' : selected.length === 1 && only ? DISASTER_TYPE_LABELS[only] : `${selected.length} types`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-36 justify-between">
          <span>
            <span className="sr-only">Type: </span>
            {summary}
          </span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={clearTypeFilter}>All types</DropdownMenuItem>
        <DropdownMenuSeparator />
        {DISASTER_TYPES.map((type) => (
          <DropdownMenuCheckboxItem
            key={type}
            checked={selected.includes(type)}
            onCheckedChange={() => toggleTypeFilter(type)}
            onSelect={keepMenuOpen}
          >
            {DISASTER_TYPE_LABELS[type]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && b.every((entry) => a.includes(entry));
}
