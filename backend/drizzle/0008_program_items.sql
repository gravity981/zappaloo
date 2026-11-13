-- "Program item" (Programmpunkt) replaces "event part" (Teil): tables, columns, indexes and the
-- audit log entries that name them (stage 3.9b). Only renames: no data changes, no rows lost.
DROP INDEX `event_parts_event`;--> statement-breakpoint
DROP INDEX `event_parts_meal`;--> statement-breakpoint
ALTER TABLE `event_parts` RENAME TO `program_items`;--> statement-breakpoint
ALTER TABLE `invitation_parts` RENAME TO `invitation_program_items`;--> statement-breakpoint
ALTER TABLE `membership_parts` RENAME TO `membership_program_items`;--> statement-breakpoint
ALTER TABLE `invitation_program_items` RENAME COLUMN `part_id` TO `program_item_id`;--> statement-breakpoint
ALTER TABLE `membership_program_items` RENAME COLUMN `part_id` TO `program_item_id`;--> statement-breakpoint
ALTER TABLE `rsvp_attendance` RENAME COLUMN `part_id` TO `program_item_id`;--> statement-breakpoint
ALTER TABLE `companion_attendance` RENAME COLUMN `part_id` TO `program_item_id`;--> statement-breakpoint
CREATE INDEX `program_items_event` ON `program_items` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_items_meal` ON `program_items` (`event_id`) WHERE "program_items"."has_meal" = 1;--> statement-breakpoint
UPDATE `audit_log` SET `action` = 'rsvp.program_item.create' WHERE `action` = 'rsvp.part.create';--> statement-breakpoint
UPDATE `audit_log` SET `action` = 'rsvp.program_item.update' WHERE `action` = 'rsvp.part.update';--> statement-breakpoint
UPDATE `audit_log` SET `action` = 'rsvp.program_item.delete' WHERE `action` = 'rsvp.part.delete';--> statement-breakpoint
UPDATE `audit_log` SET `action` = 'user.program_items' WHERE `action` = 'user.parts';--> statement-breakpoint
UPDATE `audit_log` SET `action` = 'invitation.program_items' WHERE `action` = 'invitation.parts';--> statement-breakpoint
UPDATE `audit_log` SET `details` = replace(replace(`details`, '"partIds":', '"programItemIds":'), '"partId":', '"programItemId":') WHERE `details` LIKE '%"partId%';
