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
  type DisasterType,
  type IncidentStatus,
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

// Selecting an item would otherwise close the menu after every tick of a multi-select.
const keepMenuOpen = (event: Event) => event.preventDefault();

export function IncidentFilterBar({ className }: { className?: string }) {
  const filters = useIncidentFilters();
  const sosSwitchId = useId();
  const { data: district } = useQuery(districtQuery());

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div role="group" aria-label="Incident filters" className="flex flex-wrap items-center gap-2">
        <ListFilter aria-hidden className="size-4 text-muted-foreground" />
        <StatusFilterMenu selected={filters.statuses} />
        <TypeFilterMenu selected={filters.types} />
        <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3">
          <Switch id={sosSwitchId} checked={filters.sosOnly} onCheckedChange={setSosOnly} />
          <Label htmlFor={sosSwitchId} className="text-sm font-normal">
            SOS only
          </Label>
        </div>
        {!isDefaultIncidentFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={resetIncidentFilters}>
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
