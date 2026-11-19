CREATE TABLE `world_npcs` (
	`event_id` text NOT NULL,
	`map_id` text NOT NULL,
	`npc_name` text NOT NULL,
	`title` text,
	`dialog` text,
	PRIMARY KEY(`event_id`, `map_id`, `npc_name`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
