const express = require('express');
const router  = express.Router();
const Menu    = require('../models/Menu');

router.get('/', async (req, res) => {
  const items = await Menu.find().sort('category name');
  res.json({ success: true, items });
});

router.post('/', async (req, res) => {
  const item = new Menu(req.body);
  await item.save();
  res.json({ success: true, item });
});

router.put('/:id', async (req, res) => {
  const item = await Menu.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, item });
});

router.delete('/:id', async (req, res) => {
  await Menu.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Quick available toggle
// PUT /api/menu/:id/toggle
router.put('/:id/toggle', async (req, res) => {
  const item = await Menu.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
  item.available = !item.available;
  await item.save();
  res.json({ success: true, item });
});

// Update stock quantity and threshold
// PUT /api/menu/:id/stock  { stockQty, stockThreshold }
router.put('/:id/stock', async (req, res) => {
  const { stockQty, stockThreshold } = req.body;
  const update = {};
  if (stockQty       !== undefined) update.stockQty       = stockQty === null ? null : Number(stockQty);
  if (stockThreshold !== undefined) update.stockThreshold = Number(stockThreshold) || 5;
  const item = await Menu.findByIdAndUpdate(req.params.id, update, { new: true });
  res.json({ success: true, item });
});

// Get low-stock items
// GET /api/menu/low-stock
router.get('/low-stock', async (req, res) => {
  const items    = await Menu.find({ stockQty: { $ne: null } });
  const lowStock = items.filter(i => i.stockQty !== null && i.stockQty <= i.stockThreshold);
  res.json({ success: true, items: lowStock });
});

// Seed default menu
router.post('/seed', async (req, res) => {
  const defaultItems = [
    { name: 'Mutton (Bone-in)',    category: 'mutton',  price: 650, unit: 'kg',   description: 'Fresh farm mutton with bone',      stockQty: 20 },
    { name: 'Mutton (Boneless)',   category: 'mutton',  price: 800, unit: 'kg',   description: 'Premium boneless mutton',          stockQty: 15 },
    { name: 'Mutton Keema',        category: 'mutton',  price: 700, unit: 'kg',   description: 'Fresh minced mutton',              stockQty: 10 },
    { name: 'Mutton Liver',        category: 'mutton',  price: 400, unit: 'kg',   description: 'Fresh mutton liver',               stockQty: 8  },
    { name: 'Chicken (Full)',      category: 'chicken', price: 180, unit: 'kg',   description: 'Whole farm fresh chicken',         stockQty: 30 },
    { name: 'Chicken Boneless',    category: 'chicken', price: 280, unit: 'kg',   description: 'Fresh boneless chicken',           stockQty: 25 },
    { name: 'Chicken Breast',      category: 'chicken', price: 320, unit: 'kg',   description: 'Skinless chicken breast',          stockQty: 20 },
    { name: 'Chicken Legs (4pcs)', category: 'chicken', price: 220, unit: 'pack', description: 'Fresh chicken leg quarters',       stockQty: 15 },
    { name: 'Country Chicken',     category: 'special', price: 400, unit: 'kg',   description: 'Organic country chicken (Nattu Kozhi)', stockQty: 10 },
  ];
  await Menu.deleteMany({});
  await Menu.insertMany(defaultItems);
  res.json({ success: true, message: 'Menu seeded!', count: defaultItems.length });
});

module.exports = router;