CREATE TABLE `access_releases` (
	`event_id` text NOT NULL,
	`key` text NOT NULL,
	`released_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `key`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_event_time` ON `audit_log` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `event_features` (
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`event_id`, `name`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event_settings` (
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`event_id`, `name`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text NOT NULL,
	`default_language` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE TABLE `guest_group_members` (
	`event_id` text NOT NULL,
	`group_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `guest_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`,`event_id`) REFERENCES `guest_groups`(`id`,`event_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`,`user_id`) REFERENCES `memberships`(`event_id`,`user_id`) ON UPDATE no action ON DELETE cascade
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
CREATE UNIQUE INDEX `guest_groups_event` ON `guest_groups` (`id`,`event_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`note` text,
	`code_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`redeemed_at` integer,
	`redeemed_by` integer,
	`replaced_by` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redeemed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`replaced_by`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_code_hash_unique` ON `invitations` (`code_hash`);--> statement-breakpoint
CREATE INDEX `invitations_event` ON `invitations` (`event_id`);--> statement-breakpoint
CREATE TABLE `membership_capabilities` (
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`capability` text NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`, `capability`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`,`user_id`) REFERENCES `memberships`(`event_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `membership_roles` (
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`, `role`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`,`user_id`) REFERENCES `memberships`(`event_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`event_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`vip_assignment` text,
	`vip_invitation_id` integer,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vip_invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `one_time_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`purpose` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_links_token_hash_unique` ON `one_time_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `one_time_links_user` ON `one_time_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`csrf_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`email_status` text DEFAULT 'unverified' NOT NULL,
	`password_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);