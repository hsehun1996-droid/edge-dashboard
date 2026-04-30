/**
 * Scanner SQLite database
 * better-sqlite3를 직접 사용해 윈도우 함수 기반 고성능 분석 쿼리 지원
 */

import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DB_DIR  = path.join(process.cwd(), "data")
const DB_PATH = path.join(DB_DIR, "scanner.db")

// globalThis 캐시 (Next.js HMR 재생성 방지)
const g = globalThis as unknown as { _scannerDb?: Database.Database }

export function getScannerDB(): Database.Database {
  if (g._scannerDb) return g._scannerDb

  fs.mkdirSync(DB_DIR, { recursive: true })

  const db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = NORMAL")
  db.pragma("cache_size = -65536")  // 64 MB page cache
  db.pragma("temp_store = MEMORY")

  initSchema(db)

  if (process.env.NODE_ENV !== "production") g._scannerDb = db
  return db
}

// ─── Schema ──────────────────────────────────────────────────────────────────

function initSchema(db: Database.Database): void {
  db.exec(`
    -- 전체 종목 universe
    CREATE TABLE IF NOT EXISTS stocks (
      ticker      TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT '',
      exchange    TEXT NOT NULL DEFAULT '',
      country     TEXT NOT NULL CHECK(country IN ('US','KR')),
      active      INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- 일별 종가 (ticker, date) PK
    CREATE TABLE IF NOT EXISTS daily_prices (
      ticker  TEXT NOT NULL,
      date    TEXT NOT NULL,   -- 'YYYY-MM-DD'
      close   REAL NOT NULL,
      volume  INTEGER,
      PRIMARY KEY (ticker, date)
    );
    CREATE INDEX IF NOT EXISTS idx_dp_ticker_date
      ON daily_prices(ticker, date DESC);

    -- 최신 스캔 결과 캐시
    CREATE TABLE IF NOT EXISTS scan_cache (
      ticker              TEXT PRIMARY KEY,
      name                TEXT,
      exchange            TEXT,
      country             TEXT,
      scanned_at          TEXT NOT NULL DEFAULT (datetime('now')),
      price               REAL DEFAULT 0,
      change_pct          REAL DEFAULT 0,
      volume              INTEGER DEFAULT 0,
      avg_volume          INTEGER DEFAULT 0,
      market_cap          INTEGER DEFAULT 0,
      rs_rating           INTEGER DEFAULT 0,
      ma50                REAL DEFAULT 0,
      ma150               REAL DEFAULT 0,
      ma200               REAL DEFAULT 0,
      high52w             REAL DEFAULT 0,
      low52w              REAL DEFAULT 0,
      pass_count          INTEGER DEFAULT 0,
      passed              INTEGER DEFAULT 0,
      above150ma          INTEGER DEFAULT 0,
      above200ma          INTEGER DEFAULT 0,
      ma150_above_ma200   INTEGER DEFAULT 0,
      ma200_trending      INTEGER DEFAULT 0,
      ma50_above_ma150    INTEGER DEFAULT 0,
      ma50_above_ma200    INTEGER DEFAULT 0,
      price_above_ma50    INTEGER DEFAULT 0,
      near52w_high        INTEGER DEFAULT 0,
      above52w_low        INTEGER DEFAULT 0,
      high_rs_rating      INTEGER DEFAULT 0,
      rs85_rating         INTEGER DEFAULT 0,
      near52w_high_15     INTEGER DEFAULT 0,
      price_min_ok        INTEGER DEFAULT 0,
      liquidity_ok        INTEGER DEFAULT 0,
      turnover_ok         INTEGER DEFAULT 0,
      volume_support      INTEGER DEFAULT 0,
      enhanced_pass_count INTEGER DEFAULT 0,
      enhanced_passed     INTEGER DEFAULT 0,
      quality_score       REAL DEFAULT 0,
      price_history       TEXT DEFAULT '[]'
    );

    -- 동기화 상태 (싱글턴 row id=1)
    CREATE TABLE IF NOT EXISTS sync_status (
      id              INTEGER PRIMARY KEY CHECK(id = 1),
      status          TEXT NOT NULL DEFAULT 'idle',
      sync_type       TEXT DEFAULT 'full',
      scope           TEXT DEFAULT 'ALL',
      phase           TEXT DEFAULT '',
      total           INTEGER DEFAULT 0,
      success         INTEGER DEFAULT 0,
      failed          INTEGER DEFAULT 0,
      started_at      TEXT,
      updated_at      TEXT,
      last_scan_at    TEXT,
      scan_count      INTEGER DEFAULT 0,
      message         TEXT DEFAULT ''
    );
    INSERT OR IGNORE INTO sync_status(id, status) VALUES(1, 'idle');
  `)

  ensureColumns(db, "scan_cache", [
    { name: "rs85_rating", type: "INTEGER DEFAULT 0" },
    { name: "near52w_high_15", type: "INTEGER DEFAULT 0" },
    { name: "price_min_ok", type: "INTEGER DEFAULT 0" },
    { name: "liquidity_ok", type: "INTEGER DEFAULT 0" },
    { name: "turnover_ok", type: "INTEGER DEFAULT 0" },
    { name: "volume_support", type: "INTEGER DEFAULT 0" },
    { name: "enhanced_pass_count", type: "INTEGER DEFAULT 0" },
    { name: "enhanced_passed", type: "INTEGER DEFAULT 0" },
    { name: "quality_score", type: "REAL DEFAULT 0" },
  ])
  ensureColumns(db, "sync_status", [
    { name: "sync_type", type: "TEXT DEFAULT 'full'" },
    { name: "scope", type: "TEXT DEFAULT 'ALL'" },
  ])
}

function ensureColumns(
  db: Database.Database,
  table: string,
  columns: Array<{ name: string; type: string }>
): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
  )

  for (const column of columns) {
    if (existing.has(column.name)) continue
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type}`)
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export interface SyncStatusRow {
  status: string
  sync_type: string
  scope: string
  phase: string
  total: number
  success: number
  failed: number
  started_at: string | null
  updated_at: string | null
  last_scan_at: string | null
  scan_count: number
  message: string
}

export function getSyncStatus(): SyncStatusRow {
  const db = getScannerDB()
  return db.prepare("SELECT * FROM sync_status WHERE id = 1").get() as SyncStatusRow
}

export function updateSyncStatus(fields: Partial<SyncStatusRow>): void {
  const db = getScannerDB()
  const entries = Object.entries(fields)
  if (entries.length === 0) return
  const sets = entries.map(([k]) => `${k} = ?`).join(", ")
  const vals = entries.map(([, v]) => v)
  db.prepare(
    `UPDATE sync_status SET ${sets}, updated_at = datetime('now') WHERE id = 1`
  ).run(...vals)
}
