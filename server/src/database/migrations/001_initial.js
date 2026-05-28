// ============================================================
// 数据库迁移脚本
// 独立运行：node src/database/migrations/001_initial.js
// ============================================================
const path = require('path');
const fs = require('fs');

// 确保在项目根目录执行
process.chdir(path.join(__dirname, '..', '..'));

console.log('初始化数据库...');
const db = require('../database');

console.log('数据库初始化完成!');
console.log(`路径: ${path.resolve(require('../config').db.path)}`);

// 打印表结构
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all();

console.log('\n已创建的表:');
tables.forEach((t) => console.log(`  - ${t.name}`));

process.exit(0);
