const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const auth = require('../middleware/auth');

// Rutas configuradas para /api/clientes
// El middleware 'auth' ya se aplica en index.js al montar el router
router.post('/', clienteController.crearCliente);
router.get('/', clienteController.obtenerClientes);
router.get('/stats', clienteController.obtenerEstadisticas);
router.get('/export', clienteController.exportarDatos);
router.put('/:id', clienteController.actualizarCliente);
router.post('/:id/pago', clienteController.registrarPago);
router.delete('/:id/pago/:pagoId', clienteController.eliminarPago);
router.delete('/:id', clienteController.eliminarCliente);

module.exports = router;
