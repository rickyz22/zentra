const mongoose = require('mongoose');
require('dotenv').config();

const clienteSchema = new mongoose.Schema({
    nombre: String,
    categoria: String,
    fechaIngreso: Date,
    proximoCobro: Date,
    historialPagos: Array
}, { strict: false });

const Cliente = mongoose.model('Cliente', clienteSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const clientes = await Cliente.find().sort({ _id: -1 }).limit(5);
        console.log('--- ÚLTIMOS 5 CLIENTES ---');
        clientes.forEach(c => {
            console.log(`ID: ${c._id}`);
            console.log(`Nombre: ${c.nombre}`);
            console.log(`Categoría: ${c.categoria}`);
            console.log(`FechaIngreso: ${c.fechaIngreso}`);
            console.log(`ProximoCobro: ${c.proximoCobro}`);
            console.log('---');
        });
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
