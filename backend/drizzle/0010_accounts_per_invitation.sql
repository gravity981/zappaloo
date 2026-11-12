-- Account states and an account per invitation (stage 3.9d, sw-architecture.md 7.1.2):
-- `users.status`, a username that can be empty, `invitations.user_id`, and the invited program
-- items on the membership only (`invitation_program_items` is dropped).
-- `runMigrations` runs this with foreign keys off and checks them before it commits, because
-- SQLite can only make a column nullable by rebuilding the table (and dropping `users` with
-- foreign keys on would delete everything that references it).
ALTER TABLE `invitations` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text,
	`status` text DEFAULT 'inactive' NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`email_status` text DEFAULT 'unverified' NOT NULL,
	`password_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- An account with a password is active, one without is inactive.
INSERT INTO `__new_users`("id", "username", "status", "display_name", "email", "email_status", "password_hash", "created_at", "updated_at") SELECT "id", "username", CASE WHEN "password_hash" IS NULL THEN 'inactive' ELSE 'active' END, "display_name", "email", "email_status", "password_hash", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_verified_email` ON `users` (lower("email")) WHERE "users"."email_status" = 'verified';--> statement-breakpoint
-- Every unredeemed invitation (expired ones included) gets its inactive account. The invitation's
-- id travels in the address column for the moment, so the new rows can be told apart; real
-- addresses always contain an @.
INSERT INTO `users` (`username`, `status`, `display_name`, `email`, `email_status`, `password_hash`, `created_at`, `updated_at`) SELECT NULL, 'inactive', `guest_name`, 'invitation:' || `id`, 'unverified', NULL, `created_at`, `created_at` FROM `invitations` WHERE `status` = 'active';--> statement-breakpoint
UPDATE `invitations` SET `user_id` = (SELECT `users`.`id` FROM `users` WHERE `users`.`email` = 'invitation:' || `invitations`.`id`) WHERE `status` = 'active';--> statement-breakpoint
UPDATE `users` SET `email` = NULL WHERE `email` LIKE 'invitation:%';--> statement-breakpoint
-- A redeemed invitation belongs to the account that redeemed it.
UPDATE `invitations` SET `user_id` = `redeemed_by` WHERE `status` = 'redeemed' AND `redeemed_by` IS NOT NULL;--> statement-breakpoint
-- The new accounts are guests (`vip`) with the invitation's program items.
INSERT INTO `memberships` (`event_id`, `user_id`, `created_at`, `vip_assignment`, `vip_invitation_id`) SELECT `event_id`, `user_id`, `created_at`, 'invitation_code', `id` FROM `invitations` WHERE `status` = 'active' AND `user_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `membership_roles` (`event_id`, `user_id`, `role`) SELECT `event_id`, `user_id`, 'vip' FROM `invitations` WHERE `status` = 'active' AND `user_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `membership_program_items` (`event_id`, `user_id`, `program_item_id`) SELECT `invitations`.`event_id`, `invitations`.`user_id`, `invitation_program_items`.`program_item_id` FROM `invitations` INNER JOIN `invitation_program_items` ON `invitation_program_items`.`invitation_id` = `invitations`.`id` WHERE `invitations`.`status` = 'active' AND `invitations`.`user_id` IS NOT NULL;--> statement-breakpoint
DROP TABLE `invitation_program_items`;--> statement-breakpoint
-- Redeeming an invitation is audited as `invitation.redeem` from now on; older entries are the
-- creation or promotion of the guest's account with this method.
UPDATE `audit_log` SET `action` = 'invitation.redeem' WHERE `action` IN ('user.create', 'user.roles') AND `details` LIKE '%"vipAssignment":"invitation_code"%';
