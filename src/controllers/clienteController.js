const Cliente = require('../models/Cliente');
const Agenda = require('../models/Agenda');
const Ganancia = require('../models/Ganancia');
const xlsx = require('xlsx');

// Crear un nuevo cliente con lógica de cuotas y fechas
exports.crearCliente = async (req, res) => {
    try {
        const data = req.body;
        
        // Función utilitaria para limpieza de montos (Audit v3.3.1)
        const toNum = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return Math.round(val);
            // Soportar formatos: "100.000", "100000", "100.000,50"
            const clean = val.toString().replace(/\./g, '').replace(',', '.');
            const num = parseFloat(clean);
            return isNaN(num) ? 0 : Math.round(num);
        };

        // Normalización de montos
        data.montoPrestado = toNum(data.montoPrestado);
        data.montoDevolver = toNum(data.montoDevolver);
        data.costoCompra = toNum(data.costoCompra);
        data.precioVenta = toNum(data.precioVenta);
        let honorariosCalculados = toNum(data.honorarios);
        const pagoInicial = toNum(data.pagoInicial);

        // Regla Senior: Si es trámite y no hay honorarios pero sí abono, el abono define el total
        if (data.categoria === 'Trámites' && honorariosCalculados === 0 && pagoInicial > 0) {
            honorariosCalculados = pagoInicial;
        }

        // Validación de montos obligatorios por categoría
        if (data.categoria === 'Préstamos') {
            if (data.montoPrestado <= 0) return res.status(400).json({ ok: false, msg: 'El monto prestado es obligatorio para Préstamos' });
            if (data.montoDevolver <= 0) return res.status(400).json({ ok: false, msg: 'El monto a devolver es obligatorio para Préstamos' });
        }
        if (data.categoria === 'Electrodomésticos') {
            if (data.costoCompra <= 0) return res.status(400).json({ ok: false, msg: 'El costo de compra es obligatorio para Electrodomésticos' });
            if (data.precioVenta <= 0) return res.status(400).json({ ok: false, msg: 'El precio de venta es obligatorio para Electrodomésticos' });
        }
        
        const fechaBase = (data.fechaIngreso && data.fechaIngreso.length > 5) ? new Date(data.fechaIngreso + 'T12:00:00') : new Date();

        // 1. Lógica de Cliente Único (Upsert por DNI solo si existe)
        let cliente = null;
        const dniLimpio = (data.dni || '').toString().trim();
        if (dniLimpio && dniLimpio.length > 5) {
            cliente = await Cliente.findOne({ dni: dniLimpio });
        }

        // 2. Estructura de la operación base
        const esTramite = data.categoria === 'Trámites';
        // Manejo robusto de fecha de vencimiento (Audit v3.3.1)
        let fVto = null;
        if (data.fechaVencimiento && data.fechaVencimiento.length > 5) {
            fVto = new Date(data.fechaVencimiento + 'T12:00:00');
            if (isNaN(fVto.getTime())) fVto = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else if (esTramite && pagoInicial >= honorariosCalculados) {
            fVto = null;
        } else {
            fVto = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        const nuevaOperacion = {
            tipo: data.categoria || 'Trámites',
            fechaAlta: fechaBase,
            montoPrestado: data.montoPrestado,
            montoDevolver: data.montoDevolver,
            costoCompra: data.costoCompra,
            precioVenta: data.precioVenta,
            producto: data.producto,
            tramite: data.tramite,
            subTipoTramite: data.subTipoTramite,
            honorarios: honorariosCalculados,
            cuotasTotales: esTramite ? 1 : (data.cuotasTotales ? Number(data.cuotasTotales) : 1),
            saldoPendiente: esTramite ? Math.max(0, honorariosCalculados - pagoInicial) : (data.montoDevolver || data.precioVenta || honorariosCalculados || 0),
            historialPagos: [],
            fechaVencimiento: fVto
        };

        // Forzar estado Pagado si el abono cubre el total (Fix Crítico v3.1.1)
        if (esTramite && pagoInicial >= honorariosCalculados && honorariosCalculados > 0) {
            nuevaOperacion.estado = 'Pagado';
            nuevaOperacion.saldoPendiente = 0;
        }

        // 3. Fix Dashboard (Ganancias): Registro atómico fuera de lógica de cliente
        if (pagoInicial > 0) {
            try {
                await Ganancia.create({
                    monto: pagoInicial,
                    descripcion: `Trámite: ${data.nombre || 'Cliente Nuevo'}`,
                    categoria: data.categoria || 'Trámites',
                    fecha: new Date()
                });
                console.log('Pago registrado en Dashboard:', pagoInicial);
            } catch (gErr) {
                console.error('Error crítico al registrar ganancia:', gErr.message);
            }
        }

        if (pagoInicial > 0) {
            nuevaOperacion.historialPagos.push({
                monto: pagoInicial,
                fecha: new Date(),
                nota: 'Abono inicial registrado en creación'
            });
        }

        let clienteGuardado;
        if (cliente) {
            // Actualizar cliente existente
            cliente.operaciones.push(nuevaOperacion);
            if (esTramite && nuevaOperacion.estado === 'Pagado') {
                cliente.estado = 'Pagado';
                // Compatibilidad Legacy: Si el frontend usa campos root, los limpiamos
                cliente.saldoPendiente = 0;
                cliente.proximoCobro = null;
            }
            
            // Si NO es trámite y hay pago inicial, aplicar descuento normal
            if (!esTramite && pagoInicial > 0) {
                nuevaOperacion.saldoPendiente -= pagoInicial;
                if (nuevaOperacion.saldoPendiente <= 0) {
                    nuevaOperacion.saldoPendiente = 0;
                    nuevaOperacion.estado = 'Pagado';
                }
                nuevaOperacion.historialPagos.push({
                    monto: pagoInicial,
                    fecha: new Date(),
                    nota: 'Abono inicial'
                });
            }
            clienteGuardado = await cliente.save();
        } else {
            // Crear cliente nuevo
            const clienteData = {
                nombre: data.nombre,
                telefono: data.telefono,
                dni: data.dni,
                direccion: data.direccion,
                garante: data.garante,
                empresa: data.empresa,
                legajoToyota: data.legajoToyota,
                notas: data.notas,
                categoria: data.categoria || 'Trámites',
                fechaIngreso: fechaBase,
                estado: (esTramite && nuevaOperacion.estado === 'Pagado') ? 'Pagado' : (esTramite ? 'Activo' : 'Pendiente'),
                operaciones: [nuevaOperacion]
            };

            const nuevoCliente = new Cliente(clienteData);
            
            // Aplicar pago inicial si no es trámite (ya manejado arriba para trámites)
            if (!esTramite && pagoInicial > 0) {
                const op = nuevoCliente.operaciones[0];
                op.saldoPendiente -= pagoInicial;
                if (op.saldoPendiente <= 0) {
                    op.saldoPendiente = 0;
                    op.estado = 'Pagado';
                    nuevoCliente.estado = 'Pagado';
                    nuevoCliente.saldoPendiente = 0; // Fix v3.1.2
                    nuevoCliente.proximoCobro = null;
                }
                op.historialPagos.push({
                    monto: pagoInicial,
                    fecha: new Date(),
                    nota: 'Abono inicial'
                });
            }
            
            clienteGuardado = await nuevoCliente.save();
        }

        // Solo agendar si NO es trámite o si se requiere específicamente (los trámites pagados no ensucian la agenda)
        if (!esTramite && nuevaOperacion.estado !== 'Pagado') {
            const fechaVencimiento = new Date(fechaBase);
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 31);
            
            await Agenda.create({
                titulo: `Vence: ${data.nombre} (${data.categoria})`,
                fecha: fechaVencimiento,
                clienteId: clienteGuardado._id,
                tipo: 'vencimiento', // Usar tipo válido del enum
                categoria: data.categoria
            });
        }

        res.status(201).json({
            ok: true,
            msg: cliente ? 'Operación agregada al cliente existente' : 'Cliente creado correctamente',
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

// Traer clientes con PAGINACIÓN (Audit v2)
exports.obtenerClientes = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Optimización: Excluir historialPagos del listado general
        const clientesRaw = await Cliente.find()
            .sort({ fecha: -1 })
            .skip(skip)
            .limit(limit);

        const clientes = clientesRaw.map(c => {
            const cliente = c.toObject();
            if (!cliente.operaciones) cliente.operaciones = [];

            // Compatibilidad legacy: Mapear datos viejos de la raíz a una operación
            if (cliente.categoria && (cliente.montoDevolver || cliente.precioVenta || cliente.honorarios || cliente.tramite)) {
                const legacyOp = {
                    _id: 'legacy',
                    tipo: cliente.categoria === 'Préstamos' ? 'Préstamos' : (cliente.categoria === 'Electrodomésticos' ? 'Electrodomésticos' : 'Trámites'),
                    estado: cliente.estado || 'Activo',
                    fechaAlta: cliente.fechaIngreso || cliente.fecha || new Date(),
                    historialPagos: cliente.historialPagos || [],
                    saldoPendiente: (cliente.montoDevolver || cliente.precioVenta || cliente.honorarios || 0) - (cliente.montoPagado || 0),
                    montoPrestado: cliente.montoPrestado,
                    montoDevolver: cliente.montoDevolver,
                    costoCompra: cliente.costoCompra,
                    precioVenta: cliente.precioVenta,
                    producto: cliente.producto,
                    tramite: cliente.tramite,
                    subTipoTramite: cliente.subTipoTramite,
                    honorarios: cliente.honorarios,
                    cuotasTotales: cliente.cuotasTotales,
                    proximoCobro: cliente.proximoCobro
                };
                cliente.operaciones.unshift(legacyOp);
            }

            // Transición del paso anterior (prestamos -> operaciones)
            if (cliente.prestamos && cliente.prestamos.length > 0) {
                cliente.operaciones.push(...cliente.prestamos.map(p => ({
                    ...p,
                    tipo: 'Préstamos'
                })));
            }

            return cliente;
        });

        const total = await Cliente.countDocuments();

        res.status(200).json({
            ok: true,
            count: clientes.length,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
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

// Actualizar datos del cliente
exports.actualizarCliente = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;

        // Redondeo preventivo
        if (data.montoPrestado) data.montoPrestado = Math.round(data.montoPrestado);
        if (data.montoDevolver) data.montoDevolver = Math.round(data.montoDevolver);
        if (data.honorarios) data.honorarios = Math.round(data.honorarios);

        const clienteActualizado = await Cliente.findByIdAndUpdate(id, data, { new: true, runValidators: true });
        
        if (!clienteActualizado) {
            return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });
        }

        res.status(200).json({ ok: true, cliente: clienteActualizado });
    } catch (error) {
        res.status(400).json({ ok: false, msg: 'Error al actualizar', error: error.message });
    }
};

// Eliminar cliente y sus recordatorios asociados (Borrado en cascada)
exports.eliminarCliente = async (req, res) => {
    try {
        const id = req.params.id;
        await Cliente.findByIdAndDelete(id);
        // Limpiar agenda asociada
        await Agenda.deleteMany({ clienteId: id });
        
        res.status(200).json({ ok: true, msg: 'Cliente y sus trámites eliminados' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al eliminar' });
    }
};

// Exportar Backup Completo a Excel
exports.exportarDatos = async (req, res) => {
    try {
        const [clientes, agenda] = await Promise.all([
            Cliente.find().lean(),
            Agenda.find().populate('clienteId').lean()
        ]);

        const wb = xlsx.utils.book_new();

        // Hoja 1: Clientes y Pagos
        const dataClientes = clientes.map(c => ({
            Nombre: c.nombre,
            Teléfono: c.telefono,
            Categoría: c.categoria || 'Trámites',
            Trámite: c.tramite || '-',
            Estado: c.estado,
            Honorarios: c.honorarios || 0,
            'Monto Prestado': c.montoPrestado || 0,
            'Monto Pagado': c.montoPagado || 0,
            'Saldo Restante': (c.montoDevolver || c.precioVenta || 0) - (c.montoPagado || 0),
            Fecha: new Date(c.fecha).toLocaleDateString('es-AR')
        }));
        const wsClientes = xlsx.utils.json_to_sheet(dataClientes);
        xlsx.utils.book_append_sheet(wb, wsClientes, "Clientes");

        // Hoja 2: Agenda
        const dataAgenda = agenda.map(a => ({
            Título: a.titulo,
            Fecha: new Date(a.fecha).toLocaleDateString('es-AR'),
            Cliente: a.clienteId ? a.clienteId.nombre : 'Personal',
            Honorarios: a.honorarios || 0,
            Tipo: a.tipo
        }));
        const wsAgenda = xlsx.utils.json_to_sheet(dataAgenda);
        xlsx.utils.book_append_sheet(wb, wsAgenda, "Agenda");

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=Zentra_Backup.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error generando Excel');
    }
};

// Agregar una nueva operación a un cliente existente
exports.agregarOperacion = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        const nuevaOperacion = {
            tipo: data.tipo || 'Préstamos',
            estado: 'Activo',
            fechaAlta: new Date(),
            montoPrestado: data.montoPrestado ? Math.round(data.montoPrestado) : undefined,
            montoDevolver: data.montoDevolver ? Math.round(data.montoDevolver) : undefined,
            costoCompra: data.costoCompra ? Math.round(data.costoCompra) : undefined,
            precioVenta: data.precioVenta ? Math.round(data.precioVenta) : undefined,
            producto: data.producto,
            tramite: data.tramite,
            subTipoTramite: data.subTipoTramite,
            honorarios: data.honorarios ? Math.round(data.honorarios) : undefined,
            cuotasTotales: (data.categoria === 'Trámites' || data.tipo === 'Trámites') ? 1 : (data.cuotasTotales ? Number(data.cuotasTotales) : 1),
            saldoPendiente: Math.round(data.montoDevolver || data.precioVenta || data.honorarios || 0),
            historialPagos: [],
            fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento + 'T12:00:00') : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };

        if (!cliente.operaciones) cliente.operaciones = [];
        cliente.operaciones.push(nuevaOperacion);
        
        await cliente.save();
        res.status(200).json({ ok: true, msg: 'Operación agregada exitosamente', cliente });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al agregar operación', error: error.message });
    }
};

// Eliminar una operación específica de un cliente
exports.eliminarOperacion = async (req, res) => {
    try {
        const { id, operacionId } = req.params;

        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        // Eliminar del array usando mongoose pull o filter
        cliente.operaciones = cliente.operaciones.filter(op => op._id.toString() !== operacionId);
        
        await cliente.save();
        res.status(200).json({ ok: true, msg: 'Operación eliminada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'Error al eliminar la operación' });
    }
};
// Reprogramar fecha de vencimiento de una operación (Híbrido Legacy-Safe & Estricto)
exports.reprogramarVencimiento = async (req, res) => {
    try {
        const { id, operacionId } = req.params;
        const { nuevaFecha } = req.body;

        if (!nuevaFecha) {
            console.warn('Rechazo de seguridad: Fecha vacía', { id, operacionId });
            return res.status(400).json({ ok: false, msg: 'La nueva fecha es obligatoria' });
        }

        const cliente = await Cliente.findById(id);
        if (!cliente) {
            console.warn('Rechazo de seguridad: Cliente no encontrado', { id });
            return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });
        }

        const opId = operacionId;
        const esIdValido = (opId && opId !== 'undefined' && opId !== 'null' && opId !== 'legacy' && opId.length === 24);

        // 1. Si el cliente NO tiene operaciones (Legacy puro) -> MIGRAR
        if (!cliente.operaciones || cliente.operaciones.length === 0) {
            const nuevaOp = {
                tipo: cliente.categoria || 'Trámites',
                estado: cliente.estado || 'Activo',
                montoPrestado: cliente.montoPrestado || 0,
                montoDevolver: cliente.montoDevolver || 0,
                costoCompra: cliente.costoCompra || 0,
                precioVenta: cliente.precioVenta || 0,
                honorarios: cliente.honorarios || 0,
                cuotasTotales: cliente.cuotasTotales || 1,
                saldoPendiente: (cliente.montoDevolver || cliente.precioVenta || cliente.honorarios || 0) - (cliente.montoPagado || 0),
                historialPagos: cliente.historialPagos || [],
                fechaVencimiento: new Date(nuevaFecha + 'T12:00:00'),
                fechaAlta: cliente.createdAt || cliente.fecha || new Date()
            };
            
            await Cliente.updateOne(
                { _id: id },
                { $push: { operaciones: nuevaOp } },
                { runValidators: false } // Evita fallos por campos faltantes en doc legacy
            );
        } 
        // 2. Si YA tiene operaciones -> EXIGIR COINCIDENCIA EXACTA
        else {
            if (!esIdValido) {
                console.warn('Rechazo de seguridad: ID de operación inválido', { opId });
                return res.status(400).json({ ok: false, msg: 'ID de operación inválido para un cliente ya migrado.' });
            }
            
            let op = null;
            try {
                op = cliente.operaciones.id(opId);
            } catch (e) {
                op = null;
            }

            if (!op) {
                console.warn('Rechazo de seguridad: Operación exacta no encontrada', { id, opId });
                return res.status(404).json({ ok: false, msg: 'Operación exacta no encontrada. No se realizaron cambios por seguridad.' });
            }
            
            // Usamos updateOne para actualizar solo ese subdocumento sin validar todo el documento padre
            await Cliente.updateOne(
                { _id: id, "operaciones._id": opId },
                { $set: { "operaciones.$.fechaVencimiento": new Date(nuevaFecha + 'T12:00:00') } },
                { runValidators: false }
            );
        }
        
        res.status(200).json({ ok: true, msg: 'Vencimiento actualizado correctamente' });
    } catch (error) {
        console.error('❌ ERROR REPROGRAMAR:', error);
        res.status(500).json({ ok: false, msg: `Error de servidor: ${error.message}` });
    }
};
