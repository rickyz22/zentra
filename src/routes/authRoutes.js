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
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
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

// Cambiar contraseña
router.post('/change-password', async (req, res) => {
    try {
        const { username, oldPassword, newPassword } = req.body;

        if (!username || !oldPassword || !newPassword) {
            return res.status(400).json({ ok: false, msg: 'Faltan datos requeridos' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ ok: false, msg: 'La contraseña actual es incorrecta' });
        }

        // Hashear nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        await user.save();

        res.json({ ok: true, msg: 'Contraseña actualizada exitosamente. Todas las sesiones anteriores han sido invalidadas.' });
    } catch (error) {
        console.error('❌ Error cambiando contraseña:', error);
        res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
    }
});

module.exports = router;
