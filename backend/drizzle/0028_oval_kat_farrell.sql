CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`companion_id` integer,
	`greeting` text,
	`relation_id` integer,
	`relation_line` text,
	`photo` blob,
	`photo_mime` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`relation_id`) REFERENCES `relation_options`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_guest` ON `profiles` (`event_id`,`user_id`) WHERE "profiles"."companion_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_companion` ON `profiles` (`companion_id`);--> statement-breakpoint
CREATE TABLE `relation_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `relation_options_event` ON `relation_options` (`event_id`);