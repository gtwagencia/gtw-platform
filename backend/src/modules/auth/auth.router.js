'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const svc = require('./auth.service');

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, orgName } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email e password são obrigatórios' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 8 caracteres' });
    }
    const data = await svc.register({ name, email, password, orgName });
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email e password são obrigatórios' });
    }
    const data = await svc.login({ email, password });
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const data = await svc.refresh(refreshToken);
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await svc.logout(refreshToken);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await svc.me(req.user.sub);
    res.json(user);
  } catch (err) { next(err); }
});

router.put('/me/profile', authenticate, async (req, res, next) => {
  try {
    const { name, avatarUrl } = req.body;
    const user = await svc.updateProfile(req.user.sub, { name, avatarUrl });
    res.json(user);
  } catch (err) { next(err); }
});

router.put('/me/password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword e newPassword obrigatórios' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nova senha deve ter ao menos 8 caracteres' });
    }
    await svc.changePassword(req.user.sub, { currentPassword, newPassword });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
