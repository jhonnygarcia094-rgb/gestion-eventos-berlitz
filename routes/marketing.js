// routes/marketing.js — CRUD para Inversión Publicitaria y Metas de Marketing
const express = require('express');
const { getPool, sql } = require('../utils/db-pool');
const { verificarToken, verificarPermisoModulo } = require('../middleware/auth');
const { registrarAuditoria, obtenerIP } = require('../middleware/auditoria');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// INVERSIÓN PUBLICITARIA
// ═══════════════════════════════════════════════════════════════════════════════

// GET /marketing/inversion — Listar inversiones
router.get('/inversion', verificarToken, verificarPermisoModulo('marketing_inversion', 'ver'), async (req, res) => {
    try {
        const pool = await getPool();
        const { periodo, pipeline } = req.query;

        let where  = '1=1';
        const request = pool.request();

        if (periodo) {
            where += ' AND CONVERT(varchar, i.ID_Periodo, 120) LIKE @periodo + \'%\'';
            request.input('periodo', sql.NVarChar, periodo.substring(0, 7));
        }
        if (pipeline) {
            where += ' AND i.ID_pipeline = @pipeline';
            request.input('pipeline', sql.Int, parseInt(pipeline));
        }

        const result = await request.query(`
            SELECT i.ID_Inversion, i.ID_Periodo, i.Amount_Spend, i.ID_pipeline,
                   d.Des_pipeline, i.FechaCarga, i.FechaActualizacion
            FROM [hubspot].[inversionPublicitaria] i
            LEFT JOIN [hubspot].[Dim_pipeline] d ON i.ID_pipeline = d.ID_pipeline
            WHERE ${where}
            ORDER BY i.ID_Periodo DESC, d.Des_pipeline ASC
        `);

        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET /marketing/inversion:', err.message);
        return res.status(500).json({ error: 'Error al obtener inversiones' });
    }
});

// POST /marketing/inversion — Crear inversión
router.post('/inversion', verificarToken, verificarPermisoModulo('marketing_inversion', 'crear'), async (req, res) => {
    const { id_periodo, amount_spend, id_pipeline } = req.body;
    const ip = obtenerIP(req);

    if (!id_periodo || amount_spend === undefined || !id_pipeline) {
        return res.status(400).json({ error: 'ID_Periodo, Amount_Spend e ID_pipeline son requeridos' });
    }

    if (isNaN(parseFloat(amount_spend)) || parseFloat(amount_spend) < 0) {
        return res.status(400).json({ error: 'Amount_Spend debe ser un número positivo' });
    }

    try {
        const pool = await getPool();

        const check = await pool.request()
            .input('periodo', sql.NVarChar, id_periodo.toString().trim())
            .input('pipeline', sql.Int, parseInt(id_pipeline))
            .query('SELECT 1 FROM [hubspot].[inversionPublicitaria] WHERE ID_Periodo = @periodo AND ID_pipeline = @pipeline');
            
        if (check.recordset.length > 0) {
            return res.status(400).json({ error: 'Ya existe una inversión registrada para este período y país.' });
        }

        const result = await pool.request()
            .input('periodo',      sql.NVarChar, id_periodo.toString().trim())
            .input('amount',       sql.Decimal(18, 2), parseFloat(amount_spend))
            .input('pipeline',     sql.Int,      parseInt(id_pipeline))
            .input('creado_por',   sql.Int,      req.usuario.id)
            .query(`
                INSERT INTO [hubspot].[inversionPublicitaria] (ID_Periodo, Amount_Spend, ID_pipeline, FechaCarga, FechaActualizacion, CreadoPor)
                OUTPUT INSERTED.ID_Inversion
                VALUES (@periodo, @amount, @pipeline, GETDATE(), GETDATE(), @creado_por)
            `);

        const idInversion = result.recordset[0].ID_Inversion;

        await registrarAuditoria(pool, req.usuario.id, 'CREAR_INVERSION', 'inversionPublicitaria', idInversion,
            `Inversión creada: Periodo ${id_periodo}, Pipeline ${id_pipeline}`,
            null, { id_periodo, amount_spend, id_pipeline }, ip, req.headers['user-agent'], 'EXITOSO');

        return res.status(201).json({ mensaje: 'Inversión registrada exitosamente', id: idInversion });
    } catch (err) {
        console.error('Error POST /marketing/inversion:', err.message);
        return res.status(500).json({ error: 'Error al guardar la inversión' });
    }
});

