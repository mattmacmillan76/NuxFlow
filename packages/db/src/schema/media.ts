import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { sites } from './sites'
import { users } from './users'

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  url: text('url').notNull(),
  storageProvider: text('storage_provider', { enum: ['cloudflare', 'local', 'r2'] }).notNull().default('cloudflare'),
  storageKey: text('storage_key').notNull(),
  altText: text('alt_text'),
  caption: text('caption'),
  focalX: integer('focal_x'),
  focalY: integer('focal_y'),
  folderId: text('folder_id'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('idx_media_site_folder').on(t.siteId, t.folderId),
  index('idx_media_folder').on(t.folderId),
])

export const mediaFolders = sqliteTable('media_folders', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('idx_media_folders_site').on(t.siteId),
])

export const videoAssets = sqliteTable('video_assets', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  cloudflareStreamId: text('cloudflare_stream_id').notNull(),
  title: text('title').notNull(),
  duration: integer('duration'),
  thumbnailUrl: text('thumbnail_url'),
  status: text('status', { enum: ['ready', 'processing', 'failed', 'uploading'] }).notNull().default('uploading'),
  size: integer('size'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('idx_video_assets_site').on(t.siteId),
])
