// middleware/auth.js — Autenticación JWT y permisos granulares
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../utils/db-pool');

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET no configurado en .env');
    process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generación de Token
// ─────────────────────────────────────────────────────────────────────────────
function generarToken(usuario, permisosModulos = {}) {
    return jwt.sign(
        {
            id:          usuario.ID_Usuario,
            email:       usuario.Email,
            nombre:      usuario.Nombre,
            rol:         usuario.Nombre_Rol,
            primer_login: usuario.Primer_Login,
            permisos: {
                ver:               usuario.Permisos_Ver,
                crear:             usuario.Permisos_Crear,
                editar:            usuario.Permisos_Editar,
                eliminar:          usuario.Permisos_Eliminar,
                gestionar_usuarios: usuario.Permisos_Gestionar_Usuarios
            },
            modulos: permisosModulos  // { eventos: {ver:1,crear:1,...}, ... }
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar Token
// ─────────────────────────────────────────────────────────────────────────────
function verificarToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;

    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Token inválido', code: 'TOKEN_INVALID' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar Permiso de Rol (legacy, mantener compatibilidad)
// ─────────────────────────────────────────────────────────────────────────────
function verificarPermiso(permiso) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: 'No autenticado' });
        }
        if (!req.usuario.permisos || !req.usuario.permisos[permiso]) {
            return res.status(403).json({ error: 'Sin permiso para esta acción', required: permiso });
        }
        next();
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar Permiso Granular por Módulo
// ─────────────────────────────────────────────────────────────────────────────
function verificarPermisoModulo(modulo, accion = 'ver') {
    return async (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        // Admin siempre tiene acceso total
        if (req.usuario.rol === 'Admin') {
            return next();
        }

        // Verificar en token primero (rápido)
        if (req.usuario.modulos && req.usuario.modulos[modulo]) {
            const permisoModulo = req.usuario.modulos[modulo];
            const campoPermiso  = `Puede_${accion.charAt(0).toUpperCase() + accion.slice(1)}`;
            if (permisoModulo[campoPermiso] || permisoModulo[`puede_${accion}`]) {
                return next();
            }
        }

        // Fallback: consultar BD en tiempo real
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input('id_usuario', sql.Int, req.usuario.id)
                .input('modulo', sql.NVarChar, modulo)
                .query(`
                    SELECT Puede_Ver, Puede_Crear, Puede_Editar, Puede_Eliminar
                    FROM [hubspot].[PermisosUsuarioModulo]
                    WHERE ID_Usuario = @id_usuario AND Modulo = @modulo
                `);

            if (result.recordset.length === 0) {
                return res.status(403).json({ error: `Sin acceso al módulo: ${modulo}` });
            }

            const p = result.recordset[0];
            const map = { ver: 'Puede_Ver', crear: 'Puede_Crear', editar: 'Puede_Editar', eliminar: 'Puede_Eliminar' };
            const campo = map[accion] || 'Puede_Ver';

            if (!p[campo]) {
                return res.status(403).json({ error: `Sin permiso '${accion}' en módulo: ${modulo}` });
            }

            next();
        } catch (err) {
            console.error('Error verificando permisos de módulo:', err.message);
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar Admin
// ─────────────────────────────────────────────────────────────────────────────
function esAdmin(req, res, next) {
    if (!req.usuario || req.usuario.rol !== 'Admin') {
        return res.status(403).json({ error: 'Acceso restringido a administradores' });
    }
    next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cargar permisos de módulos desde BD (para incluir en token)
// ─────────────────────────────────────────────────────────────────────────────
async function cargarPermisosModulos(idUsuario, rol) {
    try {
        const pool = await getPool();

        // Admin tiene todos los permisos
        if (rol === 'Admin') {
            const modulos = await pool.request().query(
                'SELECT Clave FROM [hubspot].[Modulos]'
            );
            const permisos = {};
            modulos.recordset.forEach(m => {
                permisos[m.Clave] = { Puede_Ver: 1, Puede_Crear: 1, Puede_Editar: 1, Puede_Eliminar: 1 };
            });
            return permisos;
        }

        const result = await pool.request()
            .input('id', sql.Int, idUsuario)
            .query(`
                SELECT Modulo, Puede_Ver, Puede_Crear, Puede_Editar, Puede_Eliminar
                FROM [hubspot].[PermisosUsuarioModulo]
                WHERE ID_Usuario = @id
            `);

        const permisos = {};
        result.recordset.forEach(r => {
            permisos[r.Modulo] = {
                Puede_Ver:      r.Puede_Ver,
                Puede_Crear:    r.Puede_Crear,
                Puede_Editar:   r.Puede_Editar,
                Puede_Eliminar: r.Puede_Eliminar
            };
        });
        return permisos;
    } catch (err) {
        console.error('Error cargando permisos de módulos:', err.message);
        return {};
    }
}

module.exports = {
    generarToken,
    verificarToken,
    verificarPermiso,
    verificarPermisoModulo,
    esAdmin,
    cargarPermisosModulos,
    JWT_SECRET
};