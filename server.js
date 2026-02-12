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
    createdAt: { type: Date, default: Date.now },
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }] // Grupos a los que pertenece
});

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    members: [{ type: String }], // Array de usernames
    admins: [{ type: String }], // Array de usernames que son admins del grupo
    createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true }, // Quién lo envía
    senderId: { type: String },
    text: { type: String, required: true }, // El contenido del mensaje
    status: { type: String, enum: ['sent', 'draft', 'deleted_everyone'], default: 'sent' }, // Estado del mensaje
    starred: { type: Boolean, default: false }, // ¿Es favorito?
    deletedFor: [{ type: String }], // Lista de usuarios que han "borrado" este mensaje de su vista
    timestamp: { type: Date, default: Date.now },
    // Nuevos campos para mensajería avanzada
    recipient: { type: String }, // Si es privado, aquí va el username del destino
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' } // Si es de grupo, aquí va el ID
});

// Creamos los modelos a partir de los esquemas
const User = mongoose.model('User', userSchema);
const Group = mongoose.model('Group', groupSchema);
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

// 3.5 Obtener grupos del usuario (NUEVO)
app.get('/api/groups', async (req, res) => {
    try {
        const username = req.query.username;
        if (!username) return res.status(400).json({ message: 'Falta el username' });
        
        const groups = await Group.find({ members: username });
        res.json(groups);
    } catch (error) {
        res.status(500).json({ message: 'Error al recuperar grupos.' });
    }
});

// 3.6 Crear un grupo (NUEVO)
app.post('/api/groups', async (req, res) => {
    try {
        const { name, creator, members } = req.body;
        
        // Aseguramos que el creador esté en los miembros y sea admin
        const initialMembers = [...new Set([...members, creator])];
        
        const newGroup = new Group({
            name,
            members: initialMembers,
            admins: [creator]
        });

        await newGroup.save();
        
        // Actualizamos a los usuarios para que sepan que están en este grupo (opcional redundancia, pero útil)
        await User.updateMany(
            { username: { $in: initialMembers } },
            { $push: { groups: newGroup._id } }
        );

        res.status(201).json(newGroup);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear el grupo' });
    }
});


// 4. Obtener mensajes (MODIFICADO)
// Se usa para cargar el chat al inicio, ahora con soporte para privados y grupos
app.get('/api/messages', async (req, res) => {
    try {
        const { username, recipient, groupId } = req.query;

        let query = {};

        if (groupId) {
            // Mensajes de un grupo específico
            query = { groupId: groupId };
        } else if (username && recipient) {
            // Mensajes privados entre dos usuarios
            query = {
                $or: [
                    { sender: username, recipient: recipient },
                    { sender: recipient, recipient: username }
                ]
            };
        } else {
            // Mensajes globales (Públicos)
            // Son aquellos que NO tienen recipient NI groupId
            query = {
                recipient: { $exists: false },
                groupId: { $exists: false }
            };
        }

        // Los ordenamos por fecha para que salgan en orden cronológico
        const messages = await Message.find(query).sort({ timestamp: 1 });
        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al recuperar los mensajes.' });
    }
});


// 5. Enviar un nuevo mensaje (MODIFICADO)
app.post('/api/messages', async (req, res) => {
    try {
        const { sender, senderId, text, status, recipient, groupId } = req.body;

        // VÁLIDACIÓN DE PERMISOS
        // Si es mensaje GLOBAL (sin destinatario ni grupo), verificamos si es admin
        if (!recipient && !groupId) {
             // Verificamos si el usuario tiene ".admin" en su nombre
             // OJO: En un sistema real esto se haría mirando un campo "role" en la base de datos,
             // pero seguimos la instrucción literal del usuario.
             if (!sender.includes('.admin')) {
                 return res.status(403).json({ 
                     message: 'Solo los administradores (usuarios con .admin) pueden enviar mensajes al canal público.' 
                 });
             }
        }

        const newMessage = new Message({
            sender,
            senderId,
            text,
            status: status || 'sent', // Si no se especifica, se asume que es "enviado"
            recipient, // Opcional
            groupId // Opcional
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
