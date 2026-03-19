CREATE TABLE "issue_relations" (
	"company_id" uuid NOT NULL,
	"from_issue_id" uuid NOT NULL,
	"to_issue_id" uuid NOT NULL,
	"relation_type" text DEFAULT 'blocks' NOT NULL,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_relations_pk" PRIMARY KEY("from_issue_id","to_issue_id","relation_type")
);
--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_from_issue_id_issues_id_fk" FOREIGN KEY ("from_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_to_issue_id_issues_id_fk" FOREIGN KEY ("to_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_relations_company_idx" ON "issue_relations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "issue_relations_from_idx" ON "issue_relations" USING btree ("from_issue_id","relation_type");--> statement-breakpoint
CREATE INDEX "issue_relations_to_idx" ON "issue_relations" USING btree ("to_issue_id","relation_type");