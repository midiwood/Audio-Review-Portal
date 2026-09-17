import fs from "node:fs";
import path from "node:path";
import { hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import { dbFile, ensureDataDirs } from "@/lib/paths";
import { openSqlite, type SqliteDatabase } from "./node-sqlite-shim";
import * as schema from "./schema";

type GlobalDb = {
  sqlite?: SqliteDatabase;
  drizzle?: ReturnType<typeof drizzle<typeof schema>>;
};

const globalForDb = globalThis as unknown as GlobalDb;

function columns(sqlite: SqliteDatabase, table: string) {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((col) => col.name);
}

function ensureColumn(sqlite: SqliteDatabase, table: string, name: string, ddl: string) {
  if (columns(sqlite, table).includes(name)) return false;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  return true;
}

function createTables(sqlite: SqliteDatabase) {
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'member',
      subscribed INTEGER NOT NULL DEFAULT 0,
      avatar_filename TEXT,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      share_token TEXT NOT NULL UNIQUE,
      invite_token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      composer_id TEXT REFERENCES users(id),
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      duration_seconds REAL,
      unread_for_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
      parent_id TEXT,
      author_user_id TEXT,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      timestamp_seconds REAL NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "references" (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_members_project ON project_members(project_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_project ON tracks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_composer ON tracks(composer_id);
    CREATE INDEX IF NOT EXISTS idx_versions_track ON versions(track_id);
    CREATE INDEX IF NOT EXISTS idx_comments_version ON comments(version_id);
    CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_references_track ON "references"(track_id);

    CREATE TABLE IF NOT EXISTS track_deliveries (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'stem',
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deliveries_track ON track_deliveries(track_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      bucket TEXT NOT NULL DEFAULT '',
      access_key TEXT NOT NULL DEFAULT '',
      secret_key_enc TEXT NOT NULL DEFAULT '',
      cdn_host TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      track_id TEXT REFERENCES tracks(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES versions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
  `);
}

function migrateSchema(sqlite: SqliteDatabase) {
  let changed = false;
  const refCols = columns(sqlite, `"references"`);
  if (refCols.length > 0 && !refCols.includes("track_id")) {
    sqlite.exec(`
      DROP TABLE IF EXISTS "references";
      CREATE TABLE "references" (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      DROP INDEX IF EXISTS idx_references_project;
      CREATE INDEX IF NOT EXISTS idx_references_track ON "references"(track_id);
    `);
    changed = true;
  }

  if (columns(sqlite, "users").length > 0) {
    changed = ensureColumn(sqlite, "users", "name", "TEXT NOT NULL DEFAULT ''") || changed;
    changed = ensureColumn(sqlite, "users", "role", "TEXT NOT NULL DEFAULT 'member'") || changed;
    changed = ensureColumn(sqlite, "users", "subscribed", "INTEGER NOT NULL DEFAULT 0") || changed;
    changed = ensureColumn(sqlite, "users", "avatar_filename", "TEXT") || changed;
    changed = ensureColumn(sqlite, "users", "deleted_at", "INTEGER") || changed;
    sqlite.exec(`UPDATE users SET role = 'superadmin', subscribed = 1 WHERE role = 'admin'`);
    sqlite.exec(`UPDATE users SET role = 'member' WHERE role = 'composer'`);
  }
  if (columns(sqlite, "tracks").length > 0) {
    changed = ensureColumn(sqlite, "tracks", "composer_id", "TEXT") || changed;
    changed = ensureColumn(sqlite, "tracks", "deleted_at", "INTEGER") || changed;
  }
  if (columns(sqlite, "versions").length > 0) {
    changed = ensureColumn(sqlite, "versions", "unread_for_admin", "INTEGER NOT NULL DEFAULT 0") || changed;
  }
  if (columns(sqlite, "comments").length > 0) {
    changed = ensureColumn(sqlite, "comments", "parent_id", "TEXT") || changed;
    changed = ensureColumn(sqlite, "comments", "resolved", "INTEGER NOT NULL DEFAULT 0") || changed;
    changed = ensureColumn(sqlite, "comments", "author_user_id", "TEXT") || changed;
  }
  if (columns(sqlite, "projects").length > 0) {
    const addedInvite = ensureColumn(sqlite, "projects", "invite_token", "TEXT");
    changed = addedInvite || changed;
    changed = ensureColumn(sqlite, "projects", "deleted_at", "INTEGER") || changed;
    const missing = sqlite.prepare(`SELECT id FROM projects WHERE invite_token IS NULL OR invite_token = ''`).all() as { id: string }[];
    const update = sqlite.prepare(`UPDATE projects SET invite_token = ? WHERE id = ?`);
    for (const row of missing) update.run(nanoid(21), row.id);
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_invite ON projects(invite_token)`);
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS track_deliveries (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'stem',
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deliveries_track ON track_deliveries(track_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      bucket TEXT NOT NULL DEFAULT '',
      access_key TEXT NOT NULL DEFAULT '',
      secret_key_enc TEXT NOT NULL DEFAULT '',
      cdn_host TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      track_id TEXT REFERENCES tracks(id) ON DELETE CASCADE,
      version_id TEXT REFERENCES versions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
  `);

  sqlite.exec(`
    UPDATE tracks SET composer_id = (
      SELECT owner_id FROM projects WHERE projects.id = tracks.project_id
    ) WHERE composer_id IS NULL
  `);

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail) {
    sqlite.prepare(`UPDATE users SET role = 'superadmin', subscribed = 1 WHERE email = ?`).run(ownerEmail);
  }
  sqlite.exec(`
    UPDATE users SET name = substr(email, 1, instr(email, '@') - 1)
    WHERE name IS NULL OR name = ''
  `);

  return changed;
}

function seedOwner(db: ReturnType<typeof drizzle<typeof schema>>) {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) return;

  const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (existing) {
    if (existing.role !== "superadmin" || !existing.subscribed) {
      db.update(schema.users)
        .set({ role: "superadmin", subscribed: 1 })
        .where(eq(schema.users.id, existing.id))
        .run();
    }
    return;
  }

  db.insert(schema.users)
    .values({
      id: nanoid(),
      email,
      name: email.split("@")[0] || "Admin",
      role: "superadmin",
      subscribed: 1,
      passwordHash: hashSync(password, 10),
      createdAt: Date.now(),
    })
    .run();
}

export function getDb() {
  ensureDataDirs();
  if (!globalForDb.sqlite) {
    const file = dbFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    globalForDb.sqlite = openSqlite(file);
  }
  globalForDb.sqlite.pragma("foreign_keys = ON");
  const rebuilt = migrateSchema(globalForDb.sqlite);
  createTables(globalForDb.sqlite);
  if (!globalForDb.drizzle || rebuilt) {
    // Shim matches the better-sqlite3 surface drizzle expects (prepare/run/get/all/raw/transaction).
    globalForDb.drizzle = drizzle(globalForDb.sqlite as never, { schema });
    seedOwner(globalForDb.drizzle);
  }
  return globalForDb.drizzle;
}
