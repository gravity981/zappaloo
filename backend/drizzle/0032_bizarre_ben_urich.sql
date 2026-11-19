CREATE TABLE `dialogues` (
	`event_id` text NOT NULL,
	`id` text NOT NULL,
	`npc_name` text NOT NULL,
	`lines` text NOT NULL,
	`portrait` blob,
	`portrait_mime` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
