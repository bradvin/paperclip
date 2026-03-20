import type { ReactNode } from "react";
import { CircleMinus, Link2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../lib/utils";

interface IssueDependencyBadgesProps {
  blockedByCount?: number;
  blocksCount?: number;
  className?: string;
  withTooltips?: boolean;
}

function DependencyBadge({
  icon,
  count,
  tone,
  label,
}: {
  icon: ReactNode;
  count: number;
  tone: "blocked" | "blocking";
  label: string;
}) {
  const toneClassName =
    tone === "blocked"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"
      : "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-300";

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClassName,
      )}
    >
      {icon}
      <span>{count}</span>
    </span>
  );
}

export function IssueDependencyBadges({
  blockedByCount = 0,
  blocksCount = 0,
  className,
  withTooltips = true,
}: IssueDependencyBadgesProps) {
  if (blockedByCount <= 0 && blocksCount <= 0) return null;

  const blockedByLabel =
    blockedByCount === 1 ? "Blocked by 1 issue" : `Blocked by ${blockedByCount} issues`;
  const blocksLabel =
    blocksCount === 1 ? "Blocking 1 issue" : `Blocking ${blocksCount} issues`;

  const blockedByBadge = blockedByCount > 0 ? (
    <DependencyBadge
      icon={<CircleMinus className="h-3 w-3" />}
      count={blockedByCount}
      tone="blocked"
      label={blockedByLabel}
    />
  ) : null;
  const blocksBadge = blocksCount > 0 ? (
    <DependencyBadge
      icon={<Link2 className="h-3 w-3" />}
      count={blocksCount}
      tone="blocking"
      label={blocksLabel}
    />
  ) : null;

  return (
    <span className={cn("flex items-center gap-1", className)}>
      {blockedByBadge ? (
        withTooltips ? (
          <Tooltip>
            <TooltipTrigger asChild>{blockedByBadge}</TooltipTrigger>
            <TooltipContent side="top">{blockedByLabel}</TooltipContent>
          </Tooltip>
        ) : (
          blockedByBadge
        )
      ) : null}
      {blocksBadge ? (
        withTooltips ? (
          <Tooltip>
            <TooltipTrigger asChild>{blocksBadge}</TooltipTrigger>
            <TooltipContent side="top">{blocksLabel}</TooltipContent>
          </Tooltip>
        ) : (
          blocksBadge
        )
      ) : null}
    </span>
  );
}
