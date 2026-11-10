CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_event_time` ON `audit_log` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `event_features` (
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`event_id`, `name`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event_settings` (
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`event_id`, `name`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text NOT NULL,
	`default_language` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);