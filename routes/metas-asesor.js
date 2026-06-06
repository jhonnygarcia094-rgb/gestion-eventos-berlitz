// routes/metas-asesor.js — CRUD para Metas de Asesor
const express = require('express');
const { getPool, sql } = require('../utils/db-pool');
const { verificarToken, verificarPermisoModulo } = require('../middleware/auth');
const { registrarAuditoria, obtenerIP } = require('../middleware/auditoria');

const router = express.Router();

// GET /metas-asesor/owners — Obtener lista de asesores desde Dim_Owners
router.get('/owners', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT OwnerId, 
                   CONCAT(FirstName, ' ', LastName) as OwnerName,
                   Email
            FROM [hubspot].[Dim_Owners] 
            WHERE OwnerId IS NOT NULL
            ORDER BY OwnerName
        `);
        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET /metas-asesor/owners:', err.message);
        return res.status(500).json({ error: 'Error al obtener asesores' });
    }
});

// GET /metas-asesor/divisas — Obtener lista de monedas desde DimDivisas
router.get('/divisas', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT ID_Divisa, deal_currency_code, Moneda
            FROM [hubspot].[DimDivisas]
            ORDER BY Moneda
        `);
        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET /metas-asesor/divisas:', err.message);
        return res.status(500).json({ error: 'Error al obtener divisas' });
    }
});

// GET /metas-asesor — Listar metas
router.get('/', verificarToken, verificarPermisoModulo('operaciones_metas', 'ver'), async (req, res) => {
    try {
        const pool = await getPool();
        const { periodo, pipeline, asesor } = req.query;

        let where = '1=1';
        const request = pool.request();

        if (periodo)  { where += ' AND m.ID_Periodo = @periodo'; request.input('periodo', sql.Date, periodo); }
        if (pipeline) { where += ' AND m.ID_pipeline = @pipeline'; request.input('pipeline', sql.Int, parseInt(pipeline)); }
        if (asesor)   { where += ' AND m.Asesor = @asesor'; request.input('asesor', sql.NVarChar, asesor); }

        const result = await request.query(`
            SELECT m.ID_MetaAsesor, m.ID_Periodo, m.Pais, m.ID_pipeline, 
                   m.Asesor, m.CORREO, m.Moneda, m.Recaudo, m.NumeroVentas, m.Tier,
                   p.Des_pipeline,
                   m.CreadoPor, m.ActualizadoPor, m.FechaCreacion, m.FechaActualizacion
            FROM [hubspot].[MetasAsesor] m
            LEFT JOIN [hubspot].[Dim_pipeline] p ON m.ID_pipeline = p.ID_pipeline
            WHERE ${where}
            ORDER BY m.ID_Periodo DESC, p.Des_pipeline ASC, m.Asesor ASC
        `);

        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET /metas-asesor:', err.message);
        return res.status(500).json({ error: 'Error al obtener metas de asesor' });
    }
});

// POST /metas-asesor — Crear meta
router.post('/', verificarToken, verificarPermisoModulo('operaciones_metas', 'crear'), async (req, res) => {
    const { id_periodo, id_pipeline, asesor, correo, moneda, recaudo, numero_ventas, tier } = req.body;
    const ip = obtenerIP(req);

    if (!id_periodo || !id_pipeline || !asesor || !moneda) {
        return res.status(400).json({ error: 'Período, País, Asesor y Moneda son requeridos' });
    }

    try {
        const pool = await getPool();

        // Obtener nombre del país desde pipeline
        const pipeResult = await pool.request()
            .input('pipeId', sql.Int, parseInt(id_pipeline))
            .query('SELECT Des_pipeline FROM [hubspot].[Dim_pipeline] WHERE ID_pipeline = @pipeId');
        const pais = pipeResult.recordset.length > 0 ? pipeResult.recordset[0].Des_pipeline : '';

        // Validación de unicidad (Periodo + Pipeline + Asesor + Moneda)
        const check = await pool.request()
            .input('periodo', sql.Date, id_periodo)
            .input('pipeline', sql.Int, parseInt(id_pipeline))
            .input('asesor', sql.NVarChar, asesor.trim())
            .input('moneda', sql.NVarChar, moneda.trim())
            .query('SELECT 1 FROM [hubspot].[MetasAsesor] WHERE ID_Periodo = @periodo AND ID_pipeline = @pipeline AND Asesor = @asesor AND Moneda = @moneda');
        
        if (check.recordset.length > 0) {
            return res.status(400).json({ error: 'Ya existe una meta registrada para este período, país, asesor y moneda.' });
        }

        const result = await pool.request()
            .input('periodo',       sql.Date,          id_periodo)
            .input('pais',          sql.NVarChar,      pais)
            .input('pipeline',      sql.Int,           parseInt(id_pipeline))
            .input('asesor',        sql.NVarChar,      asesor.trim())
            .input('correo',        sql.NVarChar,      (correo || '').trim())
            .input('moneda',        sql.NVarChar,      moneda.trim())
            .input('recaudo',       sql.Decimal(18,2), recaudo ? parseFloat(recaudo) : 0)
            .input('numVentas',     sql.Int,           numero_ventas ? parseInt(numero_ventas) : 0)
            .input('tier',          sql.Int,           tier ? parseInt(tier) : 0)
            .input('user',          sql.Int,           req.usuario.id)
            .query(`
                INSERT INTO [hubspot].[MetasAsesor] 
                    (ID_Periodo, Pais, ID_pipeline, Asesor, CORREO, Moneda, Recaudo, NumeroVentas, Tier, CreadoPor, Fecha_Carga, FechaActualizacion)
                OUTPUT INSERTED.ID_MetaAsesor
                VALUES (@periodo, @pais, @pipeline, @asesor, @correo, @moneda, @recaudo, @numVentas, @tier, @user, GETDATE(), GETDATE())
            `);

        const idMeta = result.recordset[0].ID_MetaAsesor;

        await registrarAuditoria(pool, req.usuario.id, 'CREAR_META_ASESOR', 'MetasAsesor', idMeta,
            `Meta Asesor creada: ${asesor} - ${pais} - ${id_periodo}`,
            null, req.body, ip, req.headers['user-agent'], 'EXITOSO');

        return res.status(201).json({ mensaje: 'Meta registrada exitosamente', id: idMeta });
    } catch (err) {
        console.error('Error POST /metas-asesor:', err.message);
        if (err.message.includes('UQ_MetasAsesor')) {
            return res.status(400).json({ error: 'Ya existe una meta registrada para este período, país y asesor.' });
        }
        return res.status(500).json({ error: 'Error al guardar la meta' });
    }
});

