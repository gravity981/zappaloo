ALTER TABLE `rsvp_config` ADD `per_item` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rsvp_config` ADD `companion_approval` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Approval is off by default (RSVP-12, stage 3.9c): requests that wait for a decision are approved.
UPDATE `companions` SET `status` = 'approved', `decided_at` = CAST(strftime('%s', 'now') AS integer) * 1000 WHERE `status` = 'pending';
