const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Login de usuario
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ ok: false, msg: 'Usuario no encontrado' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ ok: false, msg: 'Contraseña incorrecta' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET || 'zentra_secret_fallback_2026',
            { expiresIn: '24h' }
        );

        res.json({
            ok: true,
            token,
            user: { username: user.username }
        });

    } catch (error) {
        console.error('Error en Login:', error);
        res.status(500).json({ ok: false, msg: 'Error: ' + error.message });
    }
});

module.exports = router;
