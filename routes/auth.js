const { Router } = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: '用户名不能为空' });
    if (!password || password.length < 3) return res.status(400).json({ error: '密码至少3位' });

    const existing = await db.getUserByUsername(username.trim());
    if (existing) return res.status(409).json({ error: '用户名已存在' });

    const user = await db.createUser(username.trim(), password);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '注册失败' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });

    const user = await db.verifyLogin(username, password);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登录失败' });
  }
});

router.get('/me', (req, res) => {
  res.json(req.user);
});

module.exports = router;
