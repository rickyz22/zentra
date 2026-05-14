const Cliente = require('../models/Cliente');
const Agenda = require('../models/Agenda');
const xlsx = require('xlsx');

// Crear un nuevo cliente con lógica de cuotas y fechas
exports.crearCliente = async (req, res) => {
    try {
        const data = req.body;
        
        // Redondeo de montos
        if (data.montoPrestado) data.montoPrestado = Math.round(data.montoPrestado);
        if (data.montoDevolver) data.montoDevolver = Math.round(data.montoDevolver);
        if (data.costoCompra) data.costoCompra = Math.round(data.costoCompra);
        if (data.precioVenta) data.precioVenta = Math.round(data.precioVenta);
        if (data.honorarios) data.honorarios = Math.round(data.honorarios);

        // Validación de montos obligatorios por categoría
        if (data.categoria === 'Préstamos') {
            if (!data.montoPrestado || data.montoPrestado <= 0) return res.status(400).json({ ok: false, msg: 'El monto prestado es obligatorio para Préstamos' });
            if (!data.montoDevolver || data.montoDevolver <= 0) return res.status(400).json({ ok: false, msg: 'El monto a devolver es obligatorio para Préstamos' });
        }
        if (data.categoria === 'Electrodomésticos') {
            if (!data.costoCompra || data.costoCompra <= 0) return res.status(400).json({ ok: false, msg: 'El costo de compra es obligatorio para Electrodomésticos' });
            if (!data.precioVenta || data.precioVenta <= 0) return res.status(400).json({ ok: false, msg: 'El precio de venta es obligatorio para Electrodomésticos' });
        }

        const fechaBase = data.fechaIngreso ? new Date(data.fechaIngreso + 'T12:00:00') : new Date();

        // Estructura de la operación base
        const nuevaOperacion = {
            tipo: data.categoria || 'Trámites',
            estado: 'Activo',
            fechaAlta: fechaBase,
            montoPrestado: data.montoPrestado,
            montoDevolver: data.montoDevolver,
            costoCompra: data.costoCompra,
            precioVenta: data.precioVenta,
            producto: data.producto,
            tramite: data.tramite,
            subTipoTramite: data.subTipoTramite,
            honorarios: data.honorarios,
            cuotasTotales: (data.categoria === 'Trámites' || data.tipo === 'Trámites') ? 1 : (data.cuotasTotales ? Number(data.cuotasTotales) : 1),
            saldoPendiente: (data.montoDevolver || data.precioVenta || data.honorarios || 0),
            historialPagos: [],
            fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento + 'T12:00:00') : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };

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
            operaciones: [nuevaOperacion]
        };

        const nuevoCliente = new Cliente(clienteData);
        const clienteGuardado = await nuevoCliente.save();

        if (nuevaOperacion.tipo === 'Trámites') {
            const fechaVencimiento = new Date(fechaBase);
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 31);
            
            await Agenda.create({
                titulo: `Vence Trámite: ${data.tramite || 'General'}`,
                fecha: fechaVencimiento,
                clienteId: clienteGuardado._id,
                tipo: 'Trámite',
                honorarios: data.honorarios || 0,
                categoria: 'Trámites'
            });
        }

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
