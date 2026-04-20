// Simulación de la lógica ACTUALIZADA de fetchAgenda y updateInicioMini
const allClientes = [
    {
        _id: '1',
        nombre: 'Juan Pérez',
        categoria: 'Préstamos',
        telefono: '12345678',
        proximoCobro: new Date().toISOString(), // HOY
        estado: 'Activo'
    }
];

function testLogic() {
    console.log('--- TEST: Nueva Lógica Dashboard (en-CA) ---');
    
    // 1. fetchAgenda
    const virtualAgendas = allClientes
        .filter(c => (c.categoria === 'Préstamos' || c.categoria === 'Electrodomésticos') && c.estado !== 'Cerrado' && c.estado !== 'Pagado' && c.proximoCobro)
        .map(c => {
            return {
                titulo: `Cobro: ${c.nombre} - ${c.categoria}`,
                fechaVencimiento: c.proximoCobro
            };
        });

    // 2. updateInicioMini
    const tz = 'America/Argentina/Buenos_Aires';
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    console.log(`Today String (en-CA): ${todayStr}`);

    const recsHoy = virtualAgendas.filter(r => {
        const rDate = new Date(r.fechaVencimiento).toLocaleDateString('en-CA', { timeZone: tz });
        console.log(`Comparing ${rDate} === ${todayStr}`);
        return rDate === todayStr;
    });

    console.log(`Tareas encontradas: ${recsHoy.length}`);
    if (recsHoy.length === 1 && recsHoy[0].titulo.includes(' - Préstamos')) {
        console.log('✅ ÉXITO: La lógica en-CA funciona y el formato de título es correcto.');
    } else {
        console.log('❌ ERROR: Falló la comparación o el formato.');
    }
}

testLogic();
