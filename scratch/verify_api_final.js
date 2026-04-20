async function verifyFinal() {
    try {
        // 1. Login
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'jony', password: 'schornig22' })
        });
        const { token } = await loginRes.json();
        if (!token) throw new Error('No se pudo obtener el token');

        // 2. Crear Cliente con fecha específica
        const nombreTest = "Prueba Persistencia " + Date.now();
        const fechaTest = "2026-03-20";
        
        console.log(`--- CREANDO CLIENTE: ${nombreTest} con fecha ${fechaTest} ---`);
        const createRes = await fetch('http://localhost:3000/api/clientes', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                nombre: nombreTest,
                telefono: "12345678",
                categoria: "Préstamos",
                montoPrestado: 1000,
                montoDevolver: 1300,
                fechaIngreso: fechaTest
            })
        });

        const createData = await createRes.json();
        if (!createData.ok) throw new Error('Error al crear cliente: ' + createData.msg);
        
        const c = createData.cliente;
        console.log('Cliente Devuelto por POST:');
        console.log(`  _id: ${c._id}`);
        console.log(`  fechaIngreso: ${c.fechaIngreso} (${typeof c.fechaIngreso})`);
        console.log(`  proximoCobro: ${c.proximoCobro}`);

        // 3. Obtener Clientes (GET)
        console.log('--- BUSCANDO EN LISTA GENERAL (GET) ---');
        const getRes = await fetch('http://localhost:3000/api/clientes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const getData = await getRes.json();
        const found = getData.clientes.find(cl => cl._id === c._id);
        
        if (found) {
            console.log('Cliente Encontrado en GET:');
            console.log(`  fechaIngreso: ${found.fechaIngreso}`);
        } else {
            console.log('❌ ERROR: Cliente no encontrado en la lista general.');
        }

        if (c.fechaIngreso && c.fechaIngreso.startsWith('2026-03-20')) {
            console.log('✅ ÉXITO: fechaIngreso persistida correctamente.');
        } else {
            console.log('❌ ERROR: fechaIngreso NO coincide con el valor enviado.');
        }

        process.exit();
    } catch (err) {
        console.error('❌ ERROR FATAL:', err.message);
        process.exit(1);
    }
}

verifyFinal();
