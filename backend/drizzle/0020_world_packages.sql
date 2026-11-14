CREATE TABLE `world_packages` (
	`import_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`format_version` integer NOT NULL,
	`start_map` text NOT NULL,
	`tile_size` integer NOT NULL,
	`imported_at` integer NOT NULL,
	`maps` text NOT NULL,
	`avatar` text NOT NULL,
	`has_door` integer NOT NULL,
	`warnings` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_packages_role` ON `world_packages` (`event_id`,`role`);