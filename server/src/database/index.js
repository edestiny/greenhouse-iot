// ============================================================
// SQLite 数据库初始化 (sql.js — 纯 JS/WebAssembly，无需编译)
//
// 用法：
//   const db = require('../database');   // 返回兼容对象
//   await db.init();                      // 启动时调用一次
//   之后所有 db.prepare(sql).get/run/all(...) 与 better-sqlite3 用法一致
// ============================================================
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let _db = null; // 底层 sql.js Database 实例

// 确保 data 目录存在
const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 持久化到磁盘
const save = () => {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(config.db.path, Buffer.from(data));
};

// ---- 原始查询方法（供 prepare 内部使用） ----

const _get = (sql, params) => {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    return cols.reduce((obj, col, i) => ({ ...obj, [col]: vals[i] }), {});
  }
  stmt.free();
  return undefined;
};

const _all = (sql, params) => {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    rows.push(cols.reduce((obj, col, i) => ({ ...obj, [col]: vals[i] }), {}));
  }
  stmt.free();
  return rows;
};

const _run = (sql, params) => {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  const changes = _db.getRowsModified();
  const lastId = _get('SELECT last_insert_rowid() as id', [])?.id;
  stmt.free();
  save();
  return { changes, lastInsertRowid: lastId };
};

// ---- 兼容 better-sqlite3 的 db 对象 ----
// 直接用 mod = db 即可：
//   mod.prepare(sql).get(a, b)   ✓
//   mod.exec(sql)                ✓

const mod = {
  // 用于 app.js 启动时异步初始化
  init: async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(config.db.path)) {
      _db = new SQL.Database(fs.readFileSync(config.db.path));
    } else {
      _db = new SQL.Database();
    }
    _db.run('PRAGMA foreign_keys = ON');

    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, openid TEXT UNIQUE NOT NULL, nickname TEXT,
        avatar_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, name TEXT DEFAULT '我的温室', user_id TEXT NOT NULL,
        is_online INTEGER DEFAULT 0, last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id))`,
      `CREATE TABLE IF NOT EXISTS device_configs (
        device_id TEXT PRIMARY KEY, humidity_min REAL DEFAULT 40.0,
        ph_min REAL DEFAULT 6.0, ph_max REAL DEFAULT 7.5,
        light_min REAL DEFAULT 500.0, report_interval INTEGER DEFAULT 5,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id))`,
      `CREATE TABLE IF NOT EXISTS sensor_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
        temperature REAL, humidity REAL, soil_ph REAL, water_level REAL,
        light REAL, pump_state INTEGER DEFAULT 0, lamp_state INTEGER DEFAULT 0,
        recorded_at DATETIME NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id))`,
      `CREATE INDEX IF NOT EXISTS idx_sensor_device_time ON sensor_data(device_id, recorded_at)`,
      `CREATE TABLE IF NOT EXISTS control_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
        action TEXT NOT NULL, source TEXT DEFAULT 'manual', result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id))`,
      `CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
        type TEXT NOT NULL, level TEXT DEFAULT 'warning', message TEXT,
        resolved INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id))`,
      `CREATE TABLE IF NOT EXISTS sensor_data_minute (
        id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
        temperature REAL, humidity REAL, soil_ph REAL, water_level REAL,
        light REAL, recorded_at DATETIME NOT NULL,
        FOREIGN KEY (device_id) REFERENCES devices(id))`,
      `CREATE INDEX IF NOT EXISTS idx_sensor_minute_device_time ON sensor_data_minute(device_id, recorded_at)`,
    ];
    for (const sql of tables) _db.run(sql);
    save();
    console.log('[DB] 表结构初始化完成 (sql.js)');
  },

  exec: (sql) => { _db.run(sql); save(); },

  prepare: (sql) => ({
    get: (...params) => _get(sql, params),
    all: (...params) => _all(sql, params),
    run: (...params) => _run(sql, params),
  }),
};

module.exports = mod;
