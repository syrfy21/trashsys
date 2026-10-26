const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const db = new Database('./trash.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const existing = db.prepare('SELECT id FROM users WHERE name = ?').get('أم');
if (!existing) db.prepare('INSERT INTO users (name, password, role) VALUES (?, ?, ?)').run('أم', '123456', 'admin');

const sessions = new Map();

function auth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'غير مصرح' });
  const t = h.slice(7);
  if (!sessions.has(t)) return res.status(401).json({ error: 'جلسة منتهية' });
  req.user = sessions.get(t);
  next();
}
function admin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'للمشرفة فقط' });
  next();
}

app.post('/api/auth/signup', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'أكمل البيانات' });
  try {
    db.prepare('INSERT INTO users (name, password, role) VALUES (?, ?, ?)').run(name, password, 'user');
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: 'اسم المستخدم موجود' }); }
});

app.post('/api/auth/login', (req, res) => {
  const { name, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!user || user.password !== password) return res.status(401).json({ error: 'بيانات خاطئة' });
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, { id: user.id, name: user.name, role: user.role });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) sessions.delete(h.slice(7));
  res.json({ ok: true });
});

app.get('/api/logs', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM logs ORDER BY id DESC').all());
});

app.post('/api/logs', auth, (req, res) => {
  const { user_name } = req.body;
  if (!user_name) return res.status(400).json({ error: 'اسم مطلوب' });
  const now = new Date().toLocaleString('ar-SA');
  db.prepare('INSERT INTO logs (user_name, created_at) VALUES (?, ?)').run(user_name, now);
  res.json({ ok: true });
});

app.delete('/api/logs/:id', auth, admin, (req, res) => {
  db.prepare('DELETE FROM logs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/logs', auth, admin, (req, res) => {
  db.prepare('DELETE FROM logs').run();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('http://localhost:' + PORT));
