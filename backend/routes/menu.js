const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');

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

// Seed default menu
router.post('/seed', async (req, res) => {
  const defaultItems = [
    { name: 'Mutton (Bone-in)', category: 'mutton', price: 650, unit: 'kg', description: 'Fresh farm mutton with bone' },
    { name: 'Mutton (Boneless)', category: 'mutton', price: 800, unit: 'kg', description: 'Premium boneless mutton' },
    { name: 'Mutton Keema', category: 'mutton', price: 700, unit: 'kg', description: 'Fresh minced mutton' },
    { name: 'Mutton Liver', category: 'mutton', price: 400, unit: 'kg', description: 'Fresh mutton liver' },
    { name: 'Chicken (Full)', category: 'chicken', price: 180, unit: 'kg', description: 'Whole farm fresh chicken' },
    { name: 'Chicken Boneless', category: 'chicken', price: 280, unit: 'kg', description: 'Fresh boneless chicken' },
    { name: 'Chicken Breast', category: 'chicken', price: 320, unit: 'kg', description: 'Skinless chicken breast' },
    { name: 'Chicken Legs (4pcs)', category: 'chicken', price: 220, unit: 'pack', description: 'Fresh chicken leg quarters' },
    { name: 'Country Chicken', category: 'special', price: 400, unit: 'kg', description: 'Organic country chicken (Nattu Kozhi)' },
  ];

  await Menu.deleteMany({});
  await Menu.insertMany(defaultItems);
  res.json({ success: true, message: 'Menu seeded!', count: defaultItems.length });
});

module.exports = router;