import { ApiError, isApiError, NETWORK_ERROR } from '@/lib/api/api-error';

export const STATUS_CHANGE_TIMEOUT = 'STATUS_CHANGE_TIMEOUT';

export interface StepFailure {
  title: string;
  message: string;
  /** Sending the same step again is safe: the API answers a repeated step with the mission unchanged. */
  retryable: boolean;
}

export function statusChangeTimeout(): ApiError {
  return new ApiError(0, STATUS_CHANGE_TIMEOUT, 'NDMS has not answered yet.');
}

export function describeStepFailure(error: unknown): StepFailure {
  if (!isApiError(error)) {
    return { title: 'Update not sent', message: 'Something went wrong on this phone.', retryable: true };
  }
  switch (error.code) {
    case NETWORK_ERROR:
      return { title: 'No connection', message: 'Your phone could not reach NDMS.', retryable: true };
    case STATUS_CHANGE_TIMEOUT:
      return {
        title: 'No answer yet',
        message: 'NDMS has not confirmed the update. It may still go through; sending it again is safe.',
        retryable: true,
      };
    case 'TEAM_UNAVAILABLE':
      return {
        title: 'Team already busy',
        message: 'Your team has another accepted mission. Complete it before accepting this one.',
        retryable: false,
      };
    case 'INVALID_MISSION_TRANSITION':
      return {
        title: 'Mission changed elsewhere',
        message: 'Someone else updated this mission. The latest status is shown.',
        retryable: false,
      };
    case 'MISSION_NOT_FOUND':
      return { title: 'Mission not available', message: 'This mission is no longer assigned to your team.', retryable: false };
    case 'VALIDATION_FAILED':
      return { title: 'Check the details', message: 'NDMS did not accept the details you entered.', retryable: false };
    default:
      return { title: 'Update failed', message: error.message, retryable: error.isRetryable };
  }
}

// These answers mean the mission is not in the state this phone believes, so the cached copy must be refetched.
export function failureRevealsNewerState(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 409);
}
