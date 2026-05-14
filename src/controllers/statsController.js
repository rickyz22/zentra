const Cliente = require('../models/Cliente');
const Agenda = require('../models/Agenda');

// Obtener estadísticas y recaudación corregida para GMT-3 (Argentina)
// Refactorizado para modularización (Audit v2)
exports.obtenerEstadisticas = async (req, res) => {
    try {
        // Ventanas de tiempo en Argentina (GMT-3)
        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
        const ahoraUTC = new Date();
        const ahoraAR  = new Date(ahoraUTC.getTime() - TZ_OFFSET_MS);

        const todayStart = new Date(Date.UTC(
            ahoraAR.getUTCFullYear(),
            ahoraAR.getUTCMonth(),
            ahoraAR.getUTCDate(),
            3, 0, 0, 0
        ));
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        const monthStart = new Date(Date.UTC(
            ahoraAR.getUTCFullYear(),
            ahoraAR.getUTCMonth(),
            1,
            3, 0, 0, 0
        ));

        // PARALELIZACIÓN DE QUERIES (Audit Fix)
        const [
            results,
            agendaFinance,
            clientesHoy,
            clientesMes,
            clientesConPagos,
            agendaTotalAgg,
            todosClientesTramites,
            todosPreEles,
            todaAgenda,
            todosTramites,
            todosPreElesGanancia
        ] = await Promise.all([
            Cliente.aggregate([{ $group: { _id: '$tramite', count: { $sum: 1 } } }]),
            Agenda.aggregate([
                {
                    $facet: {
                        hoy: [
                            { $match: { fecha: { $gte: todayStart, $lt: todayEnd }, honorarios: { $gt: 0 } } },
                            { $group: { _id: '$clienteId', total: { $sum: '$honorarios' } } }
                        ],
                        mes: [
                            { $match: { fecha: { $gte: monthStart }, honorarios: { $gt: 0 } } },
                            { $group: { _id: '$clienteId', total: { $sum: '$honorarios' } } }
                        ]
                    }
                }
            ]),
            Cliente.find({ honorarios: { $gt: 0 }, createdAt: { $gte: todayStart, $lt: todayEnd } }),
            Cliente.find({ honorarios: { $gt: 0 }, createdAt: { $gte: monthStart } }),
            Cliente.find({ 'operaciones.historialPagos.fecha': { $gte: monthStart } }),
            Agenda.aggregate([{ $group: { _id: '$clienteId', total: { $sum: '$honorarios' } } }]),
            Cliente.find({ $or: [{ categoria: 'Trámites' }, { categoria: { $exists: false } }] }),
            
            // Agregación de Operaciones
            // 3. Agregación de Operaciones (Híbrida: Raíz + Array)
            Cliente.aggregate([
                // Proyectamos una "operación virtual" desde la raíz si el array está vacío o no existe
                {
                    $project: {
                        ops: {
                            $cond: [
                                { $gt: [{ $size: { $ifNull: ['$operaciones', []] } }, 0] },
                                '$operaciones',
                                [{
                                    tipo: '$categoria',
                                    estado: '$estado',
                                    montoPrestado: '$montoPrestado',
                                    montoDevolver: '$montoDevolver',
                                    costoCompra: '$costoCompra',
                                    precioVenta: '$precioVenta',
                                    honorarios: '$honorarios',
                                    historialPagos: '$historialPagos',
                                    saldoPendiente: { $subtract: [{ $ifNull: ['$montoDevolver', '$precioVenta'] }, '$montoPagado'] }
                                }]
                            ]
                        }
                    }
                },
                { $unwind: '$ops' },
                { $match: { 'ops.tipo': { $in: ['Préstamos', 'Electrodomésticos'] } } },
                {
                    $project: {
                        tipo: '$ops.tipo',
                        costo: { $cond: [{ $eq: ['$ops.tipo', 'Préstamos'] }, { $ifNull: ['$ops.montoPrestado', 0] }, { $ifNull: ['$ops.costoCompra', 0] }] },
                        retorno: { $cond: [{ $eq: ['$ops.tipo', 'Préstamos'] }, { $ifNull: ['$ops.montoDevolver', 0] }, { $ifNull: ['$ops.precioVenta', 0] }] },
                        pago: { 
                            $reduce: {
                                input: { $ifNull: ['$ops.historialPagos', []] },
                                initialValue: 0,
                                in: { $add: ['$$value', '$$this.monto'] }
                            }
                        },
                        estado: { $ifNull: ['$ops.estado', 'Pendiente'] }
                    }
                },
                {
                    $project: {
                        tipo: 1,
                        cap: {
                            $cond: [
                                { $in: ['$estado', ['Cerrado', 'Pagado']] }, 0,
                                { $max: [0, { $subtract: ['$costo', '$pago'] }] }
                            ]
                        },
                        gPend: {
                            $cond: [
                                { $in: ['$estado', ['Cerrado', 'Pagado']] }, 0,
                                {
                                    $cond: [
                                        { $lte: ['$pago', '$costo'] },
                                        { $max: [0, { $subtract: ['$retorno', '$costo'] }] },
                                        { $max: [0, { $subtract: ['$retorno', '$pago'] }] }
                                    ]
                                }
                            ]
                        },
                        gReal: {
                            $cond: [
                                { $in: ['$estado', ['Cerrado', 'Pagado']] },
                                { $max: [0, { $subtract: ['$retorno', '$costo'] }] },
                                {
                                    $cond: [
                                        { $lte: ['$pago', '$costo'] }, 0,
                                        { $subtract: ['$pago', '$costo'] }
                                    ]
                                }
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: '$tipo',
                        capitalEnCalle: { $sum: '$cap' },
                        gananciaPendiente: { $sum: '$gPend' },
                        gananciaRealizada: { $sum: '$gReal' }
                    }
                }
            ]),
            
            Agenda.find({ honorarios: { $gt: 0 } }),
            // Todos los clientes para cálculos de trámites e historial (Híbrido)
            Cliente.find({})
        ]);

        const stats = {};
        // 4. Procesar Trámites y Cobros (Híbrido)
        const todosClientes = results[6];
        let honorariosRaizHoy = 0, honorariosRaizMes = 0, honorariosRaizTotal = 0;
        let pagosHistoricos = [];

        todosClientes.forEach(c => {
            // Honorarios en raíz
            if (c.categoria === 'Trámites' || !c.categoria) {
                const h = Number(c.honorarios) || 0;
                honorariosRaizTotal += h;
                const created = new Date(c.createdAt || c.fecha);
                if (created >= monthStart) {
                    honorariosRaizMes += h;
                    if (created >= todayStart && created < todayEnd) honorariosRaizHoy += h;
                }
            }
            // Pagos en raíz
            if (c.historialPagos) {
                c.historialPagos.forEach(p => {
                    pagosHistoricos.push({ ...p, tipo: c.categoria || 'Trámites' });
                });
            }
        });

        const agendaHoy = agendaFinance[0].hoy.reduce((s, x) => s + x.total, 0);
        const agendaMes = agendaFinance[0].mes.reduce((s, x) => s + x.total, 0);

        // 5. Flujo de Caja
        let pagosRegistradosHoy = 0;
        let pagosRegistradosMes = 0;
        let presHoy = 0, presMes = 0;
        let elecHoy = 0, elecMes = 0;

        todosClientes.forEach(c => {
            // Operaciones
            if (c.operaciones) {
                c.operaciones.forEach(op => {
                    if (op.historialPagos) {
                        op.historialPagos.forEach(p => {
                            const esHoy = p.fecha >= todayStart && p.fecha < todayEnd;
                            const esMes = p.fecha && p.fecha >= monthStart;
                            const monto = Number(p.monto) || 0;

                            if (esMes) {
                                pagosRegistradosMes += monto;
                                if (op.tipo === 'Préstamos') presMes += monto;
                                else if (op.tipo === 'Electrodomésticos') elecMes += monto;

                                if (esHoy) {
                                    pagosRegistradosHoy += monto;
                                    if (op.tipo === 'Préstamos') presHoy += monto;
                                    else if (op.tipo === 'Electrodomésticos') elecHoy += monto;
                                }
                            }
                        });
                    }
                });
            }
            // Pagos en raíz (Solo si no tiene operaciones, para evitar duplicar)
            if ((!c.operaciones || c.operaciones.length === 0) && c.historialPagos) {
                c.historialPagos.forEach(p => {
                    const esHoy = p.fecha >= todayStart && p.fecha < todayEnd;
                    const esMes = p.fecha && p.fecha >= monthStart;
                    const monto = Number(p.monto) || 0;
                    if (esMes) {
                        pagosRegistradosMes += monto;
                        if (c.categoria === 'Préstamos') presMes += monto;
                        else if (c.categoria === 'Electrodomésticos') elecMes += monto;
                        if (esHoy) {
                            pagosRegistradosHoy += monto;
                            if (c.categoria === 'Préstamos') presHoy += monto;
                            else if (c.categoria === 'Electrodomésticos') elecHoy += monto;
                        }
                    }
                });
            }
        });

        const tramitesRecaudacionHoy = agendaHoy + honorariosRaizHoy;
        const tramitesRecaudacionMes = agendaMes + honorariosRaizMes;

        const globalRecaudacionHoy = tramitesRecaudacionHoy + pagosRegistradosHoy;
        const globalRecaudacionMes = tramitesRecaudacionMes + pagosRegistradosMes;

        const agendaTotales = agendaTotalAgg.reduce((s, x) => s + (Number(x.total) || 0), 0);
        const gananciaHistoricaTramites = agendaTotales + honorariosRaizTotal;

        let mPrestamos = { recaudacionHoy: presHoy, recaudacionMes: presMes, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 };
        let mElectro = { recaudacionHoy: elecHoy, recaudacionMes: elecMes, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 };

        todosPreEles.forEach(grupo => {
            if (grupo._id === 'Préstamos') {
                mPrestamos.capitalEnCalle = Math.round(grupo.capitalEnCalle * 100) / 100;
                mPrestamos.gananciaPendiente = Math.round(grupo.gananciaPendiente * 100) / 100;
                mPrestamos.gananciaRealizada = Math.round(grupo.gananciaRealizada * 100) / 100;
            } else if (grupo._id === 'Electrodomésticos') {
                mElectro.capitalEnCalle = Math.round(grupo.capitalEnCalle * 100) / 100;
                mElectro.gananciaPendiente = Math.round(grupo.gananciaPendiente * 100) / 100;
                mElectro.gananciaRealizada = Math.round(grupo.gananciaRealizada * 100) / 100;
            }
        });

        const historialMap = {};
        const getMonthKey = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr);
            const localD = new Date(d.getTime() - (3 * 60 * 60 * 1000));
            return `${localD.getUTCFullYear()}-${(localD.getUTCMonth() + 1).toString().padStart(2, '0')}`;
        };

        const initMonth = (m) => {
            if (!historialMap[m]) historialMap[m] = { tramites: 0, prestamos: 0, electro: 0 };
        };

        // Historial Mensual Híbrido
        todaAgenda.forEach(a => {
            const mk = getMonthKey(a.fecha);
            if (mk) { initMonth(mk); historialMap[mk].tramites += (Number(a.honorarios) || 0); }
        });

        todosClientes.forEach(c => {
            // Trámites en raíz
            if (c.categoria === 'Trámites' || !c.categoria) {
                const mk = getMonthKey(c.createdAt || c.fecha);
                if (mk) { initMonth(mk); historialMap[mk].tramites += (Number(c.honorarios) || 0); }
            }

            // Operaciones
            if (c.operaciones && c.operaciones.length > 0) {
                c.operaciones.forEach(op => {
                    if (!op.historialPagos || op.historialPagos.length === 0) return;
                    const costo = op.tipo === 'Préstamos' ? (Number(op.montoPrestado) || 0) : (Number(op.costoCompra) || 0);
                    const pagosOrdenados = [...op.historialPagos].sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
                    let capitalRecuperado = 0;
                    
                    pagosOrdenados.forEach(p => {
                        const pagoFisico = Number(p.monto) || 0;
                        let gananciaNetaDelPago = 0;
                        if (capitalRecuperado < costo) {
                            const porcionCapital = Math.min(pagoFisico, costo - capitalRecuperado);
                            gananciaNetaDelPago = Math.max(0, pagoFisico - porcionCapital);
                            capitalRecuperado += porcionCapital;
                        } else {
                            gananciaNetaDelPago = pagoFisico;
                        }
                        if (gananciaNetaDelPago > 0) {
                            const mk = getMonthKey(p.fecha);
                            if (mk) {
                                initMonth(mk);
                                if (op.tipo === 'Préstamos') historialMap[mk].prestamos += gananciaNetaDelPago;
                                else historialMap[mk].electro += gananciaNetaDelPago;
                            }
                        }
                    });
                });
            } else if (c.historialPagos && c.historialPagos.length > 0) {
                // Pagos en raíz (Legacy)
                const costo = c.categoria === 'Préstamos' ? (Number(c.montoPrestado) || 0) : (Number(c.costoCompra) || 0);
                const pagosOrdenados = [...c.historialPagos].sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
                let capitalRecuperado = 0;
                pagosOrdenados.forEach(p => {
                    const pagoFisico = Number(p.monto) || 0;
                    let gananciaNetaDelPago = 0;
                    if (capitalRecuperado < costo) {
                        const porcionCapital = Math.min(pagoFisico, costo - capitalRecuperado);
                        gananciaNetaDelPago = Math.max(0, pagoFisico - porcionCapital);
                        capitalRecuperado += porcionCapital;
                    } else {
                        gananciaNetaDelPago = pagoFisico;
                    }
                    if (gananciaNetaDelPago > 0) {
                        const mk = getMonthKey(p.fecha);
                        if (mk) {
                            initMonth(mk);
                            if (c.categoria === 'Préstamos') historialMap[mk].prestamos += gananciaNetaDelPago;
                            else if (c.categoria === 'Electrodomésticos') historialMap[mk].electro += gananciaNetaDelPago;
                        }
                    }
                });
            }
        });

        // Formatear historial para el frontend
        const historialMensual = Object.entries(historialMap)
            .map(([id, valores]) => ({
                id,
                etiqueta: new Date(id + '-02').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
                total: valores.tramites + valores.prestamos + valores.electro,
                valores
            }))
            .sort((a, b) => b.id.localeCompare(a.id));

        res.status(200).json({
            ok: true,
            stats,
            global: { recaudacionHoy: globalRecaudacionHoy, recaudacionMes: globalRecaudacionMes },
            tramites: { recaudacionHoy: tramitesRecaudacionHoy, recaudacionMes: tramitesRecaudacionMes, gananciaHistorica: gananciaHistoricaTramites },
            prestamos: mPrestamos,
            electro: mElectro,
            historialMensual
        });
    } catch (error) {
        console.error('❌ ERROR STATS:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener estadísticas', error: error.message });
    }
};
