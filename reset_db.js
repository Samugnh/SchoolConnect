require('dotenv').config();
const mongoose = require('mongoose');

// Usamos la misma URI que en server.js
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ Error: No se encontró MONGODB_URI en el archivo .env');
    process.exit(1);
}

const resetDatabase = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB...');

        // Definimos los modelos (o accedemos a las colecciones directamente)
        // Nota: Al usar mongoose.connection.dropCollection, borramos la colección entera.

        const collections = await mongoose.connection.db.collections();

        for (let collection of collections) {
            console.log(`🗑️ Eliminando colección: ${collection.collectionName}`);
            await collection.drop();
        }

        console.log('✨ Base de datos limpiada exitosamente.');

    } catch (error) {
        console.error('❌ Error al limpiar la base de datos:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Desconectado.');
        process.exit();
    }
};

resetDatabase();
