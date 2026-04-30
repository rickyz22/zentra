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
            Cliente.find({ 'historialPagos.fecha': { $gte: monthStart } }),
            Agenda.aggregate([{ $group: { _id: '$clienteId', total: { $sum: '$honorarios' } } }]),
            Cliente.find({ $or: [{ categoria: 'Trámites' }, { categoria: { $exists: false } }] }),
            Cliente.find({ categoria: { $in: ['Préstamos', 'Electrodomésticos'] } }),
            Agenda.find({ honorarios: { $gt: 0 } }),
            Cliente.find({ honorarios: { $gt: 0 } }),
            Cliente.find({ categoria: { $in: ['Préstamos', 'Electrodomésticos'] } })
        ]);

        const stats = {};
        results.forEach(item => { if (item._id) stats[item._id] = item.count; });

        // Clientes que ya están cubiertos por la agenda
        const clientesEnAgendaHoy = new Set(
            agendaFinance[0].hoy.map(x => x._id ? x._id.toString() : null).filter(Boolean)
        );
        const clientesEnAgendaMes = new Set(
            agendaFinance[0].mes.map(x => x._id ? x._id.toString() : null).filter(Boolean)
        );

        const agendaHoy = agendaFinance[0].hoy.reduce((s, x) => s + x.total, 0);
        const agendaMes = agendaFinance[0].mes.reduce((s, x) => s + x.total, 0);

        const clientesHoyExtra = clientesHoy
            .filter(c => !clientesEnAgendaHoy.has(c._id.toString()))
            .reduce((s, c) => s + (c.honorarios || 0), 0);

        const clientesMesExtra = clientesMes
            .filter(c => !clientesEnAgendaMes.has(c._id.toString()))
            .reduce((s, c) => s + (c.honorarios || 0), 0);

        // 5. NUEVO: Flujo de Caja
        let pagosRegistradosHoy = 0;
        let pagosRegistradosMes = 0;
        let presHoy = 0, presMes = 0;
        let elecHoy = 0, elecMes = 0;

        clientesConPagos.forEach(c => {
            if (c.historialPagos) {
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

        const tramitesRecaudacionHoy = agendaHoy + clientesHoyExtra;
        const tramitesRecaudacionMes = agendaMes + clientesMesExtra;

        const globalRecaudacionHoy = tramitesRecaudacionHoy + pagosRegistradosHoy;
        const globalRecaudacionMes = tramitesRecaudacionMes + pagosRegistradosMes;

        const agendaTotales = agendaTotalAgg.reduce((s, x) => s + (Number(x.total) || 0), 0);
        const clientesEnAgendaTodos = new Set(agendaTotalAgg.map(x => x._id ? x._id.toString() : null).filter(Boolean));

        const clientesHistoExtra = todosClientesTramites
            .filter(c => !clientesEnAgendaTodos.has(c._id.toString()))
            .reduce((s, c) => s + (Number(c.honorarios) || 0), 0);
        
        const gananciaHistoricaTramites = agendaTotales + clientesHistoExtra;

        let mPrestamos = { recaudacionHoy: presHoy, recaudacionMes: presMes, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 };
        let mElectro = { recaudacionHoy: elecHoy, recaudacionMes: elecMes, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 };

        todosPreEles.forEach(c => {
            let costo = 0, retorno = 0, typeObj;
            if (c.categoria === 'Préstamos') {
                costo = Number(c.montoPrestado) || 0; 
                retorno = Number(c.montoDevolver) || 0; 
                typeObj = mPrestamos;
            } else {
                costo = Number(c.costoCompra) || 0; 
                retorno = Number(c.precioVenta) || 0; 
                typeObj = mElectro;
            }

            const pago = Number(c.montoPagado) || 0;
            let cap = Math.max(0, costo - pago);
            let gPend = 0, gReal = 0;

            if (pago <= costo) {
                gPend = Math.max(0, retorno - costo);
            } else {
                gReal = pago - costo;
                gPend = Math.max(0, retorno - pago);
            }

            if (c.estado === 'Cerrado' || c.estado === 'Pagado') {
                cap = 0; 
                gPend = 0;
                gReal = Math.max(0, retorno - costo);
            }

            typeObj.capitalEnCalle = Math.round((typeObj.capitalEnCalle + cap) * 100) / 100;
            typeObj.gananciaPendiente = Math.round((typeObj.gananciaPendiente + gPend) * 100) / 100;
            typeObj.gananciaRealizada = Math.round((typeObj.gananciaRealizada + gReal) * 100) / 100;
        });

        // 6. HISTORIAL MENSUAL
        const historialMap = {};
        const getMonthKey = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr);
            const localD = new Date(d.getTime() - (3 * 60 * 60 * 1000));
            const y = localD.getUTCFullYear();
            let m = localD.getUTCMonth() + 1;
            return `${y}-${m.toString().padStart(2, '0')}`;
        };

        const initMonth = (m) => {
            if (!historialMap[m]) historialMap[m] = { tramites: 0, prestamos: 0, electro: 0 };
        };

        const agendaIds = new Set();
        todaAgenda.forEach(a => {
            if (a.clienteId) agendaIds.add(a.clienteId.toString());
            const mk = getMonthKey(a.fecha);
            if (mk) { initMonth(mk); historialMap[mk].tramites += (Number(a.honorarios) || 0); }
        });

        todosTramites.forEach(c => {
            if (!agendaIds.has(c._id.toString())) {
                const mk = getMonthKey(c.createdAt || c.fecha);
                if (mk) { initMonth(mk); historialMap[mk].tramites += (Number(c.honorarios) || 0); }
            }
        });

        todosPreElesGanancia.forEach(c => {
            if (!c.historialPagos || c.historialPagos.length === 0) return;
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
                        else historialMap[mk].electro += gananciaNetaDelPago;
                    }
                }
            });
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
