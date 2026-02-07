// Cargamos las variables de entorno. Esto es importante para proteger datos sensibles
// como las contraseñas de la base de datos o claves secretas.
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
// Si no hay un puerto definido en las variables de entorno, usamos el 3000 por defecto.
const PORT = process.env.PORT || 3000;


// --- MIDDLEWARES ---
app.use(cors()); // Permite que el frontend se comunique con este backend sin problemas de dominios cruzados
app.use(express.json()); // Nos permite recibir datos en formato JSON en las peticiones POST
app.use(express.static(__dirname)); // Sirve los archivos estáticos (HTML, CSS, JS) de la carpeta actual


// --- BASE DE DATOS (MongoDB) ---
// Intentamos obtener la URI de conexión desde el archivo .env
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.warn('⚠️ OJO: No encontré la variable MONGODB_URI en el archivo .env');
    console.warn('Usaré la base de datos local por defecto, pero asegúrate de crear el archivo .env para producción.');
}

// Conectamos a MongoDB. Si falla, mostramos el error en consola para poder depurarlo.
mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/schoolconnect')
    .then(() => console.log('✅ ¡Conectado exitosamente a la base de datos MongoDB!'))
    .catch(err => console.error('❌ Hubo un problema al conectar con MongoDB:', err));


// --- MODELOS DE DATOS ---
// Aquí definimos qué estructura tendrán nuestros datos.
// Es como el plano de construcción de nuestros objetos.

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // El nombre de usuario no se puede repetir
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now } // Se guarda la fecha de creación automáticamente
});

const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true }, // Quién lo envía
    senderId: { type: String },
    text: { type: String, required: true }, // El contenido del mensaje
    status: { type: String, enum: ['sent', 'draft', 'deleted_everyone'], default: 'sent' }, // Estado del mensaje
    starred: { type: Boolean, default: false }, // ¿Es favorito?
    deletedFor: [{ type: String }], // Lista de usuarios que han "borrado" este mensaje de su vista
    timestamp: { type: Date, default: Date.now }
});

// Creamos los modelos a partir de los esquemas
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);


// --- RUTAS DE LA API (ENDPOINTS) ---

// 1. Registro de nuevos usuarios
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Primero verificamos si ya existe alguien con ese nombre
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Ese nombre de usuario ya está en uso, prueba con otro.' });
        }

        // Si no existe, creamos el nuevo usuario
        const newUser = new User({
            username,
            password, // Nota: En una app real, aquí deberíamos encriptar la contraseña (hashing)
            email: `${username}@schoolconnect.app` // Generamos un email ficticio por ahora
        });

        await newUser.save(); // Guardamos en la base de datos
        res.status(201).json({ message: '¡Usuario registrado correctamente!', user: newUser });
    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ message: 'Algo salió mal en el servidor al intentar registrarte.' });
    }
});


// 2. Inicio de sesión (Login)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Buscamos al usuario que coincida con nombre y contraseña
        const user = await User.findOne({ username, password });

        if (!user) {
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos. Inténtalo de nuevo.' });
        }

        // Quitamos la contraseña antes de devolver los datos al cliente por seguridad
        const { password: _, ...userSafe } = user.toObject();
        res.json({ message: 'Login exitoso', user: userSafe });
    } catch (error) {
        res.status(500).json({ message: 'Ocurrió un error en el servidor al intentar iniciar sesión.' });
    }
});


// 3. Obtener lista de usuarios
// Esto sirve para mostrar la lista de contactos en el panel izquierdo
app.get('/api/users', async (req, res) => {
    try {
        // Solo devolvemos nombre y email, no necesitamos más datos sensibles
        const users = await User.find({}, 'username email');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'No se pudieron cargar los usuarios.' });
    }
});


// 4. Obtener todos los mensajes
// Se usa para cargar el chat al inicio
app.get('/api/messages', async (req, res) => {
    try {
        // Los ordenamos por fecha para que salgan en orden cronológico
        const messages = await Message.find().sort({ timestamp: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Error al recuperar los mensajes.' });
    }
});


// 5. Enviar un nuevo mensaje
app.post('/api/messages', async (req, res) => {
    try {
        const { sender, senderId, text, status } = req.body;

        const newMessage = new Message({
            sender,
            senderId,
            text,
            status: status || 'sent' // Si no se especifica, se asume que es "enviado"
        });

        await newMessage.save();
        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ message: 'Hubo un problema al enviar el mensaje.' });
    }
});


// 6. Actualizar un mensaje (Borrar, Destacar, etc.)
// Usamos PATCH porque solo queremos cambiar algunos campos, no todo el mensaje
app.patch('/api/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Si la petición es para borrar "solo para mí"
        if (updates.deletedForUser) {
            await Message.findByIdAndUpdate(id, {
                $addToSet: { deletedFor: updates.deletedForUser } // Añadimos el usuario a la lista de "quienes lo borraron"
            });
            delete updates.deletedForUser; // Ya lo procesamos, así que lo quitamos del objeto de actualizaciones
        }

        // Aplicamos cualquier otra actualización (como destacar)
        const updatedMessage = await Message.findByIdAndUpdate(id, updates, { new: true });
        res.json(updatedMessage);
    } catch (error) {
        res.status(500).json({ message: 'No se pudo actualizar el mensaje.' });
    }
});


// Arrancamos el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo y escuchando en http://localhost:${PORT}`);
    console.log(`Presiona Ctrl + C para detenerlo.`);
});
