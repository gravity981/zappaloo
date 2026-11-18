CREATE TABLE `seating_assignments` (
	`event_id` text NOT NULL,
	`person_key` text NOT NULL,
	`table_id` integer NOT NULL,
	PRIMARY KEY(`event_id`, `person_key`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`table_id`) REFERENCES `seating_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seating_tables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`places` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seating_tables_name` ON `seating_tables` (`event_id`,`name_key`);