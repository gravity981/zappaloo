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
	FOREIGN KEY (`redeemed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_code_hash_unique` ON `invitations` (`code_hash`);--> statement-breakpoint
CREATE INDEX `invitations_event` ON `invitations` (`event_id`);--> statement-breakpoint
ALTER TABLE `memberships` ADD `vip_assignment` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `vip_invitation_id` integer;