// Simulación de la lógica de fetchAgenda y updateInicioMini
const allClientes = [
    {
        _id: '1',
        nombre: 'Juan Pérez',
        categoria: 'Préstamos',
        telefono: '12345678',
        proximoCobro: new Date().toISOString(), // HOY
        estado: 'Activo'
    },
    {
        _id: '2',
        nombre: 'Maria Lopez',
        categoria: 'Electrodomésticos',
        telefono: '87654321',
        proximoCobro: '2026-05-20', // MAÑANA (o futuro)
        estado: 'Activo'
    }
];

function testLogic() {
    console.log('--- TEST: Detección de Cobros de Hoy ---');
    
    // 1. Simular logic de fetchAgenda (Virtual Agendas)
    const virtualAgendas = allClientes
        .filter(c => (c.categoria === 'Préstamos' || c.categoria === 'Electrodomésticos') && c.estado !== 'Cerrado' && c.estado !== 'Pagado' && c.proximoCobro)
        .map(c => {
            return {
                _id: 'virtual_' + c._id,
                titulo: `Cobro: ${c.nombre}`,
                fechaVencimiento: c.proximoCobro,
                tipo: 'Cobro Virtual',
                clienteId: c,
                categoria: c.categoria,
                telefono: c.telefono
            };
        });

    console.log(`Total Virtual Agendas creadas: ${virtualAgendas.length}`);

    // 2. Simular filtrado por hoy de updateInicioMini
    const todayStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year:'numeric' });
    console.log(`Fecha de Hoy detectada: ${todayStr}`);

    const recsHoy = virtualAgendas.filter(r => {
        const rDate = new Date(r.fechaVencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year:'numeric' });
        return rDate === todayStr;
    });

    console.log(`Tareas encontradas para HOY: ${recsHoy.length}`);
    recsHoy.forEach(r => {
        console.log(` - Tarea: ${r.titulo} (${r.categoria})`);
    });

    if (recsHoy.length === 1 && recsHoy[0].clienteId.nombre === 'Juan Pérez') {
        console.log('✅ ÉXITO: El filtro de fecha detectó correctamente al cliente de hoy.');
    } else {
        console.log('❌ ERROR: Problema en la detección de fechas.');
    }
}

testLogic();
