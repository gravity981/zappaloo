CREATE TABLE `theme_active` (
	`event_id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`name` text NOT NULL,
	`format_version` integer NOT NULL,
	`imported_at` integer NOT NULL,
	`colors` text NOT NULL,
	`fonts` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