// PUT /marketing/inversion/:id — Actualizar inversión
router.put('/inversion/:id', verificarToken, verificarPermisoModulo('marketing_inversion', 'editar'), async (req, res) => {
    const { id } = req.params;
    const { id_periodo, amount_spend, id_pipeline } = req.body;
    const ip = obtenerIP(req);

    try {
        const pool = await getPool();

        const anterior = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM [hubspot].[inversionPublicitaria] WHERE ID_Inversion = @id');

        if (anterior.recordset.length === 0) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        const prev = anterior.recordset[0];

        await pool.request()
            .input('id',       sql.Int,       id)
            .input('periodo',  sql.Date,      id_periodo   || prev.ID_Periodo)
            .input('amount',   sql.Decimal(18, 2), parseFloat(amount_spend !== undefined ? amount_spend : prev.Amount_Spend))
            .input('pipeline', sql.Int,       id_pipeline  ? parseInt(id_pipeline) : prev.ID_pipeline)
            .input('user_id',  sql.Int,       req.usuario.id)
            .query(`
                UPDATE [hubspot].[inversionPublicitaria]
                SET ID_Periodo = @periodo, Amount_Spend = @amount, ID_pipeline = @pipeline,
                    FechaActualizacion = GETDATE(), ActualizadoPor = @user_id
                WHERE ID_Inversion = @id
            `);

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_INVERSION', 'inversionPublicitaria', id,
            `Inversión editada ID: ${id}`, prev, { id_periodo, amount_spend, id_pipeline },
            ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Inversión actualizada exitosamente' });
    } catch (err) {
        console.error('Error PUT /marketing/inversion/:id:', err.message);
        return res.status(500).json({ error: 'Error al actualizar la inversión' });
    }
});

