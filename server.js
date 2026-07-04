// ============================================================
// ПОЛНЫЙ SERVER.JS С SQLITE3 (АСИНХРОННЫЙ)
// ============================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const bcrypt = require('bcrypt');

['./uploads', './uploads/backgrounds', './db'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();
const PORT = process.env.PORT || 3000;

const db = new sqlite3.Database('./db/database.sqlite', (err) => {
  if (err) console.error('Ошибка БД:', err);
  else console.log('База данных подключена');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category_id INTEGER NOT NULL,
    image TEXT,
    description TEXT,
    avg_rating REAL DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )`);

  const defaultSettings = {
    about_text: 'Мы — команда энтузиастов, которые любят вкусные напитки.',
    contacts_address: 'г. Москва, ул. Примерная, д. 1',
    contacts_phone: '+7 (999) 123-45-67',
    contacts_email: 'info@drinkstore.ru',
    contacts_schedule: 'Пн-Пт 9:00–20:00',
    site_background: ''
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(defaultSettings).forEach(([key, val]) => insertSetting.run(key, val));

  const adminLogin = process.env.ADMIN_LOGIN || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const insertAdmin = db.prepare('INSERT OR IGNORE INTO admin (login, password) VALUES (?, ?)');
  insertAdmin.run(adminLogin, adminPass);
});

console.log('✅ База данных инициализирована');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir = './uploads';
    if (req.url.includes('background')) uploadDir = './uploads/backgrounds';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

function isAdmin(req) { return req.session && req.session.isAdmin; }
function isAuthenticated(req) { return req.session && req.session.userId; }
function isBlocked(userId, callback) {
  db.get('SELECT is_blocked FROM users WHERE id = ?', [userId], (err, row) => {
    callback(err, row ? row.is_blocked : 0);
  });
}

// ---------- API ----------

app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/products', (req, res) => {
  const { category, search, page = 1, limit = 12 } = req.query;
  let sql = 'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id';
  const params = [];
  const conditions = [];
  if (category && category !== 'all') {
    conditions.push('c.id = ?');
    params.push(category);
  }
  if (search && search.trim() !== '') {
    const words = search.trim().split(/\s+/).filter(w => w.length > 0);
    words.forEach(word => {
      conditions.push('(p.name LIKE ? COLLATE NOCASE OR p.description LIKE ? COLLATE NOCASE)');
      params.push('%' + word + '%', '%' + word + '%');
    });
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  const countSql = 'SELECT COUNT(*) as total FROM products p JOIN categories c ON p.category_id = c.id' + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '');
  db.get(countSql, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = countRow.total;
    const offset = (page - 1) * limit;
    sql += ' ORDER BY p.id DESC LIMIT ? OFFSET ?';
    db.all(sql, params.concat([limit, offset]), (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
    });
  });
});

app.get('/api/products/:id', (req, res) => {
  db.get('SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Товар не найден' });
    res.json(row);
  });
});

app.get('/api/products/:id/reviews', (req, res) => {
  db.all('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/products/:id/reviews', (req, res) => {
  const { user_name, rating, comment } = req.body;
  if (!user_name || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Заполните имя и рейтинг' });
  }
  db.run('INSERT INTO reviews (product_id, user_name, rating, comment) VALUES (?, ?, ?, ?)',
    [req.params.id, user_name, rating, comment || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT AVG(rating) as avg FROM reviews WHERE product_id = ?', [req.params.id], (err, avgRow) => {
        if (!err && avgRow && avgRow.avg !== null) {
          db.run('UPDATE products SET avg_rating = ? WHERE id = ?', [avgRow.avg, req.params.id]);
        }
      });
      res.json({ id: this.lastID });
    }
  );
});

app.get('/api/favorites', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  db.all('SELECT product_id FROM favorites WHERE user_id = ?', [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.product_id));
  });
});

app.post('/api/favorites', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'Не указан товар' });
  db.run('INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)', [req.session.userId, productId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/favorites/:productId', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  db.run('DELETE FROM favorites WHERE user_id = ? AND product_id = ?', [req.session.userId, req.params.productId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/news/latest', (req, res) => {
  db.all('SELECT * FROM news WHERE is_active = 1 ORDER BY created_at DESC LIMIT 3', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/settings', (req, res) => {
  db.all('SELECT key, value FROM settings', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  });
});

app.get('/api/notifications', (req, res) => {
  db.all('SELECT * FROM notifications WHERE is_read = 0 ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/notifications/read', (req, res) => {
  db.run('UPDATE notifications SET is_read = 1', (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/background', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['site_background'], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ background: row ? row.value : '' });
  });
});

// Аутентификация
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, login, password } = req.body;
  if (!firstName || !lastName || !login || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  db.get('SELECT id FROM users WHERE login = ?', [login], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(400).json({ error: 'Логин уже занят' });
    const hashed = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (first_name, last_name, login, password) VALUES (?, ?, ?, ?)',
      [firstName, lastName, login, hashed],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        req.session.userId = this.lastID;
        res.json({ success: true, userId: this.lastID });
      }
    );
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
  db.get('SELECT * FROM users WHERE login = ?', [login], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    if (user.is_blocked) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Неверный логин или пароль' });
    req.session.userId = user.id;
    res.json({ success: true, userId: user.id, firstName: user.first_name, lastName: user.last_name });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!isAuthenticated(req)) return res.json({ user: null });
  db.get('SELECT id, first_name, last_name, login FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) { req.session.destroy(); return res.json({ user: null }); }
    res.json({ user: row });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/auth/recover-login', (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: 'Введите имя и фамилию' });
  db.get('SELECT login FROM users WHERE first_name = ? AND last_name = ?', [firstName, lastName], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ login: row.login });
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { firstName, lastName, login, newPassword } = req.body;
  if (!firstName || !lastName || !login || !newPassword) return res.status(400).json({ error: 'Заполните все поля' });
  db.get('SELECT id FROM users WHERE first_name = ? AND last_name = ? AND login = ?', [firstName, lastName, login], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
    const hashed = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, row.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.get('/api/cart', (req, res) => res.json(req.session.cart || []));

app.post('/api/cart', (req, res) => {
  const { productId, quantity } = req.body;
  let cart = req.session.cart || [];
  db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
    if (err || !product) return res.status(404).json({ error: 'Товар не найден' });
    const existing = cart.find(item => item.productId === productId);
    if (existing) {
      existing.quantity = quantity > 0 ? quantity : existing.quantity;
      if (quantity <= 0) cart = cart.filter(item => item.productId !== productId);
    } else if (quantity > 0) cart.push({ productId, quantity });
    req.session.cart = cart;
    res.json(cart);
  });
});

app.delete('/api/cart/:id', (req, res) => {
  const id = parseInt(req.params.id);
  let cart = req.session.cart || [];
  cart = cart.filter(item => item.productId !== id);
  req.session.cart = cart;
  res.json(cart);
});

app.post('/api/orders', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  isBlocked(req.session.userId, (err, blocked) => {
    if (err) return res.status(500).json({ error: err.message });
    if (blocked) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    const cart = req.session.cart || [];
    if (cart.length === 0) return res.status(400).json({ error: 'Корзина пуста' });
    const ids = cart.map(item => item.productId);
    const placeholders = ids.map(() => '?').join(',');
    db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, ids, (err, products) => {
      if (err) return res.status(500).json({ error: err.message });
      const productMap = {};
      products.forEach(p => productMap[p.id] = p);
      let total = 0;
      const orderItems = cart.map(item => {
        const product = productMap[item.productId];
        const price = product ? product.price : 0;
        total += price * item.quantity;
        return { productId: item.productId, name: product ? product.name : 'Неизвестно', price, quantity: item.quantity };
      });
      db.run('INSERT INTO orders (user_id, items, total, status) VALUES (?, ?, ?, ?)',
        [req.session.userId, JSON.stringify(orderItems), total, 'pending'],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          req.session.cart = [];
          res.json({ orderId: this.lastID, total, message: 'Заказ создан' });
        }
      );
    });
  });
});

app.get('/api/orders/history', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  db.all('SELECT * FROM orders WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC', [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/orders/history', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  db.run('UPDATE orders SET is_deleted = 1 WHERE user_id = ?', [req.session.userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// Админ
app.put('/api/admin/settings', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const updates = req.body;
  const queries = Object.entries(updates).map(([key, value]) => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  Promise.all(queries)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/login', (req, res) => {
  const { login, password } = req.body;
  db.get('SELECT * FROM admin WHERE login = ? AND password = ?', [login, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Неверный логин или пароль' });
    req.session.isAdmin = true;
    res.json({ success: true });
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

app.get('/api/admin/products', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.all('SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/products', upload.single('image'), (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { name, price, category_id, imageUrl, description } = req.body;
  let image = '';
  if (req.file) image = '/uploads/' + req.file.filename;
  else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
  if (!name || !price || !category_id) return res.status(400).json({ error: 'Заполните все поля' });
  db.run(
    'INSERT INTO products (name, price, category_id, image, description) VALUES (?, ?, ?, ?, ?)',
    [name, parseFloat(price), category_id, image, description || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run('INSERT INTO notifications (message) VALUES (?)', ['Добавлен новый товар: ' + name]);
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/admin/products/:id', upload.single('image'), (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const id = req.params.id;
  const { name, price, category_id, imageUrl, description } = req.body;
  let image = '';
  if (req.file) image = '/uploads/' + req.file.filename;
  else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
  else image = '';
  db.run(
    'UPDATE products SET name = ?, price = ?, category_id = ?, image = ?, description = ? WHERE id = ?',
    [name, parseFloat(price), category_id, image, description || '', id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Товар не найден' });
      res.json({ success: true });
    }
  );
});

app.delete('/api/admin/products/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Товар не найден' });
    res.json({ success: true });
  });
});

app.get('/api/admin/categories', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.all('SELECT * FROM categories ORDER BY name', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/categories', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Введите название категории' });
  db.run('INSERT INTO categories (name) VALUES (?)', [name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.put('/api/admin/categories/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Введите название категории' });
  db.run('UPDATE categories SET name = ? WHERE id = ?', [name, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Категория не найдена' });
    res.json({ success: true });
  });
});

app.delete('/api/admin/categories/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Категория не найдена' });
    res.json({ success: true });
  });
});

app.get('/api/admin/users', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.all('SELECT id, first_name, last_name, login, is_blocked, created_at FROM users ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/admin/users/:id/block', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { block } = req.body;
  db.run('UPDATE users SET is_blocked = ? WHERE id = ?', [block ? 1 : 0, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ success: true });
  });
});

app.delete('/api/admin/users/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ success: true });
  });
});

app.get('/api/admin/news', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.all('SELECT * FROM news ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/news', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { title, content, is_active } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Заполните заголовок и текст' });
  db.run('INSERT INTO news (title, content, is_active) VALUES (?, ?, ?)', [title, content, is_active || 1], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.put('/api/admin/news/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { title, content, is_active } = req.body;
  db.run('UPDATE news SET title = ?, content = ?, is_active = ? WHERE id = ?', [title, content, is_active, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Новость не найдена' });
    res.json({ success: true });
  });
});

app.delete('/api/admin/news/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.run('DELETE FROM news WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Новость не найдена' });
    res.json({ success: true });
  });
});

app.get('/api/admin/orders', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  db.all(
    `SELECT orders.*, users.first_name, users.last_name, users.login 
     FROM orders 
     JOIN users ON orders.user_id = users.id 
     ORDER BY orders.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.put('/api/admin/orders/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Укажите статус' });
  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Заказ не найден' });
    res.json({ success: true });
  });
});

app.post('/api/admin/upload-background', upload.single('background'), (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const filePath = '/uploads/backgrounds/' + req.file.filename;
  db.run('UPDATE settings SET value = ? WHERE key = ?', [filePath, 'site_background'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, path: filePath });
  });
});

app.put('/api/admin/background', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { url } = req.body;
  db.run('UPDATE settings SET value = ? WHERE key = ?', [url || '', 'site_background'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});