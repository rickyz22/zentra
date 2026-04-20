const mongoose = require('mongoose');
require('dotenv').config();

const clienteSchema = new mongoose.Schema({
    nombre: String,
    categoria: String,
    fechaIngreso: Date,
    proximoCobro: Date
}, { strict: false });

const Cliente = mongoose.model('Cliente', clienteSchema);

async function verify() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Simular lo que haría el controlador con la fecha de Jony
        const fechaParaUsar = "2026-03-20"; // Dato que llega del form
        const fechaIngresoDate = new Date(fechaParaUsar);
        const baseDateForCobro = fechaIngresoDate.getTime();
        const proximoCobroDate = new Date(baseDateForCobro + 31 * 24 * 60 * 60 * 1000);

        console.log('--- TEST LOGIC ---');
        console.log(`Input: ${fechaParaUsar}`);
        console.log(`Parsed fechaIngreso: ${fechaIngresoDate.toISOString()} (${fechaIngresoDate.toString()})`);
        console.log(`Calculated proximoCobro: ${proximoCobroDate.toISOString()} (${proximoCobroDate.toString()})`);
        
        const now = new Date();
        const diffMs = proximoCobroDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
        console.log(`Diff Days (ceil): ${diffDays}`);
        
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verify();
