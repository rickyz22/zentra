const Cliente = require('../models/Cliente');

// Registrar un pago y actualizar estado automáticamente
// Refactorizado para modularización (Audit v2)
exports.registrarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const { monto, metodo, fechaPago, operacionId, conRecargo } = req.body;
        
        // Sprint-1 Security: Validación estricta de monto
        const montoNumerico = Number(monto);
        if (!montoNumerico || montoNumerico <= 0 || !Number.isFinite(montoNumerico)) {
            return res.status(400).json({ ok: false, msg: 'El monto debe ser un número positivo válido' });
        }
        if (montoNumerico > 999999999) {
            return res.status(400).json({ ok: false, msg: 'El monto excede el límite permitido' });
        }

        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        const fechaEfectiva = fechaPago ? new Date(fechaPago + 'T12:00:00') : new Date();

        // Identificar moneda para la nota (Audit v3.4.0)
        let moneda = 'ARS';
        if (operacionId && operacionId !== 'legacy') {
            const op = cliente.operaciones.id(operacionId);
            if (op) moneda = op.moneda || 'ARS';
        } else {
            moneda = cliente.moneda || 'ARS';
        }
        const sym = moneda === 'USD' ? 'U$S' : '$';

        const horaBsAs = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' }) + 'hs';
        const fechaBsAs = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

        if (operacionId && operacionId !== 'legacy') {
            const operacion = cliente.operaciones.id(operacionId);
            if (!operacion) return res.status(404).json({ ok: false, msg: 'Operación no encontrada' });

            const cuotaNro = operacion.historialPagos.length + 1;

            const nuevoPago = {
                monto: Number(monto),
                metodo: metodo || 'Efectivo',
                fecha: fechaEfectiva,
                nota: conRecargo === true || conRecargo === 'true'
                    ? `Pago con recargo por mora del 15% (${sym}${Number(monto).toLocaleString('es-AR')}) vía ${metodo || 'Efectivo'}`
                    : `Pago de ${sym}${Number(monto).toLocaleString('es-AR')} vía ${metodo || 'Efectivo'}`,
                cuotaNro: cuotaNro,
                hora: horaBsAs,
                fechaStr: fechaBsAs,
                moneda: moneda
            };

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
            const cuotaNro = cliente.historialPagos.length + 1;
            const nuevoPago = {
                monto: Number(monto),
                metodo: metodo || 'Efectivo',
                fecha: fechaEfectiva,
                nota: conRecargo === true || conRecargo === 'true'
                    ? `Pago con recargo por mora del 15% (${sym}${Number(monto).toLocaleString('es-AR')}) vía ${metodo || 'Efectivo'}`
                    : `Pago de ${sym}${Number(monto).toLocaleString('es-AR')} vía ${metodo || 'Efectivo'}`,
                cuotaNro: cuotaNro,
                hora: horaBsAs,
                fechaStr: fechaBsAs,
                moneda: moneda
            };

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

// Eliminar un pago del historial (Fullstack Senior v3.9.6)
exports.eliminarPago = async (req, res) => {
    try {
        const { id, pagoId } = req.params;
        // Aceptar operacionId o prestamoId para compatibilidad total con el frontend
        const operacionId = req.body.operacionId || req.body.prestamoId;

        console.log(`🗑️ Solicitud Eliminación: Pago ${pagoId} | Cliente ${id} | Op: ${operacionId || 'Legacy'}`);

        let result;
        if (operacionId && operacionId !== 'legacy') {
            // Usar $pull para eliminar de forma atómica el subdocumento del array
            result = await Cliente.updateOne(
                { _id: id, "operaciones._id": operacionId },
                { $pull: { "operaciones.$.historialPagos": { _id: pagoId } } }
            );
        } else {
            // Lógica Legacy
            result = await Cliente.updateOne(
                { _id: id },
                { $pull: { historialPagos: { _id: pagoId } } }
            );
        }

        console.log(`🗑️ DB Result - modifiedCount: ${result.modifiedCount}`);

        // Tras el $pull, debemos recalcular saldos y estados
        const cliente = await Cliente.findById(id);
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

        if (operacionId && operacionId !== 'legacy') {
            const operacion = cliente.operaciones.id(operacionId);
            if (operacion) {
                const totalPagado = operacion.historialPagos.reduce((total, p) => total + (p.monto || 0), 0);
                const montoTotal = operacion.montoDevolver || operacion.precioVenta || operacion.honorarios || 0;
                operacion.saldoPendiente = Math.max(0, montoTotal - totalPagado);
                
                // Si al borrar un pago vuelve a tener deuda, reactivar
                if (operacion.saldoPendiente > 0) {
                    operacion.estado = 'Activo';
                    
                    // --- Recalcular Fecha de Vencimiento (v3.9.16) ---
                    if (operacion.historialPagos.length > 0) {
                        // Último pago restante
                        const ultPago = [...operacion.historialPagos].sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
                        const nuevaFecha = new Date(ultPago.fecha);
                        operacion.fechaVencimiento = new Date(nuevaFecha.setDate(nuevaFecha.getDate() + 30));
                    } else {
                        // Sin pagos: Fecha Inicio + 30 días
                        const inicio = operacion.fechaAlta || new Date();
                        const nuevaFecha = new Date(inicio);
                        operacion.fechaVencimiento = new Date(nuevaFecha.setDate(nuevaFecha.getDate() + 30));
                    }
                }
                cliente.markModified('operaciones');
            }
        } else {
            // Recalcular Legacy
            cliente.montoPagado = cliente.historialPagos.reduce((total, p) => total + (p.monto || 0), 0);
            const montoTotal = cliente.montoDevolver || cliente.precioVenta || cliente.honorarios || 0;
            if (cliente.montoPagado < montoTotal) {
                cliente.estado = 'Activo';
                
                // --- Recalcular Fecha Legacy (v3.9.16) ---
                if (cliente.historialPagos.length > 0) {
                    const ultPago = [...cliente.historialPagos].sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
                    const nuevaFecha = new Date(ultPago.fecha);
                    cliente.proximoCobro = new Date(nuevaFecha.setDate(nuevaFecha.getDate() + 30));
                } else {
                    const inicio = cliente.fechaIngreso || new Date();
                    const nuevaFecha = new Date(inicio);
                    cliente.proximoCobro = new Date(nuevaFecha.setDate(nuevaFecha.getDate() + 30));
                }
            }
            cliente.markModified('historialPagos');
        }

        // Sincronizar estado global del cliente
        const tieneOpsActivas = cliente.operaciones.some(op => !['Pagado', 'Cancelado', 'Cerrado'].includes(op.estado));
        if (tieneOpsActivas) {
            cliente.estado = 'Activo';
        }

        await cliente.save();
        res.status(200).json({ ok: true, msg: '🗑️ Pago Eliminado', cliente });
    } catch (error) {
        console.error('❌ Error Eliminar Pago:', error);
        res.status(500).json({ ok: false, msg: 'Error al eliminar pago', error: error.message });
    }
};

