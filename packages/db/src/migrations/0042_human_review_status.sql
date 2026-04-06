UPDATE "issues"
SET "status" = 'human_review'
WHERE "status" = 'in_review';
--> statement-breakpoint

UPDATE "issues"
SET "queued_status_before_checkout" = 'human_review'
WHERE "queued_status_before_checkout" = 'in_review';
--> statement-breakpoint

UPDATE "execution_workspaces"
SET "status" = 'human_review'
WHERE "status" = 'in_review';
--> statement-breakpoint

WITH normalized AS (
  SELECT
    step_two_updates.id,
    CASE
      WHEN step_two_updates.step_two->>'reopenedFrom' = 'in_review'
        THEN jsonb_set(step_two_updates.step_two, '{reopenedFrom}', to_jsonb('human_review'::text), false)
      ELSE step_two_updates.step_two
    END AS details
  FROM (
    SELECT
      step_one_updates.id,
      CASE
        WHEN step_one_updates.step_one #>> '{_previous,status}' = 'in_review'
          THEN jsonb_set(step_one_updates.step_one, '{_previous,status}', to_jsonb('human_review'::text), false)
        ELSE step_one_updates.step_one
      END AS step_two
    FROM (
      SELECT
        "id",
        CASE
          WHEN "details"->>'status' = 'in_review'
            THEN jsonb_set("details", '{status}', to_jsonb('human_review'::text), false)
          ELSE "details"
        END AS step_one
      FROM "activity_log"
      WHERE "details" IS NOT NULL
    ) step_one_updates
  ) step_two_updates
)
UPDATE "activity_log"
SET "details" = normalized.details
FROM normalized
WHERE "activity_log"."id" = normalized.id
  AND (
    "activity_log"."details"->>'status' = 'in_review'
    OR "activity_log"."details"#>>'{_previous,status}' = 'in_review'
    OR "activity_log"."details"->>'reopenedFrom' = 'in_review'
  );
