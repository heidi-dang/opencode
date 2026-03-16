CREATE TABLE `infinity` (
	`id` text PRIMARY KEY,
	`run_id` text,
	`task_id` text,
	`stage` text,
	`state` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
