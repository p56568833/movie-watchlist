const { Router } = require('express');
const db = require('../db');
const { errMsg } = require('../middleware/auth');

const router = Router();

router.get('/lists', async (req, res) => {
  try {
    const lists = await db.getAllLists(req.userId);
    res.json(lists);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

router.post('/lists', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const list = await db.createList({ name: name.trim(), description, userId: req.userId });
    res.status(201).json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

router.put('/lists/:id', async (req, res) => {
  try {
    const list = await db.updateList(Number(req.params.id), req.body);
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errMsg(err, 'Failed to update list') });
  }
});

router.delete('/lists/:id', async (req, res) => {
  try {
    await db.deleteList(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: errMsg(err, 'Failed to delete list') });
  }
});

module.exports = router;
