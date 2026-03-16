CREATE TABLE `infinity` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`current_stage` text NOT NULL,
	`current_run_id` text,
	`current_task_id` text,
	`health_score` integer,
	`metrics` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_infinity_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `session` ADD `status` text;--> statement-breakpoint
CREATE INDEX `infinity_project_idx` ON `infinity` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `infinity_project_unique_idx` ON `infinity` (`project_id`);