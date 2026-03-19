ALTER TABLE "issues" ADD COLUMN "review_owner_user_id" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "queued_status_before_checkout" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "last_engineer_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "last_qa_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_last_engineer_agent_id_agents_id_fk" FOREIGN KEY ("last_engineer_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_last_qa_agent_id_agents_id_fk" FOREIGN KEY ("last_qa_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;