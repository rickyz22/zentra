const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const statsController = require('../controllers/statsController');
const pagosController = require('../controllers/pagosController');

// Rutas configuradas para /api/clientes
// El middleware 'auth' ya se aplica en index.js al montar el router

// --- CRUD CLIENTES ---
router.post('/', clienteController.crearCliente);
router.get('/', clienteController.obtenerClientes);
router.put('/:id', clienteController.actualizarCliente);
router.delete('/:id', clienteController.eliminarCliente);

// --- ESTADÍSTICAS ---
router.get('/stats', statsController.obtenerEstadisticas);

// --- PAGOS ---
router.post('/:id/pago', pagosController.registrarPago);
router.delete('/:id/pago/:pagoId', pagosController.eliminarPago);

// --- EXPORTACIÓN ---
router.get('/export', clienteController.exportarDatos);

module.exports = router;
