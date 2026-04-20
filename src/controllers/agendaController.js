const Agenda = require('../models/Agenda');

// Obtener todos los recordatorios con datos del cliente
exports.obtenerAgenda = async (req, res) => {
    try {
        const recordatorios = await Agenda.find().populate('clienteId').sort({ fecha: 1 });
        res.status(200).json({
            ok: true,
            count: recordatorios.length,
            recordatorios
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Error al obtener la agenda',
            error: error.message
        });
    }
};

// Crear un nuevo recordatorio
exports.crearAgenda = async (req, res) => {
    try {
        const data = { ...req.body };
        
        // Saneamiento definitivo: Si es personal, vencimiento o no viene cliente, forzamos null para Mongoose
        if (data.tipo === 'personal' || data.tipo === 'vencimiento' || !data.clienteId || data.clienteId === 'null' || data.clienteId === '') {
            data.clienteId = null;
        }

        const nuevoRecordatorio = new Agenda(data);
        const recordatorioGuardado = await nuevoRecordatorio.save();
        
        res.status(201).json({
            ok: true,
            msg: 'Recordatorio creado correctamente',
            recordatorio: recordatorioGuardado
        });
    } catch (error) {
        console.error('❌ ERROR CREAR AGENDA:', error);
        res.status(400).json({
            ok: false,
            error: error.message // Respuesta de error específica solicitada por Jony
        });
    }
};

// Eliminar un recordatorio
exports.eliminarAgenda = async (req, res) => {
    try {
        const id = req.params.id;
        await Agenda.findByIdAndDelete(id);
        res.status(200).json({ ok: true, msg: 'Recordatorio eliminado' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al eliminar' });
    }
};

// Limpiar trámites huérfanos (SOLO aquellos donde el cliente fue borrado, pero manteniendo los personales)
exports.limpiarHuerfanos = async (req, res) => {
    try {
        const Cliente = require('../models/Cliente');
        const clientesExistentes = await Cliente.find({}, '_id');
        const idsValidos = clientesExistentes.map(c => c._id);

        // Borrar items donde clienteId existe pero el cliente ya no está en la DB
        const result = await Agenda.deleteMany({
            clienteId: { $exists: true, $ne: null, $nin: idsValidos }
        });

        console.log(`🧹 Trámites de clientes eliminados limpiados: ${result.deletedCount}`);
        res.status(200).json({
            ok: true,
            msg: `${result.deletedCount} trámite(s) de clientes inexistentes eliminados.`,
            deleted: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error limpiando huérfanos', error: error.message });
    }
};
