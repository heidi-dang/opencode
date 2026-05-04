CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY,
	`task_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `artifact_metadata` (
	`id` text PRIMARY KEY,
	`task_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`path` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fsm_snapshots` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`state` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_cards` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`objective` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
