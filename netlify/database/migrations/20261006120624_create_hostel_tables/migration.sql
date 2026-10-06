CREATE TABLE "access_logs" (
	"id" serial PRIMARY KEY,
	"user_id" text,
	"card_uid" text,
	"room_number" text,
	"status" text NOT NULL,
	"reason" text,
	"source" text DEFAULT 'READER' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"card_uid" text NOT NULL UNIQUE,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL UNIQUE,
	"student_name" text NOT NULL,
	"student_id" text NOT NULL UNIQUE,
	"department" text NOT NULL,
	"room_number" text NOT NULL,
	"email" text NOT NULL,
	"linkedin" text DEFAULT '' NOT NULL,
	"instagram" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_logs_time" ON "access_logs" ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_cards_user" ON "cards" ("user_id");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE;