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
    moneda: { type: String, enum: ['ARS', 'USD'], default: 'ARS' },
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
    operaciones: [{
        tipo: { type: String, enum: ['Préstamos', 'Trámites', 'Electrodomésticos'], required: true },
        estado: { type: String, enum: ['Activo', 'Cancelado', 'Moroso', 'Pagado', 'Pendiente', 'Cerrado'], default: 'Activo' },
        fechaAlta: { type: Date, default: Date.now },
        // Campos dinámicos
        montoPrestado: Number,
        montoDevolver: Number,
        costoCompra: Number,
        precioVenta: Number,
        producto: String,
        tramite: String,
        subTipoTramite: String,
        honorarios: Number,
        cuotasTotales: { type: Number, default: 1 },
        saldoPendiente: { type: Number, default: 0 },
        moneda: { type: String, enum: ['ARS', 'USD'], default: 'ARS' },
        historialPagos: [{
            monto: { type: Number, required: true },
            fecha: { type: Date, default: Date.now },
            metodo: String,
            nota: String
        }],
        fechaVencimiento: { type: Date }
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
