CREATE TABLE `seating_assignments` (
	`event_id` text NOT NULL,
	`person_key` text NOT NULL,
	`table_name` text NOT NULL,
	PRIMARY KEY(`event_id`, `person_key`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `seating_config` (
	`event_id` text PRIMARY KEY NOT NULL,
	`visible_from` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
