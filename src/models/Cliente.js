const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre completo es obligatorio']
    },
    telefono: {
        type: String,
        required: [true, 'El teléfono/WhatsApp es obligatorio']
    },
    dni: {
        type: String,
        default: ''
    },
    direccion: {
        type: String,
        default: ''
    },
    garante: {
        type: String,
        default: ''
    },
    legajoToyota: {
        type: String,
        default: ''
    },
    subTipoTramite: {
        type: String,
        required: false
    },
    empresa: {
        type: String,
        required: false
    },

    estado: {
        type: String,
        enum: {
            values: ['Activo', 'Pendiente', 'Cerrado', 'Moroso', 'Pagado'],
            message: '{VALUE} no es un estado válido'
        },
        default: 'Pendiente'
    },
    honorarios: {
        type: Number,
        default: 0
    },
    notas: {
        type: String,
        required: false
    },
    promesaPago: {
        type: String,
        required: false
    },
    categoria: {
        type: String,
        enum: {
            values: ['Trámites', 'Préstamos', 'Electrodomésticos'],
            message: '{VALUE} no es una categoría válida'
        },
        default: 'Trámites'
    },
    producto: {
        type: String,
        required: false
    },
    montoPrestado: { type: Number, default: 0 },
    montoDevolver: { type: Number, default: 0 },
    costoCompra: { type: Number, default: 0 },
    precioVenta: { type: Number, default: 0 },
    cuotasTotales: { type: Number, default: 1 },
    pagosRegistrados: { type: Number, default: 0 },
    montoPagado: { type: Number, default: 0 },
    ultimoPago: { type: Date },
    proximoCobro: { type: Date },
    historialPagos: [{
        monto: { type: Number, required: true },
        fecha: { type: Date, default: Date.now },
        metodo: String,
        nota: String
    }],
    prestamos: [{
        montoPrestado: { type: Number, required: true },
        montoDevolver: { type: Number, required: true },
        saldoPendiente: { type: Number, required: true },
        fechaAlta: { type: Date, default: Date.now },
        estado: { type: String, enum: ['Activo', 'Cancelado', 'Moroso'], default: 'Activo' },
        historialPagos: [{
            monto: { type: Number, required: true },
            fecha: { type: Date, default: Date.now },
            metodo: String,
            nota: String
        }]
    }],
    fechaIngreso: {
        type: Date,
        default: Date.now
    },
    fecha: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ÍNDICES PARA RENDIMIENTO (Audit Fix)
clienteSchema.index({ categoria: 1, estado: 1, createdAt: -1 });
clienteSchema.index({ honorarios: 1, createdAt: -1 });
clienteSchema.index({ fecha: -1 });

module.exports = mongoose.model('Cliente', clienteSchema);
