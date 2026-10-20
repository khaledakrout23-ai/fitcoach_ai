// Discussion avec le coach IA
const router = require('express').Router();
const { ChatMessage, User } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { chatReply } = require('../services/coach');
const { hasAI } = require('../services/gemini');

router.use(auth, requireRole('SPORTIF'));

router.get(
  '/messages',
  ah(async (req, res) => {
    const messages = await ChatMessage.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'ASC'], ['id', 'ASC']], limit: 100 });
    res.json({ aiEnabled: hasAI(), messages });
  })
);

router.post(
  '/messages',
  ah(async (req, res) => {
    const content = String(req.body.content || '').trim().slice(0, 1000);
    if (!content) throw new HttpError(400, 'VALIDATION', 'Message vide.');
    const user = await User.findByPk(req.user.id);
    const history = await ChatMessage.findAll({ where: { userId: user.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 10 });
    const question = await ChatMessage.create({ userId: user.id, role: 'user', content });
    const reply = await chatReply({ user, history: history.reverse(), message: content, todayText: req.body.today || '' });
    const answer = await ChatMessage.create({ userId: user.id, role: 'assistant', content: reply.content, offline: reply.offline });
    res.status(201).json({ question, answer });
  })
);

router.delete(
  '/messages',
  ah(async (req, res) => {
    await ChatMessage.destroy({ where: { userId: req.user.id } });
    res.json({ ok: true });
  })
);

module.exports = router;
