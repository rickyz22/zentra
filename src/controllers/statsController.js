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

        // Inicializar contadores
        let gHoy = 0, gMes = 0;
        let pStats = { recaudacionHoy: 0, recaudacionMes: 0, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 };
        let eStats = { recaudacionHoy: 0, recaudacionMes: 0, capitalEnCalle: 0, gananciaPendiente: 0, gananciaRealizada: 0 };
        let tStats = { recaudacionHoy: 0, recaudacionMes: 0, gananciaHistorica: 0 };
        
        const historialMap = {};
        const initMonth = (m) => {
            if (!historialMap[m]) historialMap[m] = { tramites: 0, prestamos: 0, electro: 0 };
        };
        const getMonthKey = (date) => {
            if (!date) return null;
            const d = new Date(date);
            // Ajuste a GMT-3 para agrupar por mes correctamente en Argentina
            const localD = new Date(d.getTime() - TZ_OFFSET_MS);
            return `${localD.getUTCFullYear()}-${(localD.getUTCMonth() + 1).toString().padStart(2, '0')}`;
        };

        // 1. Procesar Clientes y sus Operaciones
        clientes.forEach(c => {
            // Unificamos: si no tiene operaciones, creamos una virtual desde la raíz (Legacy)
            const ops = (c.operaciones && c.operaciones.length > 0) ? c.operaciones : [{
                tipo: c.categoria || 'Trámites',
                estado: c.estado || 'Activo',
                montoPrestado: c.montoPrestado,
                montoDevolver: c.montoDevolver,
                costoCompra: c.costoCompra,
                precioVenta: c.precioVenta,
                honorarios: c.honorarios,
                historialPagos: c.historialPagos,
                createdAt: c.createdAt || c.fecha
            }];

            ops.forEach(op => {
                const tipo = op.tipo || 'Trámites';
                const estado = op.estado || 'Activo';

                if (tipo === 'Trámites') {
                    const h = Number(op.honorarios) || 0;
                    tStats.gananciaHistorica += h;
                    const created = new Date(op.createdAt || c.createdAt);
                    if (created >= monthStart) {
                        tStats.recaudacionMes += h;
                        if (created >= todayStart && created < todayEnd) tStats.recaudacionHoy += h;
                    }
                    const mk = getMonthKey(created);
                    if (mk) { initMonth(mk); historialMap[mk].tramites += h; }
                } else {
                    // Préstamos o Electrodomésticos
                    const isP = (tipo === 'Préstamos');
                    const target = isP ? pStats : eStats;
                    const costo = isP ? (Number(op.montoPrestado) || 0) : (Number(op.costoCompra) || 0);
                    const retorno = isP ? (Number(op.montoDevolver) || 0) : (Number(op.precioVenta) || 0);
                    
                    // Pagos
                    const pagos = op.historialPagos || [];
                    const pagosOrdenados = [...pagos].sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
                    let totalPagadoOp = 0;
                    let capitalRecuperado = 0;

                    pagosOrdenados.forEach(p => {
                        const monto = Number(p.monto) || 0;
                        totalPagadoOp += monto;
                        
                        // Flujo de caja
                        const f = new Date(p.fecha);
                        if (f >= monthStart) {
                            target.recaudacionMes += monto;
                            if (f >= todayStart && f < todayEnd) target.recaudacionHoy += monto;
                        }

                        // Ganancia real del pago (método FIFO: primero recupero capital, luego es ganancia)
                        let gananciaNeta = 0;
                        if (capitalRecuperado < costo) {
                            const porcionCap = Math.min(monto, costo - capitalRecuperado);
                            gananciaNeta = Math.max(0, monto - porcionCap);
                            capitalRecuperado += porcionCap;
                        } else {
                            gananciaNeta = monto;
                        }

                        if (gananciaNeta > 0) {
                            const mk = getMonthKey(p.fecha);
                            if (mk) {
                                initMonth(mk);
                                if (isP) historialMap[mk].prestamos += gananciaNeta;
                                else historialMap[mk].electro += gananciaNeta;
                            }
                            // Ganancia Realizada Total
                            target.gananciaRealizada += gananciaNeta;
                        }
                    });

                    // Capital en calle y Ganancia Pendiente (solo si no está cerrado)
                    if (!['Cerrado', 'Pagado', 'Cancelado'].includes(estado)) {
                        target.capitalEnCalle += Math.max(0, costo - capitalRecuperado);
                        // La ganancia pendiente es lo que falta cobrar del retorno total una vez cubierto el costo
                        const gananciaTotalEsperada = Math.max(0, retorno - costo);
                        const gananciaYaCobrada = Math.max(0, totalPagadoOp - capitalRecuperado);
                        target.gananciaPendiente += Math.max(0, gananciaTotalEsperada - gananciaYaCobrada);
                    }
                }
            });
        });

        // 2. Procesar Agenda (Solo Trámites agendados)
        agenda.forEach(a => {
            const h = Number(a.honorarios) || 0;
            if (h > 0) {
                tStats.gananciaHistorica += h;
                const f = new Date(a.fecha);
                if (f >= monthStart) {
                    tStats.recaudacionMes += h;
                    if (f >= todayStart && f < todayEnd) tStats.recaudacionHoy += h;
                }
                const mk = getMonthKey(a.fecha);
                if (mk) { initMonth(mk); historialMap[mk].tramites += h; }
            }
        });

        // Formatear historial mensual
        const historialMensual = Object.entries(historialMap)
            .map(([id, valores]) => ({
                id,
                etiqueta: new Date(id + '-02').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
                total: Math.round((valores.tramites + valores.prestamos + valores.electro) * 100) / 100,
                valores
            }))
            .sort((a, b) => b.id.localeCompare(a.id));

        // Totales Globales
        const globalHoy = tStats.recaudacionHoy + pStats.recaudacionHoy + eStats.recaudacionHoy;
        const globalMes = tStats.recaudacionMes + pStats.recaudacionMes + eStats.recaudacionMes;

        res.status(200).json({
            ok: true,
            global: { recaudacionHoy: Math.round(globalHoy), recaudacionMes: Math.round(globalMes) },
            tramites: { 
                recaudacionHoy: Math.round(tStats.recaudacionHoy), 
                recaudacionMes: Math.round(tStats.recaudacionMes), 
                gananciaHistorica: Math.round(tStats.gananciaHistorica) 
            },
            prestamos: {
                recaudacionHoy: Math.round(pStats.recaudacionHoy),
                recaudacionMes: Math.round(pStats.recaudacionMes),
                capitalEnCalle: Math.round(pStats.capitalEnCalle),
                gananciaPendiente: Math.round(pStats.gananciaPendiente),
                gananciaRealizada: Math.round(pStats.gananciaRealizada)
            },
            electro: {
                recaudacionHoy: Math.round(eStats.recaudacionHoy),
                recaudacionMes: Math.round(eStats.recaudacionMes),
                capitalEnCalle: Math.round(eStats.capitalEnCalle),
                gananciaPendiente: Math.round(eStats.gananciaPendiente),
                gananciaRealizada: Math.round(eStats.gananciaRealizada)
            },
            historialMensual
        });

    } catch (error) {
        console.error('❌ ERROR FATAL EN MÉTRICAS:', error);
        res.status(500).json({ ok: false, msg: 'Error interno al calcular métricas', error: error.message });
    }
};