// PUT /metas-asesor/:id — Actualizar meta
router.put('/:id', verificarToken, verificarPermisoModulo('operaciones_metas', 'editar'), async (req, res) => {
    const { id } = req.params;
    const { id_periodo, id_pipeline, asesor, correo, moneda, recaudo, numero_ventas, tier } = req.body;
    const ip = obtenerIP(req);

    try {
        const pool = await getPool();

        const prev = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM [hubspot].[MetasAsesor] WHERE ID_MetaAsesor = @id');

        if (prev.recordset.length === 0) {
            return res.status(404).json({ error: 'Meta no encontrada' });
        }

        const p = prev.recordset[0];

        // Obtener nombre del país si cambió el pipeline
        let pais = p.Pais;
        if (id_pipeline && parseInt(id_pipeline) !== p.ID_pipeline) {
            const pipeResult = await pool.request()
                .input('pipeId', sql.Int, parseInt(id_pipeline))
                .query('SELECT Des_pipeline FROM [hubspot].[Dim_pipeline] WHERE ID_pipeline = @pipeId');
            pais = pipeResult.recordset.length > 0 ? pipeResult.recordset[0].Des_pipeline : pais;
        }

        await pool.request()
            .input('id',         sql.Int,           id)
            .input('periodo',    sql.Date,          id_periodo   || p.ID_Periodo)
            .input('pais',       sql.NVarChar,      pais)
            .input('pipeline',   sql.Int,           id_pipeline ? parseInt(id_pipeline) : p.ID_pipeline)
            .input('asesor',     sql.NVarChar,      asesor       || p.Asesor)
            .input('correo',     sql.NVarChar,      correo !== undefined ? correo : p.CORREO)
            .input('moneda',     sql.NVarChar,      moneda       || p.Moneda)
            .input('recaudo',    sql.Decimal(18,2), recaudo      !== undefined ? parseFloat(recaudo) : p.Recaudo)
            .input('numVentas',  sql.Int,           numero_ventas !== undefined ? parseInt(numero_ventas) : p.NumeroVentas)
            .input('tier',       sql.Int,           tier         !== undefined ? parseInt(tier) : p.Tier)
            .input('user',       sql.Int,           req.usuario.id)
            .query(`
                UPDATE [hubspot].[MetasAsesor]
                SET ID_Periodo = @periodo, Pais = @pais, ID_pipeline = @pipeline, 
                    Asesor = @asesor, CORREO = @correo, Moneda = @moneda,
                    Recaudo = @recaudo, NumeroVentas = @numVentas, Tier = @tier,
                    ActualizadoPor = @user, FechaActualizacion = GETDATE()
                WHERE ID_MetaAsesor = @id
            `);

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_META_ASESOR', 'MetasAsesor', id,
            `Meta Asesor editada ID: ${id}`, p, req.body, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Meta actualizada exitosamente' });
    } catch (err) {
        console.error('Error PUT /metas-asesor/:id:', err.message);
        return res.status(500).json({ error: 'Error al actualizar la meta' });
    }
});

// DELETE /metas-asesor/:id
router.delete('/:id', verificarToken, verificarPermisoModulo('operaciones_metas', 'eliminar'), async (req, res) => {
    const { id } = req.params;
    const ip = obtenerIP(req);

    try {
        const pool = await getPool();

        const prev = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM [hubspot].[MetasAsesor] WHERE ID_MetaAsesor = @id');

        if (prev.recordset.length === 0) {
            return res.status(404).json({ error: 'Meta no encontrada' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM [hubspot].[MetasAsesor] WHERE ID_MetaAsesor = @id');

        await registrarAuditoria(pool, req.usuario.id, 'ELIMINAR_META_ASESOR', 'MetasAsesor', id,
            `Meta Asesor eliminada ID: ${id}`, prev.recordset[0], null, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Meta eliminada exitosamente' });
    } catch (err) {
        console.error('Error DELETE /metas-asesor/:id:', err.message);
        return res.status(500).json({ error: 'Error al eliminar la meta' });
    }
});

module.exports = router;
