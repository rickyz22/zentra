require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const auth = require('./middleware/auth');
const clienteRoutes = require('./routes/clienteRoutes');
const authRoutes = require('./routes/authRoutes');
const agendaRoutes = require('./routes/agendaRoutes');
const templateRoutes = require('./routes/templateRoutes');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de Cache-Control para forzar actualizaciones (Cache Busting)
app.use((req, res, next) => {
    const url = req.url;
    // Forzar validación siempre para los archivos HTML principals
    if (url === '/' || url.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } else {
        // Otros activos (images, scripts versionados) se verifican siempre
        res.set('Cache-Control', 'public, max-age=0');
    }
    next();
});

app.use(express.static('public'));
app.use('/assets', express.static('assets'));

// Servir favicon directamente para evitar error 404 en navegadores
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, '../assets/logo.png')));

// Conexión a MongoDB (Usando variable de entorno para seguridad en producción)
const mongoURI = process.env.MONGODB_URI || "mongodb://admin_jony:jony1234@ac-ur15yb9-shard-00-00.rke4rvj.mongodb.net:27017,ac-ur15yb9-shard-00-01.rke4rvj.mongodb.net:27017,ac-ur15yb9-shard-00-02.rke4rvj.mongodb.net:27017/crm_jony?ssl=true&replicaSet=atlas-tocu41-shard-0&authSource=admin&retryWrites=true&w=majority";

// Configuración de Mongoose con opciones robustas
const mongooseOptions = {
    serverSelectionTimeoutMS: 5000,
    family: 4 // Forzar uso de IPv4
};

// Conexión a MongoDB
mongoose.connect(mongoURI, mongooseOptions)
    .then(async () => {
        console.log('✅ Conexión exitosa a MongoDB Atlas (CRM Jony)');
        await seedUser();
    })
    .catch(err => {
        console.error('❌ Error de conexión a MongoDB:', err.message);
        console.log('👉 TIP PARA JONY: Revisa que tu IP esté permitida en el Dashboard de Atlas.');
    });

// Función para crear el usuario inicial si no existe
async function seedUser() {
    try {
        const jony = await User.findOne({ username: 'jony' });
        if (!jony) {
            const hashedPassword = await bcrypt.hash('schornig22', 10);
            await User.create({
                username: 'jony',
                password: hashedPassword
            });
            console.log('👤 Usuario "jony" creado exitosamente.');
        } else {
            console.log('👤 Usuario "jony" verificado.');
        }
    } catch (error) {
        console.error('❌ Error al crear usuario inicial:', error);
    }
}

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.send('Servidor de Jony funcionando');
});

// Rutas de la API (prefijo /api)
console.log('📡 Registrando rutas...');
app.use('/api/auth', authRoutes);
app.use('/api/clientes', auth, clienteRoutes);
app.use('/api/agenda', auth, agendaRoutes);
app.use('/api/templates', auth, templateRoutes);
console.log('📡 Rutas registradas.');

// Iniciar servidor
app.listen(PORT, () => {
    console.log('-------------------------------------------');
    console.log('🚀 ZENTRA CRM V1.9.5 - MIGRACIÓN COMPLETADA');
    console.log(`📡 Servidor corriendo en http://localhost:${PORT}`);
    console.log('-------------------------------------------');
});
