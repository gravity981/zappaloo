DELETE FROM `world_packages` WHERE `format_version` = 1;--> statement-breakpoint
ALTER TABLE `world_packages` ADD `tile_width` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `world_packages` ADD `tile_height` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `world_packages` DROP COLUMN `tile_size`;