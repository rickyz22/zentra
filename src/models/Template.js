const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    titulo: {
        type: String,
        required: [true, 'El título es obligatorio']
    },
    cuerpo: {
        type: String,
        required: [true, 'El cuerpo del mensaje es obligatorio']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Template', templateSchema);
