CREATE TABLE `content_start` (
	`event_id` text PRIMARY KEY NOT NULL,
	`hero_image_id` integer,
	`hero_alt` text,
	`countdown` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hero_image_id`) REFERENCES `content_images`(`id`) ON UPDATE no action ON DELETE no action
);
