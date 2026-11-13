CREATE TABLE `content_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_page_places` (
	`event_id` text NOT NULL,
	`page_id` integer NOT NULL,
	`place_id` integer NOT NULL,
	PRIMARY KEY(`page_id`, `place_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_id`) REFERENCES `content_pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `content_places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`maps_url` text,
	`map_image_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`map_image_id`) REFERENCES `content_images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `content_places_event` ON `content_places` (`event_id`);--> statement-breakpoint
-- The free-text places of the program items become places (CNT-07): one per distinct text in an
-- event. The items are linked to them after the column is added; the free-text column is removed
-- by the next migration.
INSERT INTO `content_places` (`event_id`, `name`, `created_at`, `updated_at`)
SELECT `event_id`, trim(`place`), min(`created_at`), min(`created_at`) FROM `program_items`
WHERE `place` IS NOT NULL AND trim(`place`) <> ''
GROUP BY `event_id`, trim(`place`);
--> statement-breakpoint
ALTER TABLE `program_items` ADD `place_id` integer REFERENCES content_places(id);
--> statement-breakpoint
UPDATE `program_items` SET `place_id` = (SELECT `p`.`id` FROM `content_places` AS `p` WHERE `p`.`event_id` = `program_items`.`event_id` AND `p`.`name` = trim(`program_items`.`place`) LIMIT 1) WHERE `place` IS NOT NULL AND trim(`place`) <> '';
