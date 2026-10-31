import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { extractPdfText } from './pdf-text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/* ---------------- 业务数据（论文/笔记/生词） ---------------- */
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    phonetic TEXT DEFAULT '',
    translation TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE(paper_id, word)
  );
`);

// 旧库迁移：为 papers 表补充阅读记录字段
{
  const cols = db.prepare('PRAGMA table_info(papers)').all().map((c) => c.name);
  if (!cols.includes('status')) {
    db.exec("ALTER TABLE papers ADD COLUMN status TEXT NOT NULL DEFAULT 'unread'");
  }
  if (!cols.includes('total_pages')) {
    db.exec('ALTER TABLE papers ADD COLUMN total_pages INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('last_page')) {
    db.exec('ALTER TABLE papers ADD COLUMN last_page INTEGER NOT NULL DEFAULT 1');
  }
  if (!cols.includes('last_read_at')) {
    db.exec('ALTER TABLE papers ADD COLUMN last_read_at TEXT');
  }
  if (!cols.includes('bvid')) {
    db.exec('ALTER TABLE papers ADD COLUMN bvid TEXT');
  }
  if (!cols.includes('fulltext')) {
    db.exec('ALTER TABLE papers ADD COLUMN fulltext TEXT');
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// 旧库迁移：为 chat_sessions 补充选段字段
{
  const chatCols = db.prepare('PRAGMA table_info(chat_sessions)').all().map((c) => c.name);
  if (!chatCols.includes('context')) {
    db.exec("ALTER TABLE chat_sessions ADD COLUMN context TEXT NOT NULL DEFAULT ''");
  }
}

/* ---------------- 词典 ---------------- */
const dictDbPath = path.join(__dirname, 'dict', 'dict.db');
let dictStmt = null;
if (fs.existsSync(dictDbPath)) {
  const dictDb = new Database(dictDbPath, { readonly: true });
  dictStmt = dictDb.prepare('SELECT word, phonetic, definition, translation FROM dict WHERE word = ?');
} else {
  console.warn('警告：未找到词典数据库 dict/dict.db，请先运行 npm run build:dict');
}

/** 查询单词：原形 -> 小写 -> 常见词形变化推测 */
function lookupWord(raw) {
  const clean = String(raw || '').trim();
  if (!clean || !dictStmt) {
    return { word: clean, phonetic: '', translation: '', definition: '', found: false };
  }
  const w = clean.toLowerCase().replace(/[^a-z'’-]/g, '');
  const candidates = [];
  const push = (x) => { if (x && x.length > 1 && !candidates.includes(x)) candidates.push(x); };
  push(clean);
  push(w);
  // 复数 / 三单
  if (w.endsWith('ies') && w.length > 4) push(w.slice(0, -3) + 'y');
  if (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('ches') || w.endsWith('shes')) push(w.slice(0, -2));
  if (w.endsWith('s') && w.length > 3) push(w.slice(0, -1));
  // 过去式 / 过去分词
  if (w.endsWith('ied') && w.length > 4) push(w.slice(0, -3) + 'y');
  if (w.endsWith('ed') && w.length > 4) { push(w.slice(0, -1)); push(w.slice(0, -2)); push(w.slice(0, -3) + 'e'); push(w.slice(0, -3)); }
  // 进行时
  if (w.endsWith('ing') && w.length > 5) { push(w.slice(0, -3)); push(w.slice(0, -3) + 'e'); push(w.slice(0, -4)); }
  // 比较级 / 最高级
  if (w.endsWith('ier') && w.length > 4) push(w.slice(0, -3) + 'y');
  if (w.endsWith('iest') && w.length > 5) push(w.slice(0, -4) + 'y');
  if (w.endsWith('er') && w.length > 4) push(w.slice(0, -2));
  if (w.endsWith('est') && w.length > 5) push(w.slice(0, -3));
  // 副词
  if (w.endsWith('ly') && w.length > 4) {
    push(w.slice(0, -2));
    if (w.slice(0, -2).endsWith('li')) push(w.slice(0, -3) + 'y'); // simply -> simple
  }

  const exact = [clean, w];
  for (const c of candidates) {
    const row = dictStmt.get(c);
    if (row) {
      // 词库中以字面 \\n 表示换行，转换为真实换行
      const cleanText = (s) => (s || '').replace(/\\n/g, '\n').trim();
      return {
        word: row.word,
        phonetic: cleanText(row.phonetic),
        translation: cleanText(row.translation),
        definition: cleanText(row.definition),
        found: exact.includes(c)
      };
    }
  }
  return { word: clean, phonetic: '', translation: '', definition: '', found: false };
}

/* ---------------- API: 翻译 ---------------- */
app.get('/api/translate', (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) return res.json({ entries: [] });
  const tokens = text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  const unique = [...new Set(tokens.map((t) => t))].slice(0, 6);
  const entries = unique.map((t) => {
    const e = lookupWord(t);
    return e.translation || e.definition ? e : { ...e, found: e.found };
  }).filter((e, i, arr) => arr.findIndex((x) => x.word.toLowerCase() === e.word.toLowerCase()) === i);
  res.json({ entries });
});

const PAPER_LIST_SQL = `
  SELECT p.id, p.name, p.created_at, p.status, p.total_pages, p.last_page, p.last_read_at, p.bvid,
    (SELECT COUNT(*) FROM notes n WHERE n.paper_id = p.id) AS note_count,
    (SELECT COUNT(*) FROM words w WHERE w.paper_id = p.id) AS word_count
  FROM papers p
  ORDER BY COALESCE(p.last_read_at, p.created_at) DESC, p.id DESC
