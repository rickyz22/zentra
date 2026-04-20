const Cliente = require('../models/Cliente');
const Agenda = require('../models/Agenda');
const xlsx = require('xlsx');

// Guardar un nuevo cliente
exports.crearCliente = async (req, res) => {
    try {
        // Normalización y cálculo explícito solicitado por Jony
        const fechaIngresoInput = req.body.fechaIngreso || req.body.fecha_ingreso || new Date();
        const fechaObjeto = new Date(fechaIngresoInput);

        // Sanitize numbers
        ['honorarios', 'montoPrestado', 'montoDevolver', 'costoCompra', 'precioVenta', 'montoPagado'].forEach(field => {
            if (req.body[field] !== undefined) {
                const val = Number(req.body[field]);
                if (val < 0) throw new Error(`El campo ${field} no puede ser negativo`);
                req.body[field] = Math.round(val * 100) / 100;
            }
        });

        // Crear cliente asegurando que la fechaIngreso se incluya desde el constructor
        const nuevoCliente = new Cliente({
            ...req.body,
            fechaIngreso: fechaObjeto,
            fecha: fechaObjeto
        });

        // Cálculo de vencimiento solicitado: 31 días después del inicio
        if (req.body.categoria === 'Préstamos' || req.body.categoria === 'Electrodomésticos') {
            const dateCobro = new Date(fechaObjeto);
            dateCobro.setDate(dateCobro.getDate() + 31);
            dateCobro.setHours(12, 0, 0, 0); // Forzar mediodía para evitar saltos de día por zona horaria
            nuevoCliente.proximoCobro = dateCobro;
        }
        
        const clienteGuardado = await nuevoCliente.save();

        res.status(201).json({
            ok: true,
            msg: 'Cliente creado correctamente',
            cliente: clienteGuardado
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            msg: 'Error al crear el cliente',
            error: error.message
        });
    }
};

// Traer todos los clientes de la base de datos
exports.obtenerClientes = async (req, res) => {
    try {
        const clientes = await Cliente.find().sort({ fecha: -1 });
        res.status(200).json({
            ok: true,
            count: clientes.length,
            clientes
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Error al obtener los clientes',
            error: error.message
        });
    }
};

// Borrar un cliente (con borrado en cascada de sus trámites de Agenda)
exports.eliminarCliente = async (req, res) => {

    try {
        const clienteId = req.params.id;

        // 1. Primero borrar todos los trámites de agenda asociados a este cliente
        const resultAgenda = await Agenda.deleteMany({ clienteId: clienteId });


        // 2. Luego borrar el cliente
        const clienteEliminado = await Cliente.findByIdAndDelete(clienteId);
        
        if (!clienteEliminado) {

            return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });
        }

        res.status(200).json({
            ok: true,
            msg: `Cliente "${clienteEliminado.nombre}" eliminado junto con ${resultAgenda.deletedCount} trámite(s) de agenda.`
        });
    } catch (error) {
        console.error('💥 ERROR CRÍTICO AL ELIMINAR:', error);
        res.status(500).json({
            ok: false,
            msg: 'Error al eliminar el cliente',
            error: error.message
        });
    }
};

// Actualizar un cliente existente
exports.actualizarCliente = async (req, res) => {
    try {
        const clienteId = req.params.id;
        
        // Sanitize numbers
        ['honorarios', 'montoPrestado', 'montoDevolver', 'costoCompra', 'precioVenta', 'montoPagado'].forEach(field => {
            if (req.body[field] !== undefined) {
                const val = Number(req.body[field]);
                if (val < 0) throw new Error(`El campo ${field} no puede ser negativo`);
                req.body[field] = Math.round(val * 100) / 100;
            }
        });

        // Normalización y recálculo explícito solicitado por Jony
        if (req.body.fechaIngreso || req.body.fecha_ingreso) {
            const fechaInput = req.body.fechaIngreso || req.body.fecha_ingreso;
            const fechaObjeto = new Date(fechaInput);
            req.body.fechaIngreso = fechaObjeto;
            req.body.fecha = fechaObjeto;

            if (req.body.categoria === 'Préstamos' || req.body.categoria === 'Electrodomésticos') {
                const dateCobro = new Date(fechaObjeto);
                dateCobro.setDate(dateCobro.getDate() + 31);
                dateCobro.setHours(12, 0, 0, 0);
                req.body.proximoCobro = dateCobro;
            }
        }

        const clienteActualizado = await Cliente.findByIdAndUpdate(
            clienteId, 
            req.body, 
            { new: true, runValidators: true }
        );

        if (!clienteActualizado) {
            return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });
        }

        res.status(200).json({
            ok: true,
            msg: 'Cliente actualizado correctamente',
            cliente: clienteActualizado
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            msg: 'Error al actualizar el cliente',
            error: error.message
        });
    }
};

