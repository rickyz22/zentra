const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const auth = require('../middleware/auth');

// Rutas configuradas para /api/clientes
router.post('/', auth, clienteController.crearCliente);
router.get('/', auth, clienteController.obtenerClientes);
router.get('/stats', auth, clienteController.obtenerEstadisticas);
router.get('/export', auth, clienteController.exportarDatos);
router.put('/:id', auth, clienteController.actualizarCliente);
router.post('/:id/pago', auth, clienteController.registrarPago);
router.delete('/:id/pago/:pagoId', auth, clienteController.eliminarPago);
router.delete('/:id', auth, clienteController.eliminarCliente);

module.exports = router;
