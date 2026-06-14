CREATE TABLE `video_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`uploaded_by` text,
	`cloudflare_stream_id` text NOT NULL,
	`title` text NOT NULL,
	`duration` integer,
	`thumbnail_url` text,
	`status` text DEFAULT 'uploading' NOT NULL,
	`size` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_video_assets_site` ON `video_assets` (`site_id`);