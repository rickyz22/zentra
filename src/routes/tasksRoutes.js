const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasksController');

// Ruta protegida por secreto en Headers para disparar desde cron-job.org
router.post('/update-debts', tasksController.updateDebts);

module.exports = router;
