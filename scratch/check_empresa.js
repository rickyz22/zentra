require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Cliente = require('./src/models/Cliente');
    const clientes = await Cliente.find({}).select('nombre empresa categoria').lean();
    console.log('Clientes con empresa:');
    clientes.forEach(c => {
        if (c.empresa) console.log(`  ✅ ${c.nombre} → empresa: "${c.empresa}" (${c.categoria})`);
        else console.log(`  ⬜ ${c.nombre} → sin empresa`);
    });
    mongoose.disconnect();
}).catch(e => console.error('Error:', e.message));
