const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === '23hp1a0548@gmail.com' && password === 'Mahesh@2005') {
    return res.json({ success: true, token: 'freshmeat-admin-token-12345' });
  }
  res.status(401).json({ success: false, message: 'Invalid email or password' });
});

module.exports = router;