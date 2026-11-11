CREATE TABLE `event_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`place` text,
	`has_meal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_parts_event` ON `event_parts` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_parts_meal` ON `event_parts` (`event_id`) WHERE "event_parts"."has_meal" = 1;--> statement-breakpoint
CREATE TABLE `invitation_parts` (
	`event_id` text NOT NULL,
	`invitation_id` integer NOT NULL,
	`part_id` integer NOT NULL,
	PRIMARY KEY(`invitation_id`, `part_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`part_id`) REFERENCES `event_parts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `membership_parts` (
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`part_id` integer NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`, `part_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`part_id`) REFERENCES `event_parts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`,`user_id`) REFERENCES `memberships`(`event_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `menu_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `menu_options_event` ON `menu_options` (`event_id`);--> statement-breakpoint
CREATE TABLE `rsvp_answers` (
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`menu_id` integer,
	`allergies` text,
	`song_wish` text,
	`answered_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_id`) REFERENCES `menu_options`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`,`user_id`) REFERENCES `memberships`(`event_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rsvp_attendance` (
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`part_id` integer NOT NULL,
	`attending` integer NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`, `part_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`part_id`) REFERENCES `event_parts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`,`user_id`) REFERENCES `memberships`(`event_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rsvp_config` (
	`event_id` text PRIMARY KEY NOT NULL,
	`deadline` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
