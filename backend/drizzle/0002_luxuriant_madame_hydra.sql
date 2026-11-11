CREATE TABLE `companion_attendance` (
	`event_id` text NOT NULL,
	`companion_id` integer NOT NULL,
	`part_id` integer NOT NULL,
	`attending` integer NOT NULL,
	PRIMARY KEY(`companion_id`, `part_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`part_id`) REFERENCES `event_parts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `companions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`host_user_id` integer NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`menu_id` integer,
	`allergies` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`host_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_id`) REFERENCES `menu_options`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`,`host_user_id`) REFERENCES `memberships`(`event_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `companions_host` ON `companions` (`host_user_id`);