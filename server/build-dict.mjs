/**
 * 将 ECDICT 词库 CSV 导入 SQLite（首次运行一次即可）
 * 用法: node build-dict.mjs
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'node_modules', 'ecdict', 'assets', 'ecdict.csv');
const dbPath = path.join(__dirname, 'dict', 'dict.db');

if (!fs.existsSync(csvPath)) {
  console.error('未找到词库文件:', csvPath);
  process.exit(1);
}

if (fs.existsSync(dbPath)) {
  fs.rmSync(dbPath);
}
for (const suffix of ['-wal', '-shm']) {
  const f = dbPath + suffix;
  if (fs.existsSync(f)) fs.rmSync(f);
}

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE dict (
    word TEXT PRIMARY KEY,
    phonetic TEXT,
    definition TEXT,
    translation TEXT
  );
`);

/** 解析单行 CSV（带引号转义） */
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

const insert = db.prepare(
  'INSERT OR IGNORE INTO dict (word, phonetic, definition, translation) VALUES (?, ?, ?, ?)'
);

const rl = readline.createInterface({ input: fs.createReadStream(csvPath, 'utf8') });
let count = 0;
let lineNo = 0;

db.exec('BEGIN');
const commitEvery = 50000;

rl.on('line', (line) => {
  lineNo++;
  if (lineNo === 1) return; // 表头
  const f = parseCsvLine(line);
  const word = (f[0] || '').trim();
  if (!word) return;
  const phonetic = (f[1] || '').trim();
  const definition = (f[2] || '').trim();
  const translation = (f[3] || '').trim();
  if (!definition && !translation) return;
  try {
    insert.run(word, phonetic, definition, translation);
    count++;
  } catch { /* 忽略异常行 */ }
  if (count % commitEvery === 0) {
    db.exec('COMMIT; BEGIN;');
    console.log(`已导入 ${count} 条…`);
  }
});

rl.on('close', () => {
  db.exec('COMMIT');
  db.exec('ANALYZE');
  console.log(`完成：共导入 ${count} 条词条 -> ${dbPath}`);
  db.close();
});

rl.on('error', (err) => {
  console.error('读取词库失败:', err);
  process.exit(1);
});
