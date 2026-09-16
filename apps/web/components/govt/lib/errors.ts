import { isApiError } from '@/lib/api/client';

export function describeError(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case 'VALIDATION_FAILED':
      return firstValidationMessage(error.details) ?? 'Some fields are not valid. Check them and try again.';
    case 'NO_DISTRICT_SCOPE':
      return 'Your account is not assigned to a district yet, so there is nothing to show. Ask an administrator to assign one.';
    default:
      return error.message;
  }
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return isApiError(error) && error.code === code;
}

// Validation failures carry zod's flattened error: { formErrors: string[], fieldErrors: { field: string[] } }.
function firstValidationMessage(details: unknown): string | null {
  if (typeof details !== 'object' || details === null) return null;
  const { formErrors, fieldErrors } = details as { formErrors?: unknown; fieldErrors?: unknown };
  if (Array.isArray(formErrors) && typeof formErrors[0] === 'string') return formErrors[0];
  if (typeof fieldErrors !== 'object' || fieldErrors === null) return null;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') return `${field}: ${messages[0]}`;
  }
  return null;
}
