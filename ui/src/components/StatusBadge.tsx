import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";
import { formatStatusText, normalizeStatusValue } from "../lib/status";

export function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = normalizeStatusValue(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
        statusBadge[normalizedStatus] ?? statusBadgeDefault
      )}
    >
      {formatStatusText(normalizedStatus)}
    </span>
  );
}
