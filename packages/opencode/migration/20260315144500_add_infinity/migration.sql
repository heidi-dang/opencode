CREATE TABLE `infinity` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL UNIQUE,
	`status` text NOT NULL,
	`current_stage` text NOT NULL,
	`current_run_id` text,
	`current_task_id` text,
	`health_score` integer,
	`metrics` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `infinity_project_idx` ON `infinity` (`project_id`);
CREATE UNIQUE INDEX `infinity_project_unique_idx` ON `infinity` (`project_id`);
