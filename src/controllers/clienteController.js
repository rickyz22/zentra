const Cliente = require('../models/Cliente');
const Agenda = require('../models/Agenda');
const xlsx = require('xlsx');

// Crear un nuevo cliente con lógica de cuotas y fechas
exports.crearCliente = async (req, res) => {
    try {
        const data = req.body;
        
        // Redondeo de montos para evitar decimales infinitos
        if (data.montoPrestado) data.montoPrestado = Math.round(data.montoPrestado);
        if (data.montoDevolver) data.montoDevolver = Math.round(data.montoDevolver);
        if (data.costoCompra) data.costoCompra = Math.round(data.costoCompra);
        if (data.precioVenta) data.precioVenta = Math.round(data.precioVenta);
        if (data.honorarios) data.honorarios = Math.round(data.honorarios);

        // Si se provee fecha manual, usarla. Si no, hoy.
        const fechaBase = data.fechaIngreso ? new Date(data.fechaIngreso) : new Date();
        data.fecha = fechaBase;

        const nuevoCliente = new Cliente(data);
        const clienteGuardado = await nuevoCliente.save();

        // Lógica de Agenda Automática para Trámites
        if (data.categoria === 'Trámites' || !data.categoria) {
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
        const clientes = await Cliente.find()
            .select('-historialPagos')
            .sort({ fecha: -1 })
            .skip(skip)
            .limit(limit);

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

        const clienteActualizado = await Cliente.findByIdAndUpdate(id, data, { new: true });
        
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
