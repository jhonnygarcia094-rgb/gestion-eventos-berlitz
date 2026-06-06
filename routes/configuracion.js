// routes/configuracion.js — Gestión de configuración del sistema (SMTP, etc.)
const express = require('express');
const { getPool, sql } = require('../utils/db-pool');
const { verificarToken, esAdmin, verificarPermisoModulo } = require('../middleware/auth');
const { registrarAuditoria, obtenerIP } = require('../middleware/auditoria');
const { probarConexionSMTP } = require('../utils/mailer');

const router = express.Router();

// GET /api/configuracion — Obtener toda la configuración
router.get('/', verificarToken, verificarPermisoModulo('admin_configuracion', 'ver'), async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT c.ConfigID, c.Clave, c.Valor, c.Descripcion, c.FechaModificacion,
                   u.Nombre + ' ' + ISNULL(u.Apellido,'') AS ModificadoPorNombre
            FROM [hubspot].[ConfiguracionSistema] c
            LEFT JOIN [hubspot].[Usuarios] u ON c.ModificadoPor = u.ID_Usuario
            ORDER BY c.Clave
        `);

        // Enmascarar valores sensibles para visualización
        const datos = result.recordset.map(r => ({
            ...r,
            Valor: r.Clave === 'SMTP_PASS' ? '••••••••••••••••' : r.Valor
        }));

        return res.json(datos);
    } catch (err) {
        console.error('Error GET /configuracion:', err.message);
        return res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// GET /api/configuracion/:clave — Obtener un valor específico
router.get('/:clave', verificarToken, esAdmin, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('clave', sql.NVarChar, req.params.clave)
            .query('SELECT Clave, Valor, Descripcion FROM [hubspot].[ConfiguracionSistema] WHERE Clave = @clave');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }
        return res.json(result.recordset[0]);
    } catch (err) {
        return res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

// PUT /api/configuracion/:clave — Actualizar un valor
router.put('/:clave', verificarToken, verificarPermisoModulo('admin_configuracion', 'editar'), async (req, res) => {
    const { clave } = req.params;
    const { valor }  = req.body;
    const ip = obtenerIP(req);

    if (valor === undefined) {
        return res.status(400).json({ error: 'El campo valor es requerido' });
    }

    try {
        const pool = await getPool();

        // Obtener valor anterior para auditoría
        const anterior = await pool.request()
            .input('clave', sql.NVarChar, clave)
            .query('SELECT Clave, Valor FROM [hubspot].[ConfiguracionSistema] WHERE Clave = @clave');

        if (anterior.recordset.length === 0) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        const valorAnterior = anterior.recordset[0].Valor;

        await pool.request()
            .input('clave',    sql.NVarChar, clave)
            .input('valor',    sql.NVarChar, valor)
            .input('user_id',  sql.Int,      req.usuario.id)
            .query(`
                UPDATE [hubspot].[ConfiguracionSistema]
                SET Valor = @valor, ModificadoPor = @user_id, FechaModificacion = GETDATE()
                WHERE Clave = @clave
            `);

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_CONFIGURACION', 'ConfiguracionSistema', null,
            `Config actualizada: ${clave}`,
            { clave, valor: clave === 'SMTP_PASS' ? '***' : valorAnterior },
            { clave, valor: clave === 'SMTP_PASS' ? '***' : valor },
            ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: `Configuración '${clave}' actualizada exitosamente` });
    } catch (err) {
        console.error('Error PUT /configuracion:', err.message);
        return res.status(500).json({ error: 'Error al actualizar configuración' });
    }
});

// PUT /api/configuracion/bulk/update — Actualizar múltiples valores a la vez
router.put('/bulk/update', verificarToken, verificarPermisoModulo('admin_configuracion', 'editar'), async (req, res) => {
    const { configuraciones } = req.body; // Array de { clave, valor }
    const ip = obtenerIP(req);

    if (!Array.isArray(configuraciones) || configuraciones.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de configuraciones' });
    }

    try {
        const pool = await getPool();

        for (const { clave, valor } of configuraciones) {
            if (!clave || valor === undefined) continue;
            await pool.request()
                .input('clave',   sql.NVarChar, clave)
                .input('valor',   sql.NVarChar, valor)
                .input('user_id', sql.Int,      req.usuario.id)
                .query(`
                    UPDATE [hubspot].[ConfiguracionSistema]
                    SET Valor = @valor, ModificadoPor = @user_id, FechaModificacion = GETDATE()
                    WHERE Clave = @clave
                `);
        }

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_CONFIGURACION', 'ConfiguracionSistema', null,
            `Actualización masiva: ${configuraciones.map(c => c.clave).join(', ')}`,
            null, null, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Configuraciones actualizadas exitosamente' });
    } catch (err) {
        console.error('Error bulk update config:', err.message);
        return res.status(500).json({ error: 'Error al actualizar configuraciones' });
    }
});

// POST /api/configuracion/probar-smtp — Verificar conexión SMTP
router.post('/probar-smtp', verificarToken, esAdmin, async (req, res) => {
    try {
        const resultado = await probarConexionSMTP();
        if (resultado.ok) {
            return res.json({ mensaje: '✅ Conexión SMTP exitosa', detalles: resultado.config });
        } else {
            return res.status(400).json({ error: `❌ Error SMTP: ${resultado.error}` });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error al probar SMTP' });
    }
});

module.exports = router;
