CREATE TABLE `waiting_config` (
	`event_id` text PRIMARY KEY NOT NULL,
	`opening_at` integer,
	`countdown_enabled` integer DEFAULT false NOT NULL,
	`text_none` text,
	`text_attending` text,
	`text_declined` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
