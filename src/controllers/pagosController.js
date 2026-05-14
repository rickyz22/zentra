const Cliente = require('../models/Cliente');

// Registrar un pago y actualizar estado automáticamente
// Refactorizado para modularización (Audit v2)
exports.registrarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const { monto, metodo, fechaPago, prestamoId } = req.body;
        
        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        const fechaEfectiva = fechaPago ? new Date(fechaPago) : new Date();

        const nuevoPago = {
            monto: Number(monto),
            metodo: metodo || 'Efectivo',
            fecha: fechaEfectiva,
            nota: `Pago de $${Number(monto).toLocaleString('es-AR')} vía ${metodo || 'Efectivo'}`
        };

        if (prestamoId && prestamoId !== 'legacy') {
            const prestamo = cliente.prestamos.id(prestamoId);
            if (!prestamo) return res.status(404).json({ ok: false, msg: 'Préstamo no encontrado' });

            prestamo.historialPagos.push(nuevoPago);
            const totalPagado = prestamo.historialPagos.reduce((total, p) => total + p.monto, 0);
            prestamo.saldoPendiente = prestamo.montoDevolver - totalPagado;

            if (prestamo.saldoPendiente <= 0) {
                prestamo.estado = 'Cancelado';
                prestamo.saldoPendiente = 0;
            } else {
                prestamo.estado = 'Activo';
            }
            cliente.markModified('prestamos');
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
        const { prestamoId } = req.body; // Requiere que el body envíe prestamoId si es nuevo formato

        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        if (prestamoId && prestamoId !== 'legacy') {
            const prestamo = cliente.prestamos.id(prestamoId);
            if (!prestamo) return res.status(404).json({ ok: false, msg: 'Préstamo no encontrado' });

            prestamo.historialPagos = prestamo.historialPagos.filter(p => p._id.toString() !== pagoId);
            const totalPagado = prestamo.historialPagos.reduce((total, p) => total + p.monto, 0);
            prestamo.saldoPendiente = prestamo.montoDevolver - totalPagado;

            if (prestamo.saldoPendiente > 0) {
                prestamo.estado = 'Activo';
            } else {
                prestamo.estado = 'Cancelado';
            }
            cliente.markModified('prestamos');
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