// Registrar un pago
exports.registrarPago = async (req, res) => {
    try {
        const clienteId = req.params.id;
        const montoIngresado = parseFloat(req.body.monto) || 0;
        if (montoIngresado <= 0) {
            return res.status(400).json({ ok: false, msg: 'El monto ingresado debe ser mayor a 0' });
        }
        
        const metodoIngresado = req.body.metodo || 'Efectivo';

        const cliente = await Cliente.findById(clienteId);
        if (!cliente) {
            return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });
        }

        if (cliente.categoria !== 'Préstamos' && cliente.categoria !== 'Electrodomésticos') {
            return res.status(400).json({ ok: false, msg: 'Pagos solo aplican a Préstamos o Electrodomésticos' });
        }

        cliente.montoPagado = Math.round((cliente.montoPagado + montoIngresado) * 100) / 100;
        cliente.pagosRegistrados += 1;
        cliente.ultimoPago = new Date();
        cliente.proximoCobro = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
        
        if (!cliente.historialPagos) cliente.historialPagos = [];
        cliente.historialPagos.push({ monto: Math.round(montoIngresado * 100) / 100, fecha: new Date(), metodo: metodoIngresado });

        const totalAdeudado = cliente.montoDevolver || cliente.precioVenta || 0;
        if (cliente.montoPagado >= totalAdeudado) {
            cliente.estado = 'Pagado';
        }

        const clienteActualizado = await cliente.save();

        res.status(200).json({
            ok: true,
            msg: 'Pago registrado correctamente',
            cliente: clienteActualizado
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            msg: 'Error al registrar el pago',
            error: error.message
        });
    }
};

// Eliminar un pago y recalcular saldos
exports.eliminarPago = async (req, res) => {
    try {
        const { id, pagoId } = req.params;
        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        const pagoOriginal = cliente.historialPagos.id(pagoId);
        if (!pagoOriginal) return res.status(404).json({ ok: false, msg: 'Pago no encontrado en el historial' });

        // Restar valores numéricos
        cliente.montoPagado = Math.round((cliente.montoPagado - pagoOriginal.monto) * 100) / 100;
        cliente.pagosRegistrados -= 1;
        if (cliente.pagosRegistrados < 0) cliente.pagosRegistrados = 0;
        if (cliente.montoPagado < 0) cliente.montoPagado = 0;

        // Reabrir cliente si había sido cerrado por pagos
        if (cliente.estado === 'Cerrado' || cliente.estado === 'Pagado') {
            const totalAdeudado = cliente.montoDevolver || cliente.precioVenta || 0;
            if (cliente.montoPagado < totalAdeudado) {
                cliente.estado = 'Activo';
            }
        }

        // Remover del historial
        cliente.historialPagos.pull(pagoId);

        // Opcional: Revertir fechaCobro (si quisiéramos ser exactos). Por seguridad lo dejamos en la misma proyección o le apuntamos al último pago residual
        if (cliente.historialPagos.length > 0) {
            const ultimoRegistro = cliente.historialPagos[cliente.historialPagos.length - 1];
            cliente.ultimoPago = ultimoRegistro.fecha;
            cliente.proximoCobro = new Date(ultimoRegistro.fecha.getTime() + 31 * 24 * 60 * 60 * 1000);
        } else {
            cliente.ultimoPago = null;
            // Si no hay pagos, retrotraemos a inicio
            cliente.proximoCobro = new Date((cliente.createdAt || cliente.fecha).getTime() + 31 * 24 * 60 * 60 * 1000);
        }

        await cliente.save();

        res.status(200).json({
            ok: true,
            msg: 'Pago revertido y métricas recalculadas correctamente',
            cliente
        });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al eliminar el pago', error: error.message });
    }
};

