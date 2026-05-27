CREATE TABLE "game_progress" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"levels_completed" integer DEFAULT 0 NOT NULL,
	"highest_level" integer DEFAULT 0 NOT NULL,
	"gems" integer DEFAULT 0 NOT NULL,
	"setbacks" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_progress" ADD CONSTRAINT "game_progress_child_id_child_profiles_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;