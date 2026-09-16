'use client';

import { useMutation } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle, Send } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { createVolunteerTask } from '@/lib/api/endpoints/volunteer-tasks';
import type { CreateVolunteerTaskInput, Facility, LatLon } from '@/lib/api/types';
import { describeApiError, type ErrorMessages } from './describe-error';
import { rememberVolunteerTask } from './facility-tasks';
import { humanizeCode } from './format';
import { TagListInput } from './TagListInput';
import { TaskLocationField } from './TaskLocationField';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SKILLS = 20;
const MAX_SKILL_LENGTH = 40;
const SKILL_PATTERN = /^[A-Z0-9_]{2,40}$/;
const SKILL_SUGGESTIONS = ['FIRST_AID', 'DRIVER', 'SWIMMER', 'BOATMAN', 'DOCTOR', 'COOK'] as const;

const CREATE_TASK_ERRORS: ErrorMessages = {
  LOCATION_OUTSIDE_DISTRICT: 'That spot is outside your district. Choose a location inside the dashed district boundary.',
  NO_DISTRICT_SCOPE: 'Your account is not assigned to a district, so it cannot post tasks. Ask the control room to fix it.',
  FACILITY_NOT_FOUND: 'Your facility could not be found. Reload the page and try again.',
};

// Volunteers are matched by exact skill strings, so skills are stored in the API's canonical form.
function normalizeSkill(raw: string): string | null {
  const skill = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return SKILL_PATTERN.test(skill) ? skill : null;
}

export interface CreateTaskFormProps {
  facility: Facility;
  onClose: () => void;
}

export function CreateTaskForm({ facility, onClose }: CreateTaskFormProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [location, setLocation] = useState<LatLon | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreateVolunteerTaskInput) => createVolunteerTask(input),
    onSuccess: (task) => {
      rememberVolunteerTask(task);
      toast({
        title: 'Task posted',
        description: 'Verified volunteers nearby with a matching skill can now take it.',
        variant: 'success',
      });
      onClose();
    },
  });

  const titleError = title.trim() === '' ? 'Give the task a short title.' : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (titleError) {
      setShowErrors(true);
      return;
    }
    const point = location ?? { lat: facility.lat, lon: facility.lon };
    create.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      requiredSkills: skills,
      lat: point.lat,
      lon: point.lon,
      facilityId: facility.id,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New volunteer task</CardTitle>
        <CardDescription>Describe one job that a volunteer can pick up and finish.</CardDescription>
      </CardHeader>
      <form onSubmit={submit} noValidate className="contents">
        <CardContent>
          <fieldset disabled={create.isPending} className="grid min-w-0 gap-5">
            <div className="grid gap-2">
              <Label htmlFor={titleId}>Title</Label>
              <Input
                id={titleId}
                className="h-10"
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                placeholder="e.g. Unload a truck of food packets"
                aria-invalid={showErrors && titleError !== null}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
              {showErrors && titleError && <p className="text-xs text-destructive">{titleError}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={descriptionId}>
                Details <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id={descriptionId}
                rows={3}
                value={description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="What needs doing, how many people, and who to ask for on arrival."
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <TagListInput
              label="Required skills"
              hint="Leave empty if any verified volunteer can help. A volunteer needs at least one of these skills."
              values={skills}
              onChange={setSkills}
              normalize={normalizeSkill}
              invalidMessage="A skill is 2 to 40 letters or digits, e.g. First aid."
              maxItems={MAX_SKILLS}
              maxLength={MAX_SKILL_LENGTH}
              suggestions={SKILL_SUGGESTIONS}
              formatTag={humanizeCode}
              placeholder="e.g. First aid"
              disabled={create.isPending}
            />

            <TaskLocationField facility={facility} value={location} onChange={setLocation} disabled={create.isPending} />

            {create.isError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{describeApiError(create.error, CREATE_TASK_ERRORS)}</AlertDescription>
              </Alert>
            )}
          </fieldset>
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-2 border-t">
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            Post task
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
