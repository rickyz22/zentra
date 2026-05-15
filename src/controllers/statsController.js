const Cliente = require('../models/Cliente');
const Agenda = require('../models/Agenda');

// Obtener estadísticas y recaudación corregida para GMT-3 (Argentina)
// Refactorizado para máxima seguridad y arquitectura 1:N (Hybrid Logic)
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

        // Obtener todos los datos necesarios en paralelo
        const [clientes, agenda] = await Promise.all([
            Cliente.find({}),
            Agenda.find({})
        ]);

        // Inicializar contadores multimoneda
        const initStats = () => ({ 
            ARS: { recaudacionHoy: 0, recaudacionMes: 0, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 },
            USD: { recaudacionHoy: 0, recaudacionMes: 0, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 }
        });

        let pStats = initStats();
        let eStats = initStats();
        let tStats = { ARS: { recaudacionHoy: 0, recaudacionMes: 0, gananciaHistorica: 0 }, USD: { recaudacionHoy: 0, recaudacionMes: 0, gananciaHistorica: 0 } };
        
        const historialMap = {};
        const initMonth = (m) => {
            if (!historialMap[m]) historialMap[m] = { 
                ARS: { tramites: 0, prestamos: 0, electro: 0 },
                USD: { tramites: 0, prestamos: 0, electro: 0 }
            };
        };

        const getMonthKey = (date) => {
            if (!date) return null;
            const d = new Date(date);
            const localD = new Date(d.getTime() - TZ_OFFSET_MS);
            return `${localD.getUTCFullYear()}-${(localD.getUTCMonth() + 1).toString().padStart(2, '0')}`;
        };

        // 1. Procesar Clientes y sus Operaciones
        clientes.forEach(c => {
            const ops = (c.operaciones && c.operaciones.length > 0) ? c.operaciones : [{
                tipo: c.categoria || 'Trámites',
                estado: c.estado || 'Activo',
                moneda: c.moneda || 'ARS',
                montoPrestado: c.montoPrestado,
                montoDevolver: c.montoDevolver,
                costoCompra: c.costoCompra,
                precioVenta: c.precioVenta,
                honorarios: c.honorarios,
                cuotasTotales: c.cuotasTotales || 1,
                historialPagos: c.historialPagos,
                createdAt: c.createdAt || c.fecha
            }];

            ops.forEach(op => {
                const tipo = op.tipo || 'Trámites';
                const estado = op.estado || 'Activo';
                const moneda = op.moneda || 'ARS';

                if (tipo === 'Trámites') {
                    const h = Number(op.honorarios) || 0;
                    tStats[moneda].gananciaHistorica += h;
                    const created = new Date(op.createdAt || c.createdAt);
                    if (created >= monthStart) {
                        tStats[moneda].recaudacionMes += h;
                        if (created >= todayStart && created < todayEnd) tStats[moneda].recaudacionHoy += h;
                    }
                    const mk = getMonthKey(created);
                    if (mk) { initMonth(mk); historialMap[mk][moneda].tramites += h; }
                } else {
                    const isP = (tipo === 'Préstamos');
                    const target = (isP ? pStats : eStats)[moneda];
                    const costo = isP ? (Number(op.montoPrestado) || 0) : (Number(op.costoCompra) || 0);
                    const retorno = isP ? (Number(op.montoDevolver) || 0) : (Number(op.precioVenta) || 0);
                    const gananciaTotalOp = Math.max(0, retorno - costo);
                    const cuotasTotales = Number(op.cuotasTotales) || 1;
                    const gananciaPorCuota = gananciaTotalOp / cuotasTotales;

                    const pagos = op.historialPagos || [];
                    let totalPagadoOp = 0;

                    pagos.forEach(p => {
                        const monto = Number(p.monto) || 0;
                        totalPagadoOp += monto;
                        
                        const f = new Date(p.fecha);
                        if (f >= monthStart) {
                            target.recaudacionMes += monto;
                            if (f >= todayStart && f < todayEnd) target.recaudacionHoy += monto;
                        }

                        // Jony Rule v3.11.0: Profit is proportional to installments
                        const gananciaNeta = gananciaPorCuota; 
                        
                        if (gananciaNeta > 0) {
                            const mk = getMonthKey(p.fecha);
                            if (mk) {
                                initMonth(mk);
                                if (isP) historialMap[mk][moneda].prestamos += gananciaNeta;
                                else historialMap[mk][moneda].electro += gananciaNeta;
                            }
                            target.gananciaRealizada += gananciaNeta;
                        }
                    });

                    if (!['Cerrado', 'Pagado', 'Cancelado'].includes(estado)) {
                        const gananciaRealizadaOp = gananciaPorCuota * pagos.length;
                        const capRecuperadoOp = Math.max(0, totalPagadoOp - gananciaRealizadaOp);
                        
                        target.capitalEnCalle += Math.max(0, costo - capRecuperadoOp);
                        target.gananciaPendiente += Math.max(0, gananciaTotalOp - gananciaRealizadaOp);
                    }
                }
            });
        });

        // 2. Procesar Agenda (Solo Trámites agendados - Asumimos ARS por ahora)
        agenda.forEach(a => {
            const h = Number(a.honorarios) || 0;
            if (h > 0) {
                const moneda = a.moneda || 'ARS'; // Si el modelo Agenda no tiene moneda, será ARS
                tStats[moneda].gananciaHistorica += h;
                const f = new Date(a.fecha);
                if (f >= monthStart) {
                    tStats[moneda].recaudacionMes += h;
                    if (f >= todayStart && f < todayEnd) tStats[moneda].recaudacionHoy += h;
                }
                const mk = getMonthKey(a.fecha);
                if (mk) { initMonth(mk); historialMap[mk][moneda].tramites += h; }
            }
        });

        // Formatear historial mensual
        const historialMensual = Object.entries(historialMap)
            .map(([id, valores]) => ({
                id,
                etiqueta: new Date(id + '-02').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
                totalARS: Math.round((valores.ARS.tramites + valores.ARS.prestamos + valores.ARS.electro) * 100) / 100,
                totalUSD: Math.round((valores.USD.tramites + valores.USD.prestamos + valores.USD.electro) * 100) / 100,
                valores
            }))
            .sort((a, b) => b.id.localeCompare(a.id));

        res.status(200).json({
            ok: true,
            global: { 
                recaudacionHoy: { 
                    ARS: Math.round(tStats.ARS.recaudacionHoy + pStats.ARS.recaudacionHoy + eStats.ARS.recaudacionHoy),
                    USD: Math.round(tStats.USD.recaudacionHoy + pStats.USD.recaudacionHoy + eStats.USD.recaudacionHoy)
                },
                recaudacionMes: {
                    ARS: Math.round(tStats.ARS.recaudacionMes + pStats.ARS.recaudacionMes + eStats.ARS.recaudacionMes),
                    USD: Math.round(tStats.USD.recaudacionMes + pStats.USD.recaudacionMes + eStats.USD.recaudacionMes)
                }
            },
            tramites: tStats,
            prestamos: pStats,
            electro: eStats,
            historialMensual
        });

    } catch (error) {
        console.error('❌ ERROR FATAL EN MÉTRICAS:', error);
        res.status(500).json({ ok: false, msg: 'Error interno al calcular métricas', error: error.message });
    }
};
