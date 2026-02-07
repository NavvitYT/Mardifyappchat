const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

// --- 1. CONFIGURACIÓN DE CARPETAS (Para que Render no de error) ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// --- 2. CONFIGURACIÓN DE ALMACENAMIENTO DE FOTOS ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Guarda la foto con un nombre único: id-fecha.jpg
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 3. MIDDLEWARES ---
app.use(cors());
app.use(express.json());
// Esto hace que las fotos sean accesibles desde el navegador (ej: midominio.com/uploads/foto.jpg)
app.use('/uploads', express.static(uploadDir));

// --- 4. RUTAS (ENDPOINTS) ---

/**
 * ENVIAR MENSAJE
 * Si el usuario no está en Neon o no tiene perfil, lanza el aviso NEED_PROFILE
 */
app.post('/api/chat/send', async (req, res) => {
    try {
        const { nick, text } = req.body;

        // Buscamos si ya existe en nuestra DB de Neon
        let user = await prisma.appUser.findUnique({
            where: { original_nick: nick }
        });

        // Si NO existe en Neon, lo creamos como "fantasma" (inactivo)
        // Aquí es donde asumes que si llegó aquí es porque pasó el check de tu disco de 128GB
        if (!user) {
            user = await prisma.appUser.create({
                data: {
                    original_nick: nick,
                    is_active: false
                }
            });
        }

        // Si el usuario existe pero no ha configurado su foto/nombre...
        if (!user.is_active) {
            return res.json({ 
                action: "NEED_PROFILE", 
                userId: user.id,
                message: "Debes configurar tu perfil antes de hablar." 
            });
        }

        // Si está activo, guardamos el mensaje
        const nuevoMensaje = await prisma.chatMessage.create({
            data: {
                text: text,
                user_id: user.id
            },
            include: { user: true } // Incluye los datos del usuario para el frontend
        });

        res.json({ status: "SENT", mensaje: nuevoMensaje });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno en el chat" });
    }
});

/**
 * CONFIGURAR PERFIL (EL QUE FALTABA)
 * Recibe el ID, el nuevo nombre y la foto física
 */
app.post('/api/user/setup', upload.single('photo'), async (req, res) => {
    try {
        const { userId, newName } = req.body;
        
        // Generamos la URL de la foto para guardarla en la DB
        const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

        const updatedUser = await prisma.appUser.update({
            where: { id: parseInt(userId) },
            data: {
                display_name: newName,
                avatar_url: photoPath,
                is_active: true // ¡Ahora ya puede chatear!
            }
        });

        res.json({ status: "SUCCESS", user: updatedUser });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar el perfil" });
    }
});

/**
 * OBTENER HISTORIAL
 */
app.get('/api/chat', async (req, res) => {
    const mensajes = await prisma.chatMessage.findMany({
        include: { user: true },
        orderBy: { created_at: 'asc' }
    });
    res.json(mensajes);
});

// --- 5. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📁 Carpeta de subidas lista en: ${uploadDir}`);
});
