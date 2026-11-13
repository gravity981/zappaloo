CREATE TABLE `content_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`slug` text NOT NULL,
	`in_more` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_pages_slug` ON `content_pages` (`event_id`,`slug`);--> statement-breakpoint
CREATE INDEX `content_pages_order` ON `content_pages` (`event_id`,`position`);--> statement-breakpoint
CREATE TABLE `content_texts` (
	`event_id` text NOT NULL,
	`item` text NOT NULL,
	`language` text NOT NULL,
	`title` text NOT NULL,
	`markdown` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `item`, `language`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
