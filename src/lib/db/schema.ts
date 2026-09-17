import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("member"),
  subscribed: integer("subscribed").notNull().default(0),
  avatarFilename: text("avatar_filename"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  shareToken: text("share_token").notNull().unique(),
  inviteToken: text("invite_token").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const projectMembers = sqliteTable(
  "project_members",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_members_project_user").on(table.projectId, table.userId)],
);

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  composerId: text("composer_id").references(() => users.id),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const versions = sqliteTable("versions", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  status: text("status").notNull().default("in_progress"),
  originalFilename: text("original_filename").notNull(),
  storedFilename: text("stored_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  durationSeconds: real("duration_seconds"),
  unreadForAdmin: integer("unread_for_admin").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  versionId: text("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  authorUserId: text("author_user_id").references(() => users.id),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  timestampSeconds: real("timestamp_seconds").notNull(),
  resolved: integer("resolved").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const references = sqliteTable("references", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  url: text("url").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const trackDeliveries = sqliteTable("track_deliveries", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("stem"),
  originalFilename: text("original_filename").notNull(),
  storedFilename: text("stored_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().default(""),
  region: text("region").notNull().default(""),
  bucket: text("bucket").notNull().default(""),
  accessKey: text("access_key").notNull().default(""),
  secretKeyEnc: text("secret_key_enc").notNull().default(""),
  cdnHost: text("cdn_host").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  trackId: text("track_id").references(() => tracks.id, { onDelete: "cascade" }),
  versionId: text("version_id").references(() => versions.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  readAt: integer("read_at"),
});
