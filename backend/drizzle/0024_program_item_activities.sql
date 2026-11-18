CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`program_item_id` integer NOT NULL,
	`name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`place_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_item_id`) REFERENCES `program_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `content_places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_event` ON `activities` (`event_id`);--> statement-breakpoint
CREATE INDEX `activities_program_item` ON `activities` (`program_item_id`);--> statement-breakpoint
-- RSVP-18: every program item keeps its id (so invitations and answers stay) and gets one activity
-- with its former name, time and place.
INSERT INTO `activities` (`event_id`, `program_item_id`, `name`, `starts_at`, `ends_at`, `place_id`, `created_at`) SELECT `event_id`, `id`, `name`, `starts_at`, `ends_at`, `place_id`, `created_at` FROM `program_items` ORDER BY `id`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_program_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`has_meal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_program_items`("id", "event_id", "name", "has_meal", "created_at") SELECT "id", "event_id", "name", "has_meal", "created_at" FROM `program_items`;--> statement-breakpoint
DROP TABLE `program_items`;--> statement-breakpoint
ALTER TABLE `__new_program_items` RENAME TO `program_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `program_items_event` ON `program_items` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_items_meal` ON `program_items` (`event_id`) WHERE "program_items"."has_meal" = 1;