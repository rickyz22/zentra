const Template = require('../models/Template');

exports.getTemplates = async (req, res) => {
    try {
        const templates = await Template.find().sort({ createdAt: -1 });
        res.json({ ok: true, templates });
    } catch (error) {
        console.error('Error al obtener plantillas:', error);
        res.status(500).json({ ok: false, message: 'Error interno de servidor' });
    }
};

exports.createTemplate = async (req, res) => {
    try {
        const { titulo, cuerpo } = req.body;
        if (!titulo || !cuerpo) {
            return res.status(400).json({ ok: false, message: 'Título y cuerpo son obligatorios' });
        }
        
        const newTemplate = new Template({ titulo, cuerpo });
        await newTemplate.save();
        res.status(201).json({ ok: true, template: newTemplate });
    } catch (error) {
        console.error('Error al crear plantilla:', error);
        res.status(500).json({ ok: false, message: 'Error interno de servidor' });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, cuerpo } = req.body;
        
        const template = await Template.findByIdAndUpdate(id, { titulo, cuerpo }, { new: true, runValidators: true });
        if (!template) {
            return res.status(404).json({ ok: false, message: 'Plantilla no encontrada' });
        }
        res.json({ ok: true, template });
    } catch (error) {
        console.error('Error al actualizar plantilla:', error);
        res.status(500).json({ ok: false, message: 'Error interno de servidor' });
    }
};

exports.deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        await Template.findByIdAndDelete(id);
        res.json({ ok: true, message: 'Plantilla eliminada' });
    } catch (error) {
        console.error('Error al borrar plantilla:', error);
        res.status(500).json({ ok: false, message: 'Error interno de servidor' });
    }
};
