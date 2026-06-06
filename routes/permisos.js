// routes/permisos.js — Gestión granular de permisos por usuario y módulo
const express = require('express');
const { getPool, sql } = require('../utils/db-pool');
const { verificarToken, esAdmin } = require('../middleware/auth');
const { registrarAuditoria, obtenerIP } = require('../middleware/auditoria');

const router = express.Router();

// GET /api/permisos/modulos — Lista de módulos disponibles
router.get('/modulos', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            'SELECT ID_Modulo, Clave, Nombre, Descripcion, Icono, Orden, Solo_Admin FROM [hubspot].[Modulos] ORDER BY Orden'
        );
        return res.json(result.recordset);
    } catch (err) {
        return res.status(500).json({ error: 'Error obteniendo módulos' });
    }
});

// GET /api/permisos/usuario/:id — Permisos de un usuario específico
router.get('/usuario/:id', verificarToken, esAdmin, async (req, res) => {
    try {
        const pool = await getPool();

        // Traer todos los módulos y hacer LEFT JOIN con los permisos del usuario
        const result = await pool.request()
            .input('id_usuario', sql.Int, req.params.id)
            .query(`
                SELECT 
                    m.ID_Modulo, m.Clave, m.Nombre, m.Descripcion, m.Icono, m.Solo_Admin,
                    ISNULL(p.Puede_Ver,      0) AS Puede_Ver,
                    ISNULL(p.Puede_Crear,    0) AS Puede_Crear,
                    ISNULL(p.Puede_Editar,   0) AS Puede_Editar,
                    ISNULL(p.Puede_Eliminar, 0) AS Puede_Eliminar,
                    p.ID AS Permiso_ID
                FROM [hubspot].[Modulos] m
                LEFT JOIN [hubspot].[PermisosUsuarioModulo] p 
                    ON m.Clave = p.Modulo AND p.ID_Usuario = @id_usuario
                ORDER BY m.Orden
            `);

        return res.json(result.recordset);
    } catch (err) {
        console.error('Error GET permisos usuario:', err.message);
        return res.status(500).json({ error: 'Error obteniendo permisos' });
    }
});

// PUT /api/permisos/usuario/:id — Actualizar permisos de un usuario
router.put('/usuario/:id', verificarToken, esAdmin, async (req, res) => {
    const { id } = req.params;
    const { permisos } = req.body; // Array de { modulo, puede_ver, puede_crear, puede_editar, puede_eliminar }
    const ip = obtenerIP(req);

    if (!Array.isArray(permisos) || permisos.length === 0) {
        return res.status(400).json({ error: 'Se requiere array de permisos' });
    }

    // No permitir modificar permisos del propio admin que está haciendo el cambio
    if (parseInt(id) === req.usuario.id && req.usuario.rol === 'Admin') {
        // Verificar si está intentando quitar sus propios permisos de admin
        const modulosAdmin = permisos.filter(p => 
            (p.modulo === 'admin_usuarios' || p.modulo === 'admin_configuracion') && !p.puede_ver
        );
        if (modulosAdmin.length > 0) {
            return res.status(400).json({ error: 'No puedes quitarte a ti mismo acceso a módulos de administración' });
        }
    }

    try {
        const pool = await getPool();

        // Verificar que el usuario existe
        const usuarioExists = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT ID_Usuario, Nombre FROM [hubspot].[Usuarios] WHERE ID_Usuario = @id');

        if (usuarioExists.recordset.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const nombreUsuario = usuarioExists.recordset[0].Nombre;

        // Usar MERGE para upsert de cada permiso
        for (const p of permisos) {
            if (!p.modulo) continue;

            await pool.request()
                .input('id_usuario',     sql.Int, id)
                .input('modulo',         sql.NVarChar, p.modulo)
                .input('puede_ver',      sql.Bit, p.puede_ver      ? 1 : 0)
                .input('puede_crear',    sql.Bit, p.puede_crear    ? 1 : 0)
                .input('puede_editar',   sql.Bit, p.puede_editar   ? 1 : 0)
                .input('puede_eliminar', sql.Bit, p.puede_eliminar ? 1 : 0)
                .query(`
                    MERGE [hubspot].[PermisosUsuarioModulo] AS target
                    USING (SELECT @id_usuario AS ID_Usuario, @modulo AS Modulo) AS source
                    ON target.ID_Usuario = source.ID_Usuario AND target.Modulo = source.Modulo
                    WHEN MATCHED THEN
                        UPDATE SET 
                            Puede_Ver      = @puede_ver,
                            Puede_Crear    = @puede_crear,
                            Puede_Editar   = @puede_editar,
                            Puede_Eliminar = @puede_eliminar,
                            FechaAsignacion = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (ID_Usuario, Modulo, Puede_Ver, Puede_Crear, Puede_Editar, Puede_Eliminar)
                        VALUES (@id_usuario, @modulo, @puede_ver, @puede_crear, @puede_editar, @puede_eliminar);
                `);
        }

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_PERMISOS', 'PermisosUsuarioModulo', parseInt(id),
            `Permisos actualizados para usuario: ${nombreUsuario}`,
            null, { usuario_id: id, permisos }, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: `Permisos de ${nombreUsuario} actualizados exitosamente` });
    } catch (err) {
        console.error('Error PUT permisos usuario:', err.message);
        return res.status(500).json({ error: 'Error actualizando permisos' });
    }
});

// GET /api/permisos/mi-perfil — Permisos del usuario autenticado
router.get('/mi-perfil', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('id', sql.Int, req.usuario.id)
            .query(`
                SELECT m.Clave, m.Nombre, m.Icono,
                       ISNULL(p.Puede_Ver,      CASE WHEN r.Nombre_Rol = 'Admin' THEN 1 ELSE 0 END) AS Puede_Ver,
                       ISNULL(p.Puede_Crear,    CASE WHEN r.Nombre_Rol = 'Admin' THEN 1 ELSE 0 END) AS Puede_Crear,
                       ISNULL(p.Puede_Editar,   CASE WHEN r.Nombre_Rol = 'Admin' THEN 1 ELSE 0 END) AS Puede_Editar,
                       ISNULL(p.Puede_Eliminar, CASE WHEN r.Nombre_Rol = 'Admin' THEN 1 ELSE 0 END) AS Puede_Eliminar
                FROM [hubspot].[Modulos] m
                LEFT JOIN [hubspot].[PermisosUsuarioModulo] p ON m.Clave = p.Modulo AND p.ID_Usuario = @id
                JOIN [hubspot].[Usuarios] u ON u.ID_Usuario = @id
                JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
                ORDER BY m.Orden
            `);

        return res.json(result.recordset);
    } catch (err) {
        return res.status(500).json({ error: 'Error obteniendo perfil de permisos' });
    }
});

module.exports = router;
