import { ApiError } from "../api/client";

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readNonEmptyString(item)).filter((item): item is string => item !== null)
    : [];
}

export function formatApiErrorMessage(error: unknown, fallback = "Unknown error") {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : fallback;
  }

  const parts = [error.message];
  const details =
    error.body && typeof error.body === "object"
      ? (error.body as { details?: unknown }).details
      : null;

  if (details && typeof details === "object") {
    const nextAction = readNonEmptyString((details as { nextAction?: unknown }).nextAction);
    if (nextAction) parts.push(nextAction);

    const missingFields = readStringList((details as { missingFields?: unknown }).missingFields);
    if (missingFields.length > 0) {
      parts.push(`Missing fields: ${missingFields.join(", ")}`);
    }

    const invalidAfterResolutionRoute = readNonEmptyString(
      (details as { invalidAfterResolutionRoute?: unknown }).invalidAfterResolutionRoute,
    );
    if (invalidAfterResolutionRoute) {
      parts.push(`Invalid after-resolution route: ${invalidAfterResolutionRoute}`);
    }
  }

  return parts.join("\n");
}
