'use client';

import { useQuery } from '@tanstack/react-query';
import { PackageX, RefreshCw, Search, Warehouse } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FACILITY_KINDS, type FacilityKind, type ResourceRow } from '@/lib/api/types';
import { FACILITY_KIND_LABELS, INVENTORY_ITEM_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { PageContainer, PageHeader } from '../common/PageHeader';
import { EmptyNotice, ErrorNotice, ListSkeleton } from '../common/QueryStates';
import { UtilisationBar } from '../common/UtilisationBar';
import { utilisationBand } from '../lib/bands';
import { formatCount, formatDateTime } from '../lib/format';
import { resourcesQuery } from '../queries';

type KindFilter = FacilityKind | 'ALL';

export function ResourcesView() {
  const searchId = useId();
  const lowStockId = useId();
  const kindId = useId();
  const { data, error, isPending, isFetching, refetch } = useQuery(resourcesQuery());
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [search, setSearch] = useState('');

  // A district has at most a few hundred facilities, so narrowing the loaded list in the browser is cheap.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data ?? []).filter(
      (row) =>
        (kind === 'ALL' || row.kind === kind) &&
        (!lowStockOnly || row.lowStock.length > 0) &&
        (needle === '' || row.name.toLowerCase().includes(needle)),
    );
  }, [data, kind, lowStockOnly, search]);

  return (
    <PageContainer>
      <PageHeader
        title="Resources"
        description="Occupancy and low stock across every operational shelter and hospital, most crowded first. Figures update live as facility staff record arrivals and deliveries."
        actions={
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {data && <ResourceTotals rows={data} />}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={searchId}>Facility name</Label>
          <div className="relative">
            <Search aria-hidden className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id={searchId} value={search} onChange={(event) => setSearch(event.target.value)} className="w-64 pl-8" placeholder="Search" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={kindId}>Type</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as KindFilter)}>
            <SelectTrigger id={kindId} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Shelters and hospitals</SelectItem>
              {FACILITY_KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {FACILITY_KIND_LABELS[option]}s only
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex h-9 items-center gap-2">
          <Switch id={lowStockId} checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
          <Label htmlFor={lowStockId} className="font-normal">
            Low stock only
          </Label>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {isPending ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorNotice error={error} title="Resources could not be loaded" onRetry={() => void refetch()} className="m-3 w-auto" />
        ) : rows.length === 0 ? (
          <EmptyNotice icon={Warehouse} title={data.length === 0 ? 'No operational facilities in this district' : 'No facilities match these filters'} />
        ) : (
          <ResourceTable rows={rows} />
        )}
      </div>
    </PageContainer>
  );
}

function ResourceTotals({ rows }: { rows: readonly ResourceRow[] }) {
  const shelters = rows.filter((row) => row.kind === 'SHELTER');
  const freePlaces = shelters.reduce((total, row) => total + Math.max(0, row.capacity - row.occupancy), 0);
  const nearlyFull = rows.filter((row) => utilisationBand(row.utilisation) === 'critical').length;
  const withLowStock = rows.filter((row) => row.lowStock.length > 0).length;

  const totals = [
    { label: 'Operational facilities', value: formatCount(rows.length), tone: 'neutral' },
    { label: 'Free shelter places', value: formatCount(freePlaces), tone: 'neutral' },
    { label: 'At 85 % or fuller', value: formatCount(nearlyFull), tone: nearlyFull > 0 ? 'critical' : 'neutral' },
    { label: 'With low stock', value: formatCount(withLowStock), tone: withLowStock > 0 ? 'warning' : 'neutral' },
  ] as const;

  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {totals.map(({ label, value, tone }) => (
        <div
          key={label}
          className={cn(
            'grid gap-0.5 rounded-lg border px-3 py-2',
            tone === 'critical' && 'border-red-300 bg-red-50',
            tone === 'warning' && 'border-amber-300 bg-amber-50',
          )}
        >
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-xl font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResourceTable({ rows }: { rows: readonly ResourceRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Facility</TableHead>
          <TableHead className="w-80">Occupancy</TableHead>
          <TableHead className="text-right">Free places</TableHead>
          <TableHead>Low stock</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.facilityId} className={cn(row.lowStock.length > 0 && 'bg-amber-50/60 hover:bg-amber-50')}>
            <TableCell>
              <div className="grid gap-0.5">
                <span className="font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground">{FACILITY_KIND_LABELS[row.kind]}</span>
              </div>
            </TableCell>
            <TableCell className="w-80">
              <UtilisationBar occupancy={row.occupancy} capacity={row.capacity} utilisation={row.utilisation} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatCount(Math.max(0, row.capacity - row.occupancy))}</TableCell>
            <TableCell className="whitespace-normal">
              {row.lowStock.length === 0 ? (
                <span className="text-sm text-muted-foreground">Stock above thresholds</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {row.lowStock.map((line) => (
                    <li key={line.item}>
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-400 bg-amber-100 text-amber-950"
                        title={`Updated ${formatDateTime(line.updatedAt)}`}
                      >
                        <PackageX aria-hidden />
                        {INVENTORY_ITEM_LABELS[line.item]}: {formatCount(line.quantity)}
                        {line.lowStockThreshold !== null && ` (alert at ${formatCount(line.lowStockThreshold)})`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
