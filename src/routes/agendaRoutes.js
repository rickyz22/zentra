const express = require('express');
const router = express.Router();
const agendaController = require('../controllers/agendaController');
const auth = require('../middleware/auth');

// Rutas configuradas para /api/agenda (todas protegidas)
router.get('/', auth, agendaController.obtenerAgenda);
router.get('/cleanup', auth, agendaController.limpiarHuerfanos);
router.post('/', auth, agendaController.crearAgenda);
router.delete('/:id', auth, agendaController.eliminarAgenda);

module.exports = router;