// DELETE /marketing/inversion/:id
router.delete('/inversion/:id', verificarToken, verificarPermisoModulo('marketing_inversion', 'eliminar'), async (req, res) => {
    const { id } = req.params;
    const ip = obtenerIP(req);

    try {
        const pool = await getPool();

        const prev = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM [hubspot].[inversionPublicitaria] WHERE ID_Inversion = @id');

        if (prev.recordset.length === 0) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM [hubspot].[inversionPublicitaria] WHERE ID_Inversion = @id');

        await registrarAuditoria(pool, req.usuario.id, 'ELIMINAR_INVERSION', 'inversionPublicitaria', id,
            `Inversión eliminada ID: ${id}`, prev.recordset[0], null, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Inversión eliminada exitosamente' });
    } catch (err) {
        console.error('Error DELETE /marketing/inversion/:id:', err.message);
        return res.status(500).json({ error: 'Error al eliminar la inversión' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// METAS DE MARKETING
// ═══════════════════════════════════════════════════════════════════════════════

// GET /marketing/metas
router.get('/metas', verificarToken, verificarPermisoModulo('marketing_metas', 'ver'), async (req, res) => {
    try {
        const pool = await getPool();
        const { periodo, pais, tipo } = req.query;

        let where = '1=1';
        const request = pool.request();

        if (periodo) { where += ' AND CONVERT(varchar, ID_Periodo, 120) LIKE @periodo + \'%\''; request.input('periodo', sql.NVarChar, periodo.substring(0, 7)); }
        if (pais)    { where += ' AND Pais = @pais';          request.input('pais', sql.NVarChar, pais); }
        if (tipo)    { where += ' AND TipoLeads = @tipo';     request.input('tipo', sql.NVarChar, tipo); }

        const result = await request.query(`
            SELECT ID_Meta, ID_Periodo, Pais, TipoLeads, Leads, Ratio_conversion,
                   Matriculas, llave, FechaCarga, FechaActualizacion
            FROM [hubspot].[MetasMarketing]
            WHERE ${where}
            ORDER BY ID_Periodo DESC, Pais ASC, TipoLeads ASC
        `);

        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET /marketing/metas:', err.message);
        return res.status(500).json({ error: 'Error al obtener metas' });
    }
});

// POST /marketing/metas
router.post('/metas', verificarToken, verificarPermisoModulo('marketing_metas', 'crear'), async (req, res) => {
    const { id_periodo, pais, tipo_leads, leads, ratio_conversion, matriculas } = req.body;
    const ip = obtenerIP(req);

    if (!id_periodo || !pais || !tipo_leads) {
        return res.status(400).json({ error: 'ID_Periodo, Pais y TipoLeads son requeridos' });
    }

    try {
        const pool = await getPool();

        // Generar llave única
        const llave = `${id_periodo}_${pais}_${tipo_leads}`.replace(/\s/g, '_').toUpperCase();

        const check = await pool.request()
            .input('llave', sql.NVarChar, llave)
            .query('SELECT 1 FROM [hubspot].[MetasMarketing] WHERE llave = @llave');
            
        if (check.recordset.length > 0) {
            return res.status(400).json({ error: 'Ya existe una meta registrada para este período, país y tipo.' });
        }

        const result = await pool.request()
            .input('periodo',    sql.NVarChar,     id_periodo.toString().trim())
            .input('pais',       sql.NVarChar,     pais.trim())
            .input('tipo',       sql.NVarChar,     tipo_leads.trim())
            .input('leads',      sql.Int,          leads ? parseInt(leads) : 0)
            .input('ratio',      sql.Decimal(10,4), ratio_conversion ? parseFloat(ratio_conversion) : 0)
            .input('matriculas', sql.Int,          matriculas ? parseInt(matriculas) : 0)
            .input('llave',      sql.NVarChar,     llave)
            .query(`
                INSERT INTO [hubspot].[MetasMarketing] 
                    (ID_Periodo, Pais, TipoLeads, Leads, Ratio_conversion, Matriculas, FechaCarga, FechaActualizacion)
                OUTPUT INSERTED.ID_Meta
                VALUES (@periodo, @pais, @tipo, @leads, @ratio, @matriculas, GETDATE(), GETDATE())
            `);

        const idMeta = result.recordset[0].ID_Meta;

        await registrarAuditoria(pool, req.usuario.id, 'CREAR_META', 'MetasMarketing', idMeta,
            `Meta creada: ${pais} - ${tipo_leads} - ${id_periodo}`,
            null, req.body, ip, req.headers['user-agent'], 'EXITOSO');

        return res.status(201).json({ mensaje: 'Meta registrada exitosamente', id: idMeta });
    } catch (err) {
        console.error('Error POST /marketing/metas:', err.message);
        if (err.message.includes('UNIQUE') || err.message.includes('PRIMARY KEY')) {
            return res.status(400).json({ error: 'Ya existe un registro para este período, país y tipo' });
        }
        return res.status(500).json({ error: `Error al guardar la meta: ${err.message}` });
    }
});

// PUT /marketing/metas/:id
router.put('/metas/:id', verificarToken, verificarPermisoModulo('marketing_metas', 'editar'), async (req, res) => {
    const { id } = req.params;
    const { id_periodo, pais, tipo_leads, leads, ratio_conversion, matriculas } = req.body;
    const ip = obtenerIP(req);

    try {
        const pool = await getPool();

        const prev = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM [hubspot].[MetasMarketing] WHERE ID_Meta = @id');

        if (prev.recordset.length === 0) {
            return res.status(404).json({ error: 'Meta no encontrada' });
        }

        const p = prev.recordset[0];

        await pool.request()
            .input('id',         sql.Int,          id)
            .input('periodo',    sql.NVarChar,     id_periodo ? id_periodo.toString().trim() : p.ID_Periodo)
            .input('pais',       sql.NVarChar,     pais       ? pais.trim() : p.Pais)
            .input('tipo',       sql.NVarChar,     tipo_leads        || p.TipoLeads)
            .input('leads',      sql.Int,          leads             !== undefined ? parseInt(leads)                       : p.Leads)
            .input('ratio',      sql.Decimal(10,4), ratio_conversion !== undefined ? parseFloat(ratio_conversion)         : p.Ratio_conversion)
            .input('matriculas', sql.Int,          matriculas        !== undefined ? parseInt(matriculas)                  : p.Matriculas)
            .query(`
                UPDATE [hubspot].[MetasMarketing]
                SET ID_Periodo = @periodo,
                    Pais = @pais,
                    TipoLeads = @tipo,
                    Leads = @leads,
                    Ratio_conversion = @ratio,
                    Matriculas = @matriculas,
                    FechaActualizacion = GETDATE()
                WHERE ID_Meta = @id
            `);

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_META', 'MetasMarketing', id,
            `Meta editada ID: ${id}`, p, req.body, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Meta actualizada exitosamente' });
    } catch (err) {
        console.error('Error PUT /marketing/metas/:id:', err.message);
        return res.status(500).json({ error: `Error al actualizar la meta: ${err.message}` });
    }
});

// DELETE /marketing/metas/:id
router.delete('/metas/:id', verificarToken, verificarPermisoModulo('marketing_metas', 'eliminar'), async (req, res) => {
    const { id } = req.params;
    const ip = obtenerIP(req);

    try {
        const pool = await getPool();

        const prev = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM [hubspot].[MetasMarketing] WHERE ID_Meta = @id');

        if (prev.recordset.length === 0) {
            return res.status(404).json({ error: 'Meta no encontrada' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM [hubspot].[MetasMarketing] WHERE ID_Meta = @id');

        await registrarAuditoria(pool, req.usuario.id, 'ELIMINAR_META', 'MetasMarketing', id,
            `Meta eliminada ID: ${id}`, prev.recordset[0], null, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Meta eliminada exitosamente' });
    } catch (err) {
        console.error('Error DELETE /marketing/metas/:id:', err.message);
        return res.status(500).json({ error: 'Error al eliminar la meta' });
    }
});

// GET /marketing/metas/catalogos — Valores únicos para filtros
router.get('/metas/catalogos', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();
        const paises = await pool.request().query('SELECT DISTINCT Pais FROM [hubspot].[MetasMarketing] ORDER BY Pais');
        const tipos  = await pool.request().query('SELECT DISTINCT Tipo_Lead FROM [hubspot].[Dim_Fuente Original] WHERE Tipo_Lead IS NOT NULL ORDER BY Tipo_Lead');
        const periodos = await pool.request().query('SELECT DISTINCT ID_Periodo FROM [hubspot].[MetasMarketing] ORDER BY ID_Periodo DESC');

        return res.json({
            paises:   paises.recordset.map(r => r.Pais),
            tipos:    tipos.recordset.map(r => r.Tipo_Lead),
            periodos: periodos.recordset.map(r => r.ID_Periodo)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error al obtener catálogos' });
    }
});

module.exports = router;
