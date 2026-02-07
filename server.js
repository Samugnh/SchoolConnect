require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));


const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.warn('⚠️ ADVERTENCIA: No se proporcionó MONGODB_URI en .env');
    console.warn('Por favor, crea un archivo .env con tu cadena de conexión.');
}

mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/schoolconnect')
    .then(() => console.log('✅ Conectado exitosamente a MongoDB'))
    .catch(err => console.error('❌ Error de conexión a MongoDB:', err));


const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    senderId: { type: String },
    text: { type: String, required: true },
    status: { type: String, enum: ['sent', 'draft', 'deleted_everyone'], default: 'sent' },
    starred: { type: Boolean, default: false },
    deletedFor: [{ type: String }],
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);


app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;


        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'El usuario ya existe' });
        }

        const newUser = new User({
            username,
            password,
            email: `${username}@schoolconnect.app`
        });

        await newUser.save();
        res.status(201).json({ message: 'Usuario registrado exitosamente', user: newUser });
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor', error: error.message });
    }
});


app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username, password });
        if (!user) {
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }


        const { password: _, ...userSafe } = user.toObject();
        res.json({ message: 'Login exitoso', user: userSafe });
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor', error: error.message });
    }
});


app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username email');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
});


app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener mensajes' });
    }
});


app.post('/api/messages', async (req, res) => {
    try {
        const { sender, senderId, text, status } = req.body;
        const newMessage = new Message({
            sender,
            senderId,
            text,
            status: status || 'sent'
        });
        await newMessage.save();
        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ message: 'Error al enviar mensaje' });
    }
});


app.patch('/api/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;


        if (updates.deletedForUser) {
            await Message.findByIdAndUpdate(id, {
                $addToSet: { deletedFor: updates.deletedForUser }
            });
            delete updates.deletedForUser;
        }

        const updatedMessage = await Message.findByIdAndUpdate(id, updates, { new: true });
        res.json(updatedMessage);
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar mensaje' });
    }
});


app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});


