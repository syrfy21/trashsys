const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// التأكد من تقديم الملفات الثابتة من مجلد public
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// حل مشكلة Cannot GET / عن طريق توجيه الرابط الرئيسي لملف index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

const DB_FILE = './database.json';

// Database Logic (JSON based)
let data = { users: [], logs: [] };

if (fs.existsSync(DB_FILE)) {
  data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Seed Admin (using 'ام' without Hamza)
if (!data.users.find(u => u.name === 'ام')) {
  data.users.push({ id: 1, name: 'ام', password: '123456', role: 'admin' });
  saveDB();
}

// Middleware
const auth = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  req.user = sessions.get(token);
  next();
};

const sessions = new Map();

// Auth Routes
app.post('/api/auth/signup', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (data.users.find(u => u.name === name)) return res.status(400).json({ error: 'Username exists' });
  
  data.users.push({ id: Date.now(), name, password, role: 'user' });
  saveDB();
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const { name, password } = req.body;
  const user = data.users.find(u => u.name === name && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { id: user.id, name: user.name, role: user.role });
  res.json({ token, user: { name: user.name, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: { name: req.user.name, role: req.user.role } });
});

// Data Routes
app.get('/api/logs', auth, (req, res) => {
  res.json([...data.logs].reverse());
});

app.post('/api/logs', auth, (req, res) => {
  const { user_name } = req.body;
  if (!user_name) return res.status(400).json({ error: 'Missing user_name' });
  
  const newLog = {
    id: Date.now(),
    user_name,
    created_at: new Date().toLocaleString('ar-SA')
  };
  
  data.logs.unshift(newLog);
  saveDB();
  io.emit('logs_updated', data.logs);
  res.json({ ok: true });
});

app.delete('/api/logs/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const id = parseInt(req.params.id);
  data.logs = data.logs.filter(l => l.id !== id);
  saveDB();
  io.emit('logs_updated', data.logs);
  res.json({ ok: true });
});

app.delete('/api/logs', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  data.logs = [];
  saveDB();
  io.emit('logs_updated', data.logs);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Pro Server running on port ${PORT}`));
