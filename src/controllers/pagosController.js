const Cliente = require('../models/Cliente');

// Registrar un pago y actualizar estado automáticamente
// Refactorizado para modularización (Audit v2)
exports.registrarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const { monto, metodo } = req.body;
        
        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        const nuevoPago = {
            monto: Number(monto),
            metodo: metodo || 'Efectivo',
            fecha: new Date()
        };

        cliente.historialPagos.push(nuevoPago);
        
        // Recalcular monto pagado total
        cliente.montoPagado = cliente.historialPagos.reduce((total, p) => total + p.monto, 0);

        // Actualización automática de estado para Préstamos y Electro
        if (cliente.categoria === 'Préstamos' || cliente.categoria === 'Electrodomésticos') {
            const totalADevolver = cliente.categoria === 'Préstamos' ? cliente.montoDevolver : cliente.precioVenta;
            
            if (cliente.montoPagado >= totalADevolver) {
                cliente.estado = 'Pagado';
            } else {
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
        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        cliente.historialPagos = cliente.historialPagos.filter(p => p._id.toString() !== pagoId);
        
        // Recalcular monto pagado total
        cliente.montoPagado = cliente.historialPagos.reduce((total, p) => total + p.monto, 0);

        // Re-evaluar estado
        if (cliente.categoria === 'Préstamos' || cliente.categoria === 'Electrodomésticos') {
            const totalADevolver = cliente.categoria === 'Préstamos' ? cliente.montoDevolver : cliente.precioVenta;
            if (cliente.montoPagado < totalADevolver) {
                cliente.estado = 'Activo';
            }
        }

        await cliente.save();
        res.status(200).json({ ok: true, msg: 'Pago eliminado', cliente });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al eliminar pago', error: error.message });
    }
};