`;

/* ---------------- API: 论文 ---------------- */
app.get('/api/papers', (req, res) => {
  res.json(db.prepare(PAPER_LIST_SQL).all());
});

app.post('/api/papers', express.raw({ type: 'application/pdf', limit: '200mb' }), (req, res) => {
  const name = decodeURIComponent(req.query.name || '未命名论文.pdf');
  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: '文件内容为空' });
  }
  const info = db.prepare('INSERT INTO papers (name, file_path) VALUES (?, ?)').run(name, '');
  const id = info.lastInsertRowid;
  const filePath = path.join(uploadDir, `${id}.pdf`);
  fs.writeFileSync(filePath, req.body);
  db.prepare('UPDATE papers SET file_path = ? WHERE id = ?').run(filePath, id);
  // 异步提取全文（不阻塞响应）
  extractPdfText(filePath)
    .then(({ text, pages }) => {
      db.prepare('UPDATE papers SET fulltext = ?, total_pages = ? WHERE id = ?').run(text, pages, id);
    })
    .catch(() => { /* 提取失败时聊天阶段会再尝试 */ });
  res.json({ id, name, created_at: new Date().toISOString() });
});

app.get('/api/papers/:id/file', (req, res) => {
  const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(req.params.id);
  if (!paper || !fs.existsSync(paper.file_path)) {
    return res.status(404).json({ error: '论文不存在' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(paper.file_path);
});

// 更新阅读状态：unread / reading / read
app.patch('/api/papers/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['unread', 'reading', 'read'].includes(status)) {
    return res.status(400).json({ error: '无效的阅读状态' });
  }
  const info = db.prepare('UPDATE papers SET status = ? WHERE id = ?').run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: '论文不存在' });
  res.json(db.prepare(PAPER_LIST_SQL).all().find((p) => p.id === Number(req.params.id)));
});

// 更新阅读进度（同时刷新最后阅读时间）
app.patch('/api/papers/:id/progress', (req, res) => {
  const page = Math.max(1, parseInt(req.body?.page, 10) || 1);
  const totalPages = Math.max(0, parseInt(req.body?.totalPages, 10) || 0);
  const info = db
    .prepare("UPDATE papers SET last_page = ?, total_pages = ?, last_read_at = datetime('now', 'localtime') WHERE id = ?")
    .run(page, totalPages, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: '论文不存在' });
  res.json({ ok: true });
});

// 关联 / 取消关联 B 站讲解视频（支持 BV 号、av 号、完整链接、b23.tv 短链）
app.patch('/api/papers/:id/video', async (req, res) => {
  const input = String(req.body?.url || '').trim();
  const paper = db.prepare('SELECT id FROM papers WHERE id = ?').get(req.params.id);
  if (!paper) return res.status(404).json({ error: '论文不存在' });

  let bvid = null;
  if (input) {
    const bvMatch = input.match(/BV[0-9A-Za-z]{10}/);
    if (bvMatch) {
      bvid = bvMatch[0];
    } else {
      const avMatch = input.match(/av(\d+)/i);
      if (avMatch) {
        bvid = 'av:' + avMatch[1];
      } else if (/b23\.tv|bili2233\.cn|bilibili\.com/i.test(input)) {
        // 短链/页面链接：请求后从最终 URL 中解析
        try {
          const url = input.startsWith('http') ? input : `https://${input}`;
          const resp = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
          const finalUrl = resp.url || '';
          const m = finalUrl.match(/BV[0-9A-Za-z]{10}/);
          if (m) bvid = m[0];
        } catch { /* 解析失败则报错 */ }
      }
    }
  }

  if (input && !bvid) {
    return res.status(400).json({ error: '无法从输入中识别视频，请粘贴 B 站视频链接或 BV 号' });
  }

  db.prepare('UPDATE papers SET bvid = ? WHERE id = ?').run(bvid, req.params.id);
  res.json({ ok: true, bvid });
});

