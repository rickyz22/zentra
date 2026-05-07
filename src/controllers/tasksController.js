const Cliente = require('../models/Cliente');

exports.updateDebts = async (req, res) => {
    try {
        // Validación simple de clave secreta (opcional pero recomendada)
        const secretHeader = req.headers['x-cron-secret'];
        const validSecret = process.env.CRON_SECRET || 'Zentra2026CronJob';
        
        if (secretHeader !== validSecret) {
            console.warn('⚠️ Intento de ejecución de Cron Job no autorizado');
            return res.status(403).json({ ok: false, msg: 'No autorizado' });
        }

        console.log('🔄 Ejecutando Cron Job: Actualización de morosos...');

        const limiteMorosidad = new Date();
        limiteMorosidad.setDate(limiteMorosidad.getDate() - 10);
        limiteMorosidad.setHours(0, 0, 0, 0);

        const result = await Cliente.updateMany(
            {
                estado: { $nin: ['Cerrado', 'Pagado', 'Moroso'] },
                categoria: { $in: ['Préstamos', 'Electrodomésticos'] },
                proximoCobro: { $lt: limiteMorosidad }
            },
            {
                $set: { estado: 'Moroso' }
            }
        );

        console.log(`✅ Cron Job finalizado: ${result.modifiedCount} clientes marcados como morosos.`);
        
        res.status(200).json({ 
            ok: true, 
            msg: 'Actualización de deudas completada con éxito',
            modificados: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ Error en el Cron Job de actualización de deudas:', error);
        res.status(500).json({ ok: false, msg: 'Error interno en el servidor', error: error.message });
    }
};
