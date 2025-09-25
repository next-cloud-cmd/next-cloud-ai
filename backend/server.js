import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-production-secret-change-in-production';

// قاعدة البيانات الحقيقية
const db = new sqlite3.Database(':memory:'); // في الإنتاج سيتم تغييرها إلى PostgreSQL

// إنشاء الجداول
db.serialize(() => {
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE ai_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    accuracy REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'stopped',
    endpoint_url TEXT,
    api_key TEXT UNIQUE,
    requests_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(model_id) REFERENCES ai_models(id)
  )`);

  // إضافة مستخدم افتراضي للاختبار
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run("INSERT INTO users (email, password, name) VALUES (?, ?, ?)", 
    ["admin@nextcloudai.com", hashedPassword, "System Admin"]);
});

// Middleware الحماية
app.use(helmet());
app.use(cors());
app.use(express.json());

// معدل الطلبات
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100 // 100 طلب لكل IP
});
app.use(limiter);

// Middleware المصادقة
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'رمز الوصول مطلوب' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'رمز غير صالح' });
    }
    req.user = user;
    next();
  });
};

// Routes الحقيقية

// 1. المصادقة
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run("INSERT INTO users (email, password, name) VALUES (?, ?, ?)", 
      [email, hashedPassword, name], function(err) {
        if (err) {
          return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
        }

        const token = jwt.sign({ userId: this.lastID, email }, JWT_SECRET);
        res.status(201).json({
          message: 'تم إنشاء الحساب بنجاح',
          token,
          user: { id: this.lastID, email, name }
        });
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
      if (err || !user) {
        return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });
      }

      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET);
      res.json({
        message: 'تم الدخول بنجاح',
        token,
        user: { id: user.id, email: user.email, name: user.name }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

// 2. إدارة النماذج
app.get('/api/models', authenticateToken, (req, res) => {
  db.all("SELECT * FROM ai_models WHERE user_id = ?", [req.user.userId], (err, models) => {
    if (err) {
      return res.status(500).json({ error: 'خطأ في جلب النماذج' });
    }
    res.json({ models });
  });
});

app.post('/api/models', authenticateToken, (req, res) => {
  const { name, type, description } = req.body;
  
  if (!name || !type) {
    return res.status(400).json({ error: 'الاسم والنوع مطلوبان' });
  }

  db.run("INSERT INTO ai_models (user_id, name, type, description) VALUES (?, ?, ?, ?)",
    [req.user.userId, name, type, description], function(err) {
      if (err) {
        return res.status(500).json({ error: 'خطأ في إنشاء النموذج' });
      }

      res.status(201).json({
        message: 'تم إنشاء النموذج بنجاح',
        model: { id: this.lastID, name, type, description, status: 'draft' }
      });
  });
});

// 3. النشر
app.post('/api/deployments', authenticateToken, (req, res) => {
  const { model_id, name } = req.body;
  
  // إنشاء API key فريد
  const apiKey = 'ncai_' + require('crypto').randomBytes(16).toString('hex');
  const endpointUrl = `https://api.nextcloudai.com/v1/models/${model_id}`;

  db.run("INSERT INTO deployments (model_id, name, status, endpoint_url, api_key) VALUES (?, ?, ?, ?, ?)",
    [model_id, name, 'running', endpointUrl, apiKey], function(err) {
      if (err) {
        return res.status(500).json({ error: 'خطأ في النشر' });
      }

      res.status(201).json({
        message: 'تم النشر بنجاح',
        deployment: {
          id: this.lastID,
          model_id,
          name,
          status: 'running',
          endpoint_url: endpointUrl,
          api_key: apiKey
        }
      });
  });
});

// 4. الإحصائيات الحقيقية
app.get('/api/stats', authenticateToken, (req, res) => {
  const stats = {
    total_models: 0,
    running_deployments: 0,
    total_requests: 0,
    avg_response_time: 0
  };

  // إحصائيات النماذج
  db.get("SELECT COUNT(*) as count FROM ai_models WHERE user_id = ?", 
    [req.user.userId], (err, result) => {
      stats.total_models = result.count;

      // إحصائيات النشر
      db.get(`SELECT COUNT(*) as count FROM deployments d 
              JOIN ai_models m ON d.model_id = m.id 
              WHERE m.user_id = ? AND d.status = 'running'`, 
        [req.user.userId], (err, result) => {
          stats.running_deployments = result.count;

          res.json({ stats });
      });
  });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 Next Cloud AI Server running on port ${PORT}`);
  console.log(`📊 API Documentation: http://localhost:${PORT}/api`);
});