app.delete('/api/papers/:id', (req, res) => {
  const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(req.params.id);
  if (!paper) return res.status(404).json({ error: '论文不存在' });
  db.prepare('DELETE FROM notes WHERE paper_id = ?').run(req.params.id);
  db.prepare('DELETE FROM words WHERE paper_id = ?').run(req.params.id);
  db.prepare('DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE paper_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM chat_sessions WHERE paper_id = ?').run(req.params.id);
  db.prepare('DELETE FROM papers WHERE id = ?').run(req.params.id);
  if (paper.file_path && fs.existsSync(paper.file_path)) fs.unlinkSync(paper.file_path);
  res.json({ ok: true });
});

/* ---------------- 设置（AI 配置） ---------------- */
const SETTING_KEYS = ['ai_base_url', 'ai_api_key', 'ai_model'];

app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({
    ai_base_url: s.ai_base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ai_model: s.ai_model || 'qwen-plus',
    // API Key 脱敏返回：只提示是否已配置
    ai_api_key_set: Boolean(s.ai_api_key)
  });
});

app.put('/api/settings', (req, res) => {
  const { ai_base_url, ai_api_key, ai_model } = req.body || {};
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (typeof ai_base_url === 'string' && ai_base_url.trim()) upsert.run('ai_base_url', ai_base_url.trim());
  if (typeof ai_api_key === 'string' && ai_api_key.trim()) upsert.run('ai_api_key', ai_api_key.trim());
  if (typeof ai_model === 'string' && ai_model.trim()) upsert.run('ai_model', ai_model.trim());
  res.json({ ok: true });
});

