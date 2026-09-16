'use client';

import { ClipboardPlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Facility } from '@/lib/api/types';
import { CreateTaskForm } from './CreateTaskForm';
import { FacilityScreen } from './FacilityScreen';
import { FacilityTaskList } from './FacilityTaskList';

export function VolunteerTasksScreen() {
  return (
    <FacilityScreen title="Volunteer tasks" description="Ask verified volunteers for help at or near your facility.">
      {(facility) => <VolunteerTasks facility={facility} />}
    </FacilityScreen>
  );
}

function VolunteerTasks({ facility }: { facility: Facility }) {
  const [isCreating, setIsCreating] = useState(false);

  return (
    <>
      {isCreating ? (
        <CreateTaskForm facility={facility} onClose={() => setIsCreating(false)} />
      ) : (
        <Button size="lg" className="h-12 w-full sm:w-auto sm:justify-self-start" onClick={() => setIsCreating(true)}>
          <ClipboardPlus aria-hidden />
          Post a volunteer task
        </Button>
      )}
      <FacilityTaskList facility={facility} />
    </>
  );
}
