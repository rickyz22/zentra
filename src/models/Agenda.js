const mongoose = require('mongoose');

const agendaSchema = new mongoose.Schema({
    titulo: {
        type: String,
        required: [true, 'El título del trámite es obligatorio']
    },
    fechaVencimiento: {
        type: Date,
        required: [true, 'La fecha de vencimiento es obligatoria']
    },
    clienteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        required: [true, 'Debe seleccionar un cliente para este vencimiento']
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
        enum: ['Trámite', 'Cobro'],
        default: 'Trámite'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Agenda', agendaSchema);
