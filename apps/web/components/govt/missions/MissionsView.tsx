'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OPEN_MISSION_STATUSES, type LatLon, type MissionListQuery, type MissionStatus, type Team } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { PageContainer, PageHeader } from '../common/PageHeader';
import { EmptyNotice, ErrorNotice, ListSkeleton } from '../common/QueryStates';
import { useNow } from '../lib/useNow';
import { isOpenMission } from '../lib/workflow';
import { missionsQuery, teamsQuery } from '../queries';
import { MissionsTable } from './MissionsTable';
import type { MissionLink } from './TeamsMapLayers';
import { TeamsMap } from './TeamsMap';
import { TeamsPanel } from './TeamsPanel';
import { useIncidentLookup } from './useIncidentLookup';

type MissionTab = 'open' | 'completed' | 'closed' | 'all';

const TAB_QUERIES: Record<MissionTab, MissionListQuery> = {
  open: { status: OPEN_MISSION_STATUSES },
  completed: { status: ['COMPLETED'] as readonly MissionStatus[], limit: 50 },
  closed: { status: ['REJECTED', 'CANCELLED'] as readonly MissionStatus[], limit: 50 },
  all: { limit: 50 },
};

const TAB_LABELS: Record<MissionTab, string> = {
  open: 'Open',
  completed: 'Completed',
  closed: 'Declined & cancelled',
  all: 'All recent',
};

const MISSION_TABS = Object.keys(TAB_LABELS) as MissionTab[];

export function MissionsView() {
  const now = useNow();
  const [tab, setTab] = useState<MissionTab>('open');
  const [focus, setFocus] = useState<(LatLon & { requestedAt: number }) | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const teams = useQuery(teamsQuery());
  const openMissions = useQuery(missionsQuery(TAB_QUERIES.open));
  const tabMissions = useQuery({ ...missionsQuery(TAB_QUERIES[tab]), placeholderData: keepPreviousData });

  const teamsById = useMemo(() => new Map((teams.data ?? []).map((team) => [team.id, team])), [teams.data]);
  const openMissionsById = useMemo(
    () => new Map((openMissions.data ?? []).map((mission) => [mission.id, mission])),
    [openMissions.data],
  );
  const incidentIds = useMemo(
    () => [...(openMissions.data ?? []), ...(tabMissions.data ?? [])].map((mission) => mission.incidentId),
    [openMissions.data, tabMissions.data],
  );
  const incidentsById = useIncidentLookup(incidentIds);

  const links = useMemo<MissionLink[]>(
    () =>
      (openMissions.data ?? []).flatMap((mission) => {
        const team = teamsById.get(mission.teamId);
        const incident = incidentsById.get(mission.incidentId);
        if (!team || !incident || incident.lat === null || incident.lon === null || !isOpenMission(mission.status)) return [];
        return [{ mission, team, incident: { ...incident, lat: incident.lat, lon: incident.lon } }];
      }),
    [openMissions.data, teamsById, incidentsById],
  );

  const selectTeam = useCallback((team: Team) => {
    setSelectedTeamId(team.id);
    setFocus({ lat: team.lat, lon: team.lon, requestedAt: Date.now() });
  }, []);
  const selectTeamById = useCallback(
    (teamId: string) => {
      const team = teamsById.get(teamId);
      if (team) selectTeam(team);
    },
    [teamsById, selectTeam],
  );

  const refresh = () => {
    void teams.refetch();
    void openMissions.refetch();
    if (tab !== 'open') void tabMissions.refetch();
  };
  const isRefreshing = teams.isFetching || openMissions.isFetching || tabMissions.isFetching;

  return (
    <PageContainer>
      <PageHeader
        title="Missions & teams"
        description="Where every rescue team is, what it is working on, and every dispatch in the district. Positions and statuses update live."
        actions={
          <Button variant="outline" onClick={refresh} disabled={isRefreshing}>
            <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <section aria-label="Rescue teams" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <TeamsMap
          className="h-[420px]"
          teams={teams.data ?? []}
          links={links}
          focus={focus}
          onSelectTeam={selectTeamById}
        />
        <div className="h-[420px] overflow-hidden rounded-xl border bg-card">
          {teams.isPending ? (
            <ListSkeleton rows={5} />
          ) : teams.error ? (
            <ErrorNotice error={teams.error} title="Teams could not be loaded" onRetry={() => void teams.refetch()} className="m-3 w-auto" />
          ) : (
            <TeamsPanel
              className="h-full"
              teams={teams.data}
              openMissionsById={openMissionsById}
              selectedTeamId={selectedTeamId}
              onSelectTeam={selectTeam}
              now={now}
            />
          )}
        </div>
      </section>

      <section aria-label="Missions" className="grid gap-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as MissionTab)}>
          <TabsList>
            {MISSION_TABS.map((entry) => (
              <TabsTrigger key={entry} value={entry}>
                {TAB_LABELS[entry]}
                {entry === 'open' && openMissions.data && ` (${openMissions.data.length})`}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={tab} className={cn('rounded-xl border bg-card', tabMissions.isPlaceholderData && 'opacity-60')}>
            {tabMissions.isPending ? (
              <ListSkeleton rows={4} />
            ) : tabMissions.error ? (
              <ErrorNotice
                error={tabMissions.error}
                title="Missions could not be loaded"
                onRetry={() => void tabMissions.refetch()}
                className="m-3 w-auto"
              />
            ) : tabMissions.data.length === 0 ? (
              <EmptyNotice icon={ClipboardList} title={tab === 'open' ? 'No open missions' : 'No missions here yet'}>
                {tab === 'open' ? 'Dispatch a team from the priority queue on the overview.' : null}
              </EmptyNotice>
            ) : (
              <MissionsTable
                missions={tabMissions.data}
                teamsById={teamsById}
                incidentsById={incidentsById}
                now={now}
              />
            )}
          </TabsContent>
        </Tabs>
      </section>
    </PageContainer>
  );
}
