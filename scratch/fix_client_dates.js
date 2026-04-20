require('dotenv').config();
const mongoose = require('mongoose');

// Definir el esquema mínimamente para no cargar todo el modelo
const ClienteSchema = new mongoose.Schema({
    nombre: String,
    proximoCobro: Date
}, { strict: false });

const Cliente = mongoose.model('Cliente', ClienteSchema);

async function fixDates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB para reparación de fechas.');

        const clientes = await Cliente.find({ proximoCobro: { $exists: true } });
        console.log(`Analizando ${clientes.length} clientes...`);

        let actualizados = 0;
        for (const cliente of clientes) {
            if (!cliente.proximoCobro) continue;

            const date = new Date(cliente.proximoCobro);
            const hours = date.getUTCHours();
            
            // Si la hora es 00:00 UTC, en Argentina es 21:00 del día anterior.
            // Queremos que sea el mediodía del día 20 (si era 20-03 -> 20-04).
            
            // Lógica simple: Forzar a las 12:00:00 UTC (que es 09:00 AM en AR) 
            // O mejor: 15:00 UTC (12:00 PM AR).
            
            const originalISO = date.toISOString();
            
            // Forzamos la hora a las 15:00:00.000 UTC
            date.setUTCHours(15, 0, 0, 0); 
            
            const nuevaISO = date.toISOString();

            if (originalISO !== nuevaISO) {
                cliente.proximoCobro = date;
                await cliente.save();
                actualizados++;
                console.log(`[FIX] ${cliente.nombre}: ${originalISO} -> ${nuevaISO}`);
            }
        }

        console.log(`--- REPARACIÓN COMPLETADA ---`);
        console.log(`Total actualizados: ${actualizados}`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error en la reparación:', err);
        process.exit(1);
    }
}

fixDates();