/** 调用 OpenAI 兼容接口，返回回复文本 */
async function callLLM(messages) {
  const s = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  const baseUrl = (s.ai_base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const apiKey = s.ai_api_key || '';
  const model = s.ai_model || 'qwen-plus';
  if (!apiKey) {
    const err = new Error('AI 未配置：请先在设置中填写 API Key');
    err.status = 400;
    throw err;
  }
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 })
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    const err = new Error(`AI 接口错误 (${resp.status}): ${detail.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error('AI 返回内容为空');
    err.status = 502;
    throw err;
  }
  return content;
}

/** 确保论文全文已提取（懒加载） */
function ensureFulltext(paper) {
  if (paper.fulltext) return paper.fulltext;
  return (async () => {
    try {
      const { text, pages } = await extractPdfText(paper.file_path);
      db.prepare('UPDATE papers SET fulltext = ?, total_pages = ? WHERE id = ?').run(text, pages, paper.id);
      return text;
    } catch {
      return '';
    }
  })();
}

/* ---------------- API: AI 聊天 ---------------- */
// 会话列表
app.get('/api/papers/:id/chats', (req, res) => {
  res.json(db.prepare('SELECT * FROM chat_sessions WHERE paper_id = ? ORDER BY updated_at DESC, id DESC').all(req.params.id));
});

// 新建会话（可携带选定讨论的论文选段）
app.post('/api/papers/:id/chats', (req, res) => {
  const paper = db.prepare('SELECT id FROM papers WHERE id = ?').get(req.params.id);
  if (!paper) return res.status(404).json({ error: '论文不存在' });
  const count = db.prepare('SELECT COUNT(*) AS c FROM chat_sessions WHERE paper_id = ?').get(req.params.id).c;
  const context = String(req.body?.context || '').trim().slice(0, 20000);
  const info = db.prepare('INSERT INTO chat_sessions (paper_id, title, context) VALUES (?, ?, ?)').run(req.params.id, `对话 ${count + 1}`, context);
  res.json(db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(info.lastInsertRowid));
});

// 重命名会话
app.patch('/api/chats/:id', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 50);
  if (!title) return res.status(400).json({ error: '标题不能为空' });
  const info = db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(title, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: '会话不存在' });
  res.json(db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(req.params.id));
});

// 删除会话
app.delete('/api/chats/:id', (req, res) => {
  db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 消息列表
app.get('/api/chats/:id/messages', (req, res) => {
  res.json(db.prepare('SELECT id, role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC').all(req.params.id));
});

// 发送消息：保存用户消息 -> 调用 AI -> 保存回复
app.post('/api/chats/:id/messages', async (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: '消息不能为空' });
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });

  const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(session.paper_id);
  const userMsg = db
    .prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)')
    .run(session.id, 'user', content);

  try {
    // 历史消息（最近 20 条）作为上下文
    const history = db
      .prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 20')
      .all(session.id)
      .reverse();

    // 该会话绑定的论文选段（而非全文）
    const ctx = (session.context || '').trim();
    const paperContext = ctx
      ? ctx.slice(0, 20000)
      : '（该对话未绑定选段，请基于通用知识回答，并提示用户可在新建对话时选定论文选段）';

    const messages = [
      {
        role: 'system',
        content:
          `你是一个论文阅读助手。用户正在阅读论文《${paper?.name || ''}》，并选定了一段内容进行讨论。请围绕这段内容回答用户的问题，回答使用中文，条理清晰；如问题超出选段范围，可适当补充背景但需注明。\n\n===== 选定段落 =====\n${paperContext}`
      },
      ...history
    ];

    const reply = await callLLM(messages);
    const aiMsg = db
      .prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)')
      .run(session.id, 'assistant', reply);
    db.prepare("UPDATE chat_sessions SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(session.id);

    // 首条对话：用用户消息前 20 字更新会话标题
    const msgCount = db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?').get(session.id).c;
    if (msgCount === 2 && session.title.startsWith('对话 ')) {
      db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(content.slice(0, 20), session.id);
    }

    res.json({
      user: { id: userMsg.lastInsertRowid, role: 'user', content },
      assistant: { id: aiMsg.lastInsertRowid, role: 'assistant', content: reply }
    });
  } catch (err) {
    // AI 失败时保留用户消息并返回错误
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
});

// 整理对话为笔记
app.post('/api/chats/:id/summarize', async (req, res) => {
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(session.paper_id);
  const messages = db.prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC').all(session.id);
  if (messages.length === 0) return res.status(400).json({ error: '会话中还没有消息' });

  const dialog = messages.map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n\n');
  try {
    const summary = await callLLM([
      {
        role: 'system',
        content:
          '你是一个论文阅读助手。请把用户与 AI 关于论文的对话整理成一条结构清晰的中文笔记，用于日后回顾。要求：1) 提炼对话中的关键问题和结论，不要逐句复述；2) 用 Markdown 风格分点组织；3) 保留重要的公式、术语和英文原文（如有）；4) 直接输出笔记内容，不要客套话。'
      },
      { role: 'user', content: `论文：《${paper?.name || ''}》\n\n===== 对话记录 =====\n${dialog.slice(0, 40000)}` }
    ]);

    // 写入笔记表
    const page = Math.max(1, parseInt(req.body?.page, 10) || 1);
    const noteContent = `【AI 整理】${session.title}\n\n${summary}`;
    const info = db
      .prepare('INSERT INTO notes (paper_id, page, content) VALUES (?, ?, ?)')
      .run(session.paper_id, page, noteContent);
    res.json({ note_id: info.lastInsertRowid, content: noteContent });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
});

/* ---------------- API: 笔记 ---------------- */
app.get('/api/papers/:id/notes', (req, res) => {
  res.json(db.prepare('SELECT * FROM notes WHERE paper_id = ? ORDER BY page ASC, id ASC').all(req.params.id));
});

app.post('/api/papers/:id/notes', (req, res) => {
  const { page, content } = req.body || {};
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: '笔记内容不能为空' });
  }
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const info = db
    .prepare('INSERT INTO notes (paper_id, page, content) VALUES (?, ?, ?)')
    .run(req.params.id, pageNum, String(content).trim());
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/notes/:id', (req, res) => {
  const { content } = req.body || {};
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: '笔记内容不能为空' });
  }
  const info = db
    .prepare("UPDATE notes SET content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
    .run(String(content).trim(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: '笔记不存在' });
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- API: 生词本 ---------------- */
app.get('/api/papers/:id/words', (req, res) => {
  res.json(db.prepare('SELECT * FROM words WHERE paper_id = ? ORDER BY id DESC').all(req.params.id));
});

app.post('/api/papers/:id/words', (req, res) => {
  const { word, translation, phonetic } = req.body || {};
  if (!word || !String(word).trim()) {
    return res.status(400).json({ error: '单词不能为空' });
  }
  db.prepare('INSERT OR IGNORE INTO words (paper_id, word, phonetic, translation) VALUES (?, ?, ?, ?)')
    .run(req.params.id, String(word).trim().toLowerCase(), String(phonetic || '').trim(), String(translation || '').trim());
  res.json(db.prepare('SELECT * FROM words WHERE paper_id = ? ORDER BY id DESC').all(req.params.id));
});

app.delete('/api/words/:id', (req, res) => {
  db.prepare('DELETE FROM words WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`论文阅读助手后端已启动: http://localhost:${PORT}`);
});
