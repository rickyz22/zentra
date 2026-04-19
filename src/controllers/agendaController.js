const Agenda = require('../models/Agenda');

// Obtener todos los recordatorios con datos del cliente
exports.obtenerAgenda = async (req, res) => {
    try {
        const recordatorios = await Agenda.find().populate('clienteId').sort({ fechaVencimiento: 1 });
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
        const nuevoRecordatorio = new Agenda(req.body);
        const recordatorioGuardado = await nuevoRecordatorio.save();
        res.status(201).json({
            ok: true,
            msg: 'Recordatorio creado correctamente',
            recordatorio: recordatorioGuardado
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            msg: 'Error al crear el recordatorio',
            error: error.message
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

// Limpiar trámites huérfanos (clienteId que ya no existe en Clientes)
exports.limpiarHuerfanos = async (req, res) => {
    try {
        const Cliente = require('../models/Cliente');
        // Obtener todos los IDs de clientes existentes
        const clientesExistentes = await Cliente.find({}, '_id');
        const idsValidos = clientesExistentes.map(c => c._id);

        // Borrar items donde clienteId es null o no está en la lista de IDs válidos
        const result = await Agenda.deleteMany({
            $or: [
                { clienteId: null },
                { clienteId: { $exists: false } },
                { clienteId: { $nin: idsValidos } }
            ]
        });

        console.log(`🧹 Trámites huérfanos eliminados: ${result.deletedCount}`);
        res.status(200).json({
            ok: true,
            msg: `${result.deletedCount} trámite(s) huérfano(s) eliminados.`,
            deleted: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error limpiando huérfanos', error: error.message });
    }
};
