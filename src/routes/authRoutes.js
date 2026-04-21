const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Login de usuario
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ ok: false, msg: 'Faltan credenciales' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET || 'secret_zentra_2026',
            { expiresIn: '24h' }
        );

        res.json({
            ok: true,
            token,
            user: { username: user.username }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
    }
});

module.exports = router;
