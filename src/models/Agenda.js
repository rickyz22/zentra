const mongoose = require('mongoose');

const agendaSchema = new mongoose.Schema({
    titulo: {
        type: String,
        required: [true, 'El título del trámite es obligatorio']
    },
    fecha: {
        type: Date,
        required: [true, 'La fecha de vencimiento es obligatoria']
    },
    clienteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        required: false
    },
    mensajePredefinido: {
        type: String,
        default: 'Hola [Nombre], te recordamos que hoy vence tu trámite de [Trámite]. Saludos, Jony.'
    },
    honorarios: {
        type: Number,
        default: 0
    },
    tipo: {
        type: String,
        enum: ['Trámite', 'Cobro', 'personal', 'vencimiento'],
        default: 'Trámite'
    },
    // Campo faltante detectado en auditoría para filtros consistentes
    categoria: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// ÍNDICES PARA RENDIMIENTO (Audit Fix)
agendaSchema.index({ fecha: 1 });
agendaSchema.index({ clienteId: 1 });
agendaSchema.index({ categoria: 1 });

module.exports = mongoose.model('Agenda', agendaSchema);
