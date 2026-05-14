const Cliente = require('../models/Cliente');

// Registrar un pago y actualizar estado automáticamente
// Refactorizado para modularización (Audit v2)
exports.registrarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const { monto, metodo, fechaPago, operacionId } = req.body;
        
        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        const fechaEfectiva = fechaPago ? new Date(fechaPago) : new Date();

        const nuevoPago = {
            monto: Number(monto),
            metodo: metodo || 'Efectivo',
            fecha: fechaEfectiva,
            nota: `Pago de $${Number(monto).toLocaleString('es-AR')} vía ${metodo || 'Efectivo'}`
        };

        if (operacionId && operacionId !== 'legacy') {
            const operacion = cliente.operaciones.id(operacionId);
            if (!operacion) return res.status(404).json({ ok: false, msg: 'Operación no encontrada' });

            operacion.historialPagos.push(nuevoPago);
            const totalPagado = operacion.historialPagos.reduce((total, p) => total + p.monto, 0);
            
            const montoADevolver = operacion.montoDevolver || operacion.precioVenta || operacion.honorarios || 0;
            operacion.saldoPendiente = montoADevolver - totalPagado;

            if (operacion.saldoPendiente <= 0) {
                operacion.estado = 'Pagado';
                operacion.saldoPendiente = 0;
                operacion.fechaVencimiento = undefined; // Ya no hay vencimiento si está pagado
            } else {
                operacion.estado = 'Activo';
                // Solo desplazamos si la deuda persiste
                if (operacion.fechaVencimiento) {
                    const currentVenc = new Date(operacion.fechaVencimiento);
                    operacion.fechaVencimiento = new Date(currentVenc.setDate(currentVenc.getDate() + 30));
                } else {
                    operacion.fechaVencimiento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                }
            }

            cliente.markModified('operaciones');
        } else {
            // Lógica legacy
            cliente.historialPagos.push(nuevoPago);
            cliente.montoPagado = cliente.historialPagos.reduce((total, p) => total + p.monto, 0);

            if (cliente.categoria === 'Préstamos' || cliente.categoria === 'Electrodomésticos') {
                const totalADevolver = cliente.categoria === 'Préstamos' ? cliente.montoDevolver : cliente.precioVenta;
                if (cliente.montoPagado >= totalADevolver) {
                    cliente.estado = 'Pagado';
                } else {
                    cliente.estado = 'Activo';
                }
            }
            cliente.markModified('historialPagos');
        }

        // --- LÓGICA DE CIERRE GLOBAL ---
        // Si no tiene NINGUNA operación activa, el cliente pasa a estado 'Cerrado'
        const tieneOpsActivas = cliente.operaciones.some(op => !['Pagado', 'Cancelado', 'Cerrado'].includes(op.estado));
        
        if (!tieneOpsActivas) {
            cliente.estado = 'Cerrado';
        } else {
            // Si tiene operaciones activas y estaba cerrado, lo activamos
            if (cliente.estado === 'Cerrado' || cliente.estado === 'Pagado') {
                cliente.estado = 'Activo';
            }
        }

        await cliente.save();
        res.status(200).json({ ok: true, msg: 'Pago registrado con éxito', cliente });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al registrar pago', error: error.message });
    }
};

// Eliminar un pago del historial
exports.eliminarPago = async (req, res) => {
    try {
        const { id, pagoId } = req.params;
        const { operacionId } = req.body;

        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        if (operacionId && operacionId !== 'legacy') {
            const operacion = cliente.operaciones.id(operacionId);
            if (!operacion) return res.status(404).json({ ok: false, msg: 'Operación no encontrada' });

            operacion.historialPagos = operacion.historialPagos.filter(p => p._id.toString() !== pagoId);
            const totalPagado = operacion.historialPagos.reduce((total, p) => total + p.monto, 0);
            
            const montoADevolver = operacion.montoDevolver || operacion.precioVenta || operacion.honorarios || 0;
            operacion.saldoPendiente = montoADevolver - totalPagado;

            if (operacion.saldoPendiente > 0) {
                operacion.estado = 'Activo';
            } else {
                operacion.estado = 'Pagado';
            }
            cliente.markModified('operaciones');
        } else {
            // Lógica legacy
            cliente.historialPagos = cliente.historialPagos.filter(p => p._id.toString() !== pagoId);
            cliente.montoPagado = cliente.historialPagos.reduce((total, p) => total + p.monto, 0);

            if (cliente.categoria === 'Préstamos' || cliente.categoria === 'Electrodomésticos') {
                const totalADevolver = cliente.categoria === 'Préstamos' ? cliente.montoDevolver : cliente.precioVenta;
                if (cliente.montoPagado < totalADevolver) {
                    cliente.estado = 'Activo';
                }
            }
            cliente.markModified('historialPagos');
        }

        await cliente.save();
        res.status(200).json({ ok: true, msg: 'Pago eliminado', cliente });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al eliminar pago', error: error.message });
    }
};
