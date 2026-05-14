const mongoose = require('mongoose');

const gananciaSchema = new mongoose.Schema({
    monto: { type: Number, required: true },
    descripcion: { type: String, required: true },
    fecha: { type: Date, default: Date.now },
    categoria: { type: String, default: 'General' },
    metodo: { type: String, default: 'Efectivo' }
}, { timestamps: true });

module.exports = mongoose.model('Ganancia', gananciaSchema);
