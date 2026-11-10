CREATE TABLE `guest_group_members` (
	`event_id` text NOT NULL,
	`group_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `guest_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guest_group_members_user` ON `guest_group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `guest_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_groups_name` ON `guest_groups` (`event_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `membership_capabilities` (
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`capability` text NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`, `capability`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
