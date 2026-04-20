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
            values: ['Activo', 'Pendiente', 'Cerrado'],
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
        monto: Number,
        fecha: { type: Date, default: Date.now },
        metodo: String
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

module.exports = mongoose.model('Cliente', clienteSchema);
