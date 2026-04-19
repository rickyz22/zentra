const mongoose = require('mongoose');
const Cliente = require('../src/models/Cliente');
require('dotenv').config();

const mongoURI = "mongodb://admin_jony:jony1234@ac-ur15yb9-shard-00-00.rke4rvj.mongodb.net:27017,ac-ur15yb9-shard-00-01.rke4rvj.mongodb.net:27017,ac-ur15yb9-shard-00-02.rke4rvj.mongodb.net:27017/crm_jony?ssl=true&replicaSet=atlas-tocu41-shard-0&authSource=admin&retryWrites=true&w=majority";

mongoose.connect(mongoURI)
    .then(async () => {
        const docs = await Cliente.find();
        console.log('--- CLIENTES EN BD ---');
        docs.forEach(d => console.log(`${d._id} - ${d.nombre}`));
        console.log('----------------------');
        process.exit();
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
