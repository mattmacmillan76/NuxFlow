ALTER TABLE `passkey` ADD `aaguid` text;--> statement-breakpoint
ALTER TABLE `content_items` ADD `locale` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_items` ADD `source_item_id` text REFERENCES content_items(id);--> statement-breakpoint
CREATE INDEX `idx_content_items_locale` ON `content_items` (`site_id`,`locale`);--> statement-breakpoint
CREATE INDEX `idx_content_items_source` ON `content_items` (`source_item_id`);