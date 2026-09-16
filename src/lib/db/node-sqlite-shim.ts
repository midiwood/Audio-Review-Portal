/**
 * better-sqlite3–compatible wrapper around Node's built-in node:sqlite.
 * Avoids native prebuilds that require a newer glibc than cPanel provides.
 */
import { DatabaseSync, type StatementSync } from "node:sqlite";

export type SqliteStatement = {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
  raw: () => {
    get: (...params: unknown[]) => unknown[] | undefined;
    all: (...params: unknown[]) => unknown[][];
  };
};

export type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
  exec: (sql: string) => void;
  pragma: (source: string) => void;
  transaction: <T>(fn: (arg: T) => unknown) => ((arg: T) => unknown) & {
    deferred: (arg: T) => unknown;
    immediate: (arg: T) => unknown;
    exclusive: (arg: T) => unknown;
  };
  close: () => void;
};

function wrapStatement(db: DatabaseSync, sql: string): SqliteStatement {
  const stmt = db.prepare(sql);

  const run = (...params: unknown[]) => {
    const info = stmt.run(...(params as never[]));
    return {
      changes: Number(info.changes ?? 0),
      lastInsertRowid: info.lastInsertRowid as number | bigint,
    };
  };

  const get = (...params: unknown[]) =>
    stmt.get(...(params as never[])) as Record<string, unknown> | undefined;

  const all = (...params: unknown[]) =>
    stmt.all(...(params as never[])) as Record<string, unknown>[];

  const raw = () => {
    const rawStmt: StatementSync = db.prepare(sql);
    const setReturnArrays = (
      rawStmt as StatementSync & { setReturnArrays?: (v: boolean) => void }
    ).setReturnArrays;
    if (typeof setReturnArrays === "function") {
      setReturnArrays.call(rawStmt, true);
    }

    const toArray = (row: unknown): unknown[] | undefined => {
      if (row == null) return undefined;
      if (Array.isArray(row)) return row;
      return Object.values(row as Record<string, unknown>);
    };

    return {
      get: (...params: unknown[]) => toArray(rawStmt.get(...(params as never[]))),
      all: (...params: unknown[]) =>
        (rawStmt.all(...(params as never[])) as unknown[]).map((row) => toArray(row) ?? []),
    };
  };

  return { run, get, all, raw };
}

export function openSqlite(file: string): SqliteDatabase {
  const db = new DatabaseSync(file);

  const runTx =
    (behavior: "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE") =>
    <T>(fn: (arg: T) => unknown) =>
    (arg: T) => {
      db.exec(`BEGIN ${behavior}`);
      try {
        const result = fn(arg);
        db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    };

  return {
    prepare: (sql: string) => wrapStatement(db, sql),
    exec: (sql: string) => {
      db.exec(sql);
    },
    pragma: (source: string) => {
      db.exec(`PRAGMA ${source}`);
    },
    transaction: <T>(fn: (arg: T) => unknown) => {
      const deferred = runTx("DEFERRED")(fn);
      return Object.assign(deferred, {
        deferred,
        immediate: runTx("IMMEDIATE")(fn),
        exclusive: runTx("EXCLUSIVE")(fn),
      });
    },
    close: () => db.close(),
  };
}
