CREATE TABLE `footer_notice` (
	`event_id` text PRIMARY KEY NOT NULL,
	`copyright` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
