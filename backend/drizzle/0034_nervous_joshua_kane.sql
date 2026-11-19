CREATE TABLE `world_hidden_indicators` (
	`event_id` text NOT NULL,
	`map_id` text NOT NULL,
	`object_name` text NOT NULL,
	PRIMARY KEY(`event_id`, `map_id`, `object_name`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
