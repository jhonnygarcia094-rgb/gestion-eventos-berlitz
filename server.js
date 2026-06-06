// server.js — Servidor principal Express (refactorizado)
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
require('dotenv').config();

// Validar variables de entorno críticas
const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error(`❌ FATAL: Variables de entorno faltantes: ${missingVars.join(', ')}`);
    process.exit(1);
}

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// Seguridad: Helmet (headers HTTP seguros)
// ─────────────────────────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // Desactivar CSP para permitir CDNs (FontAwesome, Google Fonts)
    crossOriginEmbedderPolicy: false
}));

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    process.env.CORS_ORIGIN,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origen no permitido: ${origin}`));
        }
    },
    methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
}));

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting (seguridad contra brute-force)
// ─────────────────────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs:        15 * 60 * 1000, // 15 minutos
    max:             20,              // máximo 20 intentos
    message:         { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders:   false,
    skip: (req) => req.method === 'OPTIONS'
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max:      200,
    message:  { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
    standardHeaders: true,
    legacyHeaders:   false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Body Parsing
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Archivos estáticos
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, './')));

// ─────────────────────────────────────────────────────────────────────────────
// Inicializar Pool de BD al arrancar
// ─────────────────────────────────────────────────────────────────────────────
const { getPool } = require('./utils/db-pool');
getPool()
    .then(() => console.log('✅ Conexión a SQL Server establecida'))
    .catch(err => {
        console.error('❌ Error conectando a SQL Server:', err.message);
        process.exit(1);
    });

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR RUTAS
// ─────────────────────────────────────────────────────────────────────────────
const authRoutes          = require('./routes/auth');
const eventosRoutes       = require('./routes/eventos');
const marketingRoutes     = require('./routes/marketing');
const configuracionRoutes = require('./routes/configuracion');
const permisosRoutes      = require('./routes/permisos');
const dashboardRoutes     = require('./routes/dashboard');

// ─────────────────────────────────────────────────────────────────────────────
// MONTAR RUTAS
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/eventos',       apiLimiter,  eventosRoutes);
app.use('/api/marketing',     apiLimiter,  marketingRoutes);
app.use('/api/configuracion', apiLimiter,  configuracionRoutes);
app.use('/api/permisos',      apiLimiter,  permisosRoutes);
app.use('/api/dashboard',     apiLimiter,  dashboardRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// Rutas de páginas HTML
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/login.html'));

app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status:    'ok',
        timestamp: new Date().toISOString(),
        env:       process.env.NODE_ENV || 'development'
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Manejo global de errores
// ─────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Error no capturado:', err);

    if (err.message && err.message.includes('CORS')) {
        return res.status(403).json({ error: 'Acceso denegado: origen no permitido' });
    }

    res.status(500).json({ error: 'Error interno del servidor' });
});

// 404 para rutas API no encontradas
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─────────────────────────────────────────────────────────────────────────────
// INICIO DEL SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor activo en puerto ${PORT}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
});

module.exports = app;