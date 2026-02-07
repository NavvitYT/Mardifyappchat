const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// --- DIRECCIONES API ---

// 1. Intentar enviar mensaje (Verifica si existe en Neon)
app.post('/api/chat/send', async (req, res) => {
    const { nick, text } = req.body;

    let user = await prisma.appUser.findUnique({ where: { original_nick: nick } });

    // Si no está en Neon, lo creamos pero "inactivo"
    if (!user) {
        user = await prisma.appUser.create({
            data: { original_nick: nick, is_active: false }
        });
    }

    // Si está inactivo, le decimos al frontend que muestre el Popup
    if (!user.is_active) {
        return res.json({ action: "NEED_PROFILE", userId: user.id });
    }

    // Si ya es activo, guardamos el mensaje
    const msg = await prisma.chatMessage.create({
        data: { text, user_id: user.id }
    });
    res.json({ status: "SENT", msg });
});

// 2. Guardar perfil (El popup de nombre y foto)
app.post('/api/user/setup', upload.single('photo'), async (req, res) => {
    const { userId, newName } = req.body;
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const updatedUser = await prisma.appUser.update({
        where: { id: parseInt(userId) },
        data: {
            display_name: newName,
            avatar_url: photoUrl,
            is_active: true
        }
    });
    res.json({ status: "SUCCESS", user: updatedUser });
});

// 3. Obtener el chat
app.get('/api/chat', async (req, res) => {
    const messages = await prisma.chatMessage.findMany({
        include: { user: true },
        orderBy: { created_at: 'asc' }
    });
    res.json(messages);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