// Obtener estadísticas y recaudación corregida para GMT-3 (Argentina)
exports.obtenerEstadisticas = async (req, res) => {
    try {
        // 1. Conteo de clientes por tipo de trámite
        const results = await Cliente.aggregate([
            { $group: { _id: '$tramite', count: { $sum: 1 } } }
        ]);
        const stats = {};
        results.forEach(item => { if (item._id) stats[item._id] = item.count; });

        // 2. Ventanas de tiempo en Argentina (GMT-3)
        // MongoDB almacena en UTC. Argentina = UTC-3, así que sumamos 3h para compensar
        // y luego definimos los rangos correctos.
        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // 3 horas en milisegundos

        const ahoraUTC = new Date();
        // "Ahora" en hora Argentina
        const ahoraAR  = new Date(ahoraUTC.getTime() - TZ_OFFSET_MS);

        // Inicio de HOY en hora Argentina (00:00:00), convertido a UTC para MongoDB
        const todayStart = new Date(Date.UTC(
            ahoraAR.getUTCFullYear(),
            ahoraAR.getUTCMonth(),
            ahoraAR.getUTCDate(),
            3, 0, 0, 0   // AR 00:00 = UTC 03:00
        ));
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        // Inicio del MES actual en hora Argentina
        const monthStart = new Date(Date.UTC(
            ahoraAR.getUTCFullYear(),
            ahoraAR.getUTCMonth(),
            1,
            3, 0, 0, 0   // AR 00:00 = UTC 03:00
        ));

        // 3. Honorarios desde AGENDA (fuente primaria - ya tiene fecha de vencimiento)
        const agendaFinance = await Agenda.aggregate([
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
        ]);

        // Clientes que ya están cubiertos por la agenda (para evitar doble conteo)
        const clientesEnAgendaHoy = new Set(
            agendaFinance[0].hoy.map(x => x._id ? x._id.toString() : null).filter(Boolean)
        );
        const clientesEnAgendaMes = new Set(
            agendaFinance[0].mes.map(x => x._id ? x._id.toString() : null).filter(Boolean)
        );

        const agendaHoy = agendaFinance[0].hoy.reduce((s, x) => s + x.total, 0);
        const agendaMes = agendaFinance[0].mes.reduce((s, x) => s + x.total, 0);

        // 4. Honorarios desde CLIENTES (usando fecha de creación, sin duplicar con agenda)
        const clientesHoy = await Cliente.find({
            honorarios: { $gt: 0 },
            createdAt: { $gte: todayStart, $lt: todayEnd }
        });
        const clientesMes = await Cliente.find({
            honorarios: { $gt: 0 },
            createdAt: { $gte: monthStart }
        });

        const clientesHoyExtra = clientesHoy
            .filter(c => !clientesEnAgendaHoy.has(c._id.toString()))
            .reduce((s, c) => s + (c.honorarios || 0), 0);

        const clientesMesExtra = clientesMes
            .filter(c => !clientesEnAgendaMes.has(c._id.toString()))
            .reduce((s, c) => s + (c.honorarios || 0), 0);

        // 5. NUEVO: Flujo de Caja (Pagos de Préstamos y Electrodomésticos HOY y ESTE MES)
        const clientesConPagos = await Cliente.find({ 
            'historialPagos.fecha': { $gte: monthStart } 
        });

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

        // Solo trámites
        const tramitesRecaudacionHoy = agendaHoy + clientesHoyExtra;
        const tramitesRecaudacionMes = agendaMes + clientesMesExtra;

        // Total Global
        const globalRecaudacionHoy = tramitesRecaudacionHoy + pagosRegistradosHoy;
        const globalRecaudacionMes = tramitesRecaudacionMes + pagosRegistradosMes;

        // Histórico de Trámites
        const agendaTotalAgg = await Agenda.aggregate([{ $group: { _id: '$clienteId', total: { $sum: '$honorarios' } } }]);
        const agendaTotales = agendaTotalAgg.reduce((s, x) => s + (Number(x.total) || 0), 0);
        const clientesEnAgendaTodos = new Set(agendaTotalAgg.map(x => x._id ? x._id.toString() : null).filter(Boolean));

        const todosClientesTramites = await Cliente.find({ 
            $or: [{ categoria: 'Trámites' }, { categoria: { $exists: false } }] 
        });


        const clientesHistoExtra = todosClientesTramites
            .filter(c => !clientesEnAgendaTodos.has(c._id.toString()))
            .reduce((s, c) => {
                const hon = Number(c.honorarios) || 0;

                return s + hon;
            }, 0);
        
        const gananciaHistoricaTramites = agendaTotales + clientesHistoExtra;

        // Nuevas métricas "Capital en Calle" para Préstamos / Electro
        const todosPreEles = await Cliente.find({
            categoria: { $in: ['Préstamos', 'Electrodomésticos'] }
        });

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
                gReal = Math.max(0, retorno - costo); // Asumir liquidación final completada
            }

            typeObj.capitalEnCalle = Math.round((typeObj.capitalEnCalle + cap) * 100) / 100;
            typeObj.gananciaPendiente = Math.round((typeObj.gananciaPendiente + gPend) * 100) / 100;
            typeObj.gananciaRealizada = Math.round((typeObj.gananciaRealizada + gReal) * 100) / 100;
        });

        // 6. HISTORIAL MENSUAL DE GANANCIAS
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

        // 6.1 Trámites (Agenda + Clientes)
        const todaAgenda = await Agenda.find({ honorarios: { $gt: 0 } });
        const agendaIds = new Set();
        todaAgenda.forEach(a => {
            if (a.clienteId) agendaIds.add(a.clienteId.toString());
            const mk = getMonthKey(a.fecha);
            if (mk) { initMonth(mk); historialMap[mk].tramites += (Number(a.honorarios) || 0); }
        });

        const todosTramites = await Cliente.find({ honorarios: { $gt: 0 } });
        todosTramites.forEach(c => {
            if (!agendaIds.has(c._id.toString())) {
                const mk = getMonthKey(c.createdAt || c.fecha);
                if (mk) { initMonth(mk); historialMap[mk].tramites += (Number(c.honorarios) || 0); }
            }
        });

        // 6.2 Préstamos / Electro (Barrido Cronológico de Capital)
        const todosPreElesGanancia = await Cliente.find({ categoria: { $in: ['Préstamos', 'Electrodomésticos'] } });
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

        const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const historialMensual = Object.keys(historialMap).map(key => {
            const [y, m] = key.split('-');
            return {
                id: key,
                etiqueta: `${mesesNombres[parseInt(m) - 1]} ${y}`,
                valores: historialMap[key],
                total: historialMap[key].tramites + historialMap[key].prestamos + historialMap[key].electro
            };
        }).sort((a, b) => b.id.localeCompare(a.id));

        res.status(200).json({
            ok: true,
            stats,
            historialMensual,
            global: {
                recaudacionHoy: globalRecaudacionHoy,
                recaudacionMes: globalRecaudacionMes,
            },
            tramites: {
                recaudacionHoy: tramitesRecaudacionHoy,
                recaudacionMes: tramitesRecaudacionMes,
                gananciaHistorica: gananciaHistoricaTramites
            },
            prestamos: mPrestamos,
            electro: mElectro
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Error al obtener estadísticas',
            error: error.message
        });
    }
};

