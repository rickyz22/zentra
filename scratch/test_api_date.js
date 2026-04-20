async function test() {
    try {
        // First login to get token
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'jony',
                password: '123'
            })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;

        const dateStr = '2026-03-20';
        console.log(`Testing with fechaIngreso: ${dateStr}`);
        
        const res = await fetch('http://localhost:3000/api/clientes', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                nombre: 'Test API Date',
                categoria: 'Préstamos',
                montoPrestado: 1000,
                montoDevolver: 1300,
                fechaIngreso: dateStr
            })
        });

        const data = await res.json();
        console.log('Success:', data.ok);
        console.log('Cliente Guardado:', JSON.stringify(data.cliente, null, 2));

        if (data.cliente) {
            // Let's check the date math
            const fechaIngreso = new Date(data.cliente.fechaIngreso);
            const proximoCobro = new Date(data.cliente.proximoCobro);
            const diffDays = Math.round((proximoCobro - fechaIngreso) / (1000 * 60 * 60 * 24));
            
            console.log(`Diff days: ${diffDays}`);
            
            if (diffDays >= 30 && diffDays <= 32) {
                console.log('✅ Date math is correct (approx 31 days from fechaIngreso)');
            } else {
                console.log('❌ Date math is WRONG (should be 31 days from fechaIngreso)');
            }
        } else {
            console.log('❌ Error: Cliente not returned', data);
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
