ALTER TABLE `companions` ADD `person_type` text DEFAULT 'adult' NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `person_type` text DEFAULT 'adult' NOT NULL;