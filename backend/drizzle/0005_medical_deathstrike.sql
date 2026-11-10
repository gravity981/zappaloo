CREATE TABLE `access_releases` (
	`event_id` text NOT NULL,
	`key` text NOT NULL,
	`released_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `key`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