exports.exportarDatos = async (req, res) => {
    try {
        const clientesRaw = await Cliente.find().lean();
        const agendaRaw = await Agenda.find().lean();

        const clientesData = [];
        const pagosData = [];
        const tramitesData = [];

        clientesRaw.forEach(c => {
            const isTramite = c.categoria === 'Trámites' || !c.categoria;
            
            if (isTramite) {
                tramitesData.push({
                    'Nombre del Trámite / Cliente': c.nombre || '',
                    'Trámite': c.tramite || 'N/A',
                    'Fecha Alta': c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-AR') : 'N/A',
                    'A Cobrar': Number(c.honorarios) || 0,
                    'Estado': c.estado || 'Activo'
                });
            } else {
                const totalAdeudado = (Number(c.montoDevolver) || Number(c.precioVenta) || 0);
                const saldoPendiente = Math.max(0, totalAdeudado - (Number(c.montoPagado) || 0));
                
                clientesData.push({
                    'Nombre': c.nombre || '',
                    'Teléfono': c.telefono || '',
                    'Categoría': c.categoria || '',
                    'Monto Original': (Number(c.montoPrestado) || Number(c.costoCompra) || 0),
                    'Total a Devolver': totalAdeudado,
                    'Saldo Pendiente': saldoPendiente,
                    'Monto Pagado': (Number(c.montoPagado) || 0),
                    'Próximo Cobro': c.proximoCobro ? new Date(c.proximoCobro).toLocaleDateString('es-AR') : 'N/A',
                    'Estado': c.estado || 'Activo'
                });
            }

            if (c.historialPagos && c.historialPagos.length > 0) {
                c.historialPagos.forEach(p => {
                    pagosData.push({
                        'Fecha Registro': p.fecha,
                        'Fecha de Pago': new Date(p.fecha).toLocaleDateString('es-AR'),
                        'Hora de Pago': new Date(p.fecha).toLocaleTimeString('es-AR'),
                        'Nombre del Cliente': c.nombre || '',
                        'Monto Abonado': Number(p.monto) || 0,
                        'Concepto / Método': p.metodo || 'Efectivo',
                        'Categoría': c.categoria || 'Trámites'
                    });
                });
            }
        });

        agendaRaw.forEach(a => {
            tramitesData.push({
                'Nombre del Trámite / Cliente': a.titulo || '',
                'Trámite': a.tipo || 'Agenda Manual',
                'Fecha Alta': a.fecha ? new Date(a.fecha).toLocaleDateString('es-AR') : 'N/A',
                'A Cobrar': Number(a.honorarios) || 0,
                'Estado': 'Pendiente'
            });
        });

        // Ordenar pagos por fecha real
        pagosData.sort((a,b) => new Date(b['Fecha Registro']) - new Date(a['Fecha Registro']));
        pagosData.forEach(p => delete p['Fecha Registro']); // limpiar columna temporal

        const wb = xlsx.utils.book_new();

        const wsClientes = xlsx.utils.json_to_sheet(clientesData);
        xlsx.utils.book_append_sheet(wb, wsClientes, "Clientes Activos");

        const wsPagos = xlsx.utils.json_to_sheet(pagosData);
        xlsx.utils.book_append_sheet(wb, wsPagos, "Historial de Pagos");

        const wsTramites = xlsx.utils.json_to_sheet(tramitesData);
        xlsx.utils.book_append_sheet(wb, wsTramites, "Trámites y Agenda");

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const now = new Date();
        const dateStr = now.toLocaleDateString('es-AR').replace(/\//g, '-');
        const timeStr = now.getHours().toString().padStart(2, '0') + '-' + now.getMinutes().toString().padStart(2, '0');
        const fileName = `backup_zentra_${dateStr}_${timeStr}.xlsx`;

        // Headers para evitar cualquier tipo de caché (browser, proxy, cloud)
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.status(200).send(buffer);

    } catch (error) {
        console.error('Error exportando datos:', error);
        res.status(500).json({ ok: false, msg: 'Error interno en exportación', error: error.message });
    }
};
