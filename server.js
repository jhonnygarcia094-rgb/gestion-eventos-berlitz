const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// --- IMPORTAR RUTAS ---
const authRoutes = require('./routes/auth');
const { verificarToken, verificarPermiso } = require('./middleware/auth');
const { registrarAuditoria, obtenerIP } = require('./middleware/auditoria');

// --- CONFIGURACIÓN DE ARCHIVOS ESTÁTICOS ---
app.use(express.static(path.join(__dirname, './')));

// --- CONFIGURACIÓN CORS SEGURA ---
const corsOptions = {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(bodyParser.json());

// --- CONFIGURACIÓN DE CREDENCIALES (Desde variables de entorno) ---
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

// Guardar config en app.locals para acceso en rutas
app.locals.dbConfig = config;

// Validar que existan las variables de entorno necesarias
if (!config.user || !config.password || !config.server || !config.database) {
    console.error('❌ ERROR: Falta configurar las variables de entorno en .env');
    process.exit(1);
}

// --- RUTA PARA CARGAR LA PÁGINA WEB ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- USAR RUTAS DE AUTENTICACIÓN ---
app.use('/api/auth', authRoutes);

// --- OBTENER REGISTROS (CON AUTENTICACIÓN) ---
app.get('/eventos', verificarToken, verificarPermiso('ver'), async (req, res) => {
    try {
        let pool = await sql.connect(config);
        const anioActual = new Date().getFullYear();
        
        let result = await pool.request()
            .input('anio', sql.Int, anioActual)
            .query(`
                SELECT E.ID, E.Descripción, E.Fecha, D.Des_pipeline 
                FROM [hubspot].[EventosyFestivos] E
                LEFT JOIN [hubspot].[Dim_pipeline] D ON E.ID_pipeline = D.ID_pipeline
                WHERE YEAR(E.Fecha) = @anio
                ORDER BY E.Fecha DESC
            `);
        
        res.json(result.recordset);
        await pool.close();
    } catch (err) {
        console.error('Error en /eventos:', err.message);
        res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

// --- OBTENER LISTA DE PIPELINES ---
app.get('/pipelines', verificarToken, async (req, res) => {
    try {
        let pool = await sql.connect(config);
        let result = await pool.request().query(`
            SELECT ID_pipeline, Des_pipeline 
            FROM [hubspot].[Dim_pipeline]
            ORDER BY Des_pipeline ASC
        `);
        res.json(result.recordset);
        await pool.close();
    } catch (err) {
        console.error('Error en /pipelines:', err.message);
        res.status(500).json({ error: 'Error al obtener pipelines' });
    }
});

// --- INSERTAR NUEVO REGISTRO (CON AUTENTICACIÓN) ---
app.post('/eventos', verificarToken, verificarPermiso('crear'), async (req, res) => {
    const { descripcion, fecha, id_pipeline } = req.body;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'];
    
    // Validar datos de entrada
    if (!descripcion || !fecha || !id_pipeline) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    
    try {
        let pool = await sql.connect(config);
        
        let insertResult = await pool.request()
            .input('desc', sql.NVarChar, descripcion)
            .input('fecha', sql.Date, fecha)
            .input('pipe', sql.Int, id_pipeline)
            .query(`
                INSERT INTO [hubspot].[EventosyFestivos] (Descripción, Fecha, ID_pipeline)
                OUTPUT INSERTED.ID
                VALUES (@desc, @fecha, @pipe)
            `);
        
        const idEvento = insertResult.recordset[0].ID;
        
        // Registrar en auditoría
        await registrarAuditoria(pool, req.usuario.id, 'CREAR_EVENTO', 'EventosyFestivos', idEvento, `Evento creado: ${descripcion}`, null, { descripcion, fecha, id_pipeline }, ip, userAgent, 'EXITOSO');
        
        res.status(201).json({ mensaje: 'Evento guardado exitosamente', id: idEvento });
        await pool.close();
    } catch (err) {
        console.error('Error al insertar:', err.message);
        res.status(500).json({ error: 'Error al guardar el registro' });
    }
});

// --- ELIMINAR UN REGISTRO (CON AUTENTICACIÓN) ---
app.post('/eliminar-evento', verificarToken, verificarPermiso('eliminar'), async (req, res) => {
    const { id } = req.body;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'];
    
    // Validar que el ID sea un número
    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido' });
    }
    
    try {
        let pool = await sql.connect(config);
        
        // Obtener evento antes de eliminar (para auditoría)
        let eventoActual = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT ID, Descripción FROM [hubspot].[EventosyFestivos] WHERE ID = @id');
        
        if (eventoActual.recordset.length === 0) {
            await pool.close();
            return res.status(404).json({ error: 'Evento no encontrado' });
        }
        
        const evento = eventoActual.recordset[0];
        
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM [hubspot].[EventosyFestivos] WHERE ID = @id');
        
        // Registrar en auditoría
        await registrarAuditoria(pool, req.usuario.id, 'ELIMINAR_EVENTO', 'EventosyFestivos', id, `Evento eliminado: ${evento.Descripción}`, { id: evento.ID, descripcion: evento.Descripción }, null, ip, userAgent, 'EXITOSO');
        
        res.status(200).json({ mensaje: 'Evento eliminado' });
        await pool.close();
    } catch (err) {
        console.error('Error al eliminar:', err.message);
        res.status(500).json({ error: 'Error al eliminar el registro' });
    }
});

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err, req, res, next) => {
    console.error('Error no capturado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor activo en puerto ${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});