// routes/eventos.js — CRUD de Eventos y Festivos
const express = require('express');
const { getPool, sql } = require('../utils/db-pool');
const { verificarToken, verificarPermisoModulo } = require('../middleware/auth');
const { registrarAuditoria, obtenerIP } = require('../middleware/auditoria');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /eventos — Listar eventos (con filtros opcionales)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', verificarToken, verificarPermisoModulo('eventos', 'ver'), async (req, res) => {
    try {
        const pool = await getPool();
        const { anio, mes, pipeline, desc } = req.query;
        const anioFiltro = anio ? parseInt(anio) : new Date().getFullYear();

        let whereExtra = '';
        const request = pool.request().input('anio', sql.Int, anioFiltro);

        if (mes) {
            whereExtra += ' AND MONTH(E.Fecha) = @mes';
            request.input('mes', sql.Int, parseInt(mes));
        }
        if (pipeline) {
            whereExtra += ' AND D.Des_pipeline = @pipeline';
            request.input('pipeline', sql.NVarChar, pipeline);
        }
        if (desc) {
            whereExtra += ' AND E.Descripción LIKE @desc';
            request.input('desc', sql.NVarChar, `%${desc}%`);
        }

        const result = await request.query(`
            SELECT E.ID, E.Descripción, E.Fecha, D.Des_pipeline, D.ID_pipeline
            FROM [hubspot].[EventosyFestivos] E
            LEFT JOIN [hubspot].[Dim_pipeline] D ON E.ID_pipeline = D.ID_pipeline
            WHERE YEAR(E.Fecha) = @anio ${whereExtra}
            ORDER BY E.Fecha ASC
        `);

        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET /eventos:', err.message);
        return res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /eventos — Crear nuevo evento
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', verificarToken, verificarPermisoModulo('eventos', 'crear'), async (req, res) => {
    const { descripcion, fecha, id_pipeline } = req.body;
    const ip = obtenerIP(req);

    if (!descripcion || !fecha || !id_pipeline) {
        return res.status(400).json({ error: 'Descripción, fecha e id_pipeline son requeridos' });
    }

    // Validar fecha
    const fechaDate = new Date(fecha);
    if (isNaN(fechaDate.getTime())) {
        return res.status(400).json({ error: 'Fecha inválida' });
    }

    try {
        const pool = await getPool();

        const insertResult = await pool.request()
            .input('desc',  sql.NVarChar, descripcion.trim())
            .input('fecha', sql.Date,     fecha)
            .input('pipe',  sql.Int,      parseInt(id_pipeline))
            .query(`
                INSERT INTO [hubspot].[EventosyFestivos] (Descripción, Fecha, ID_pipeline)
                OUTPUT INSERTED.ID
                VALUES (@desc, @fecha, @pipe)
            `);

        const idEvento = insertResult.recordset[0].ID;

        await registrarAuditoria(pool, req.usuario.id, 'CREAR_EVENTO', 'EventosyFestivos', idEvento,
            `Evento creado: ${descripcion}`, null, { descripcion, fecha, id_pipeline },
            ip, req.headers['user-agent'], 'EXITOSO');

        return res.status(201).json({ mensaje: 'Evento guardado exitosamente', id: idEvento });
    } catch (err) {
        console.error('Error POST /eventos:', err.message);
        return res.status(500).json({ error: 'Error al guardar el evento' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /eventos/:id — Editar evento
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', verificarToken, verificarPermisoModulo('eventos', 'editar'), async (req, res) => {
    const { id } = req.params;
    const { descripcion, fecha, id_pipeline } = req.body;
    const ip = obtenerIP(req);

    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        const pool = await getPool();

        // Obtener estado anterior para auditoría
        const anterior = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT E.ID, E.Descripción, E.Fecha, E.ID_pipeline, D.Des_pipeline
                FROM [hubspot].[EventosyFestivos] E
                LEFT JOIN [hubspot].[Dim_pipeline] D ON E.ID_pipeline = D.ID_pipeline
                WHERE E.ID = @id
            `);

        if (anterior.recordset.length === 0) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        const eventoAnterior = anterior.recordset[0];

        await pool.request()
            .input('id',    sql.Int,      id)
            .input('desc',  sql.NVarChar, descripcion  || eventoAnterior.Descripción)
            .input('fecha', sql.Date,     fecha        || eventoAnterior.Fecha)
            .input('pipe',  sql.Int,      id_pipeline  ? parseInt(id_pipeline) : eventoAnterior.ID_pipeline)
            .query(`
                UPDATE [hubspot].[EventosyFestivos]
                SET Descripción = @desc, Fecha = @fecha, ID_pipeline = @pipe
                WHERE ID = @id
            `);

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_EVENTO', 'EventosyFestivos', id,
            `Evento editado: ${eventoAnterior.Descripción}`, eventoAnterior,
            { descripcion, fecha, id_pipeline }, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Evento actualizado exitosamente' });
    } catch (err) {
        console.error('Error PUT /eventos/:id:', err.message);
        return res.status(500).json({ error: 'Error al actualizar el evento' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /eventos/:id — Eliminar evento
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', verificarToken, verificarPermisoModulo('eventos', 'eliminar'), async (req, res) => {
    const { id } = req.params;
    const ip = obtenerIP(req);

    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        const pool = await getPool();

        const evento = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT ID, Descripción FROM [hubspot].[EventosyFestivos] WHERE ID = @id');

        if (evento.recordset.length === 0) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        const eventoData = evento.recordset[0];

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM [hubspot].[EventosyFestivos] WHERE ID = @id');

        await registrarAuditoria(pool, req.usuario.id, 'ELIMINAR_EVENTO', 'EventosyFestivos', id,
            `Evento eliminado: ${eventoData.Descripción}`, eventoData, null,
            ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Evento eliminado exitosamente' });
    } catch (err) {
        console.error('Error DELETE /eventos/:id:', err.message);
        return res.status(500).json({ error: 'Error al eliminar el evento' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /eventos/pipelines — Lista de pipelines/países
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pipelines', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT ID_pipeline, Des_pipeline 
            FROM [hubspot].[Dim_pipeline]
            ORDER BY Des_pipeline ASC
        `);
        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET /eventos/pipelines:', err.message);
        return res.status(500).json({ error: 'Error al obtener pipelines' });
    }
});

module.exports = router;
