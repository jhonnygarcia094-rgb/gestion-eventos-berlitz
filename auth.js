// routes/auth.js — Autenticación, usuarios y recuperación de contraseña
const express  = require('express');
const bcrypt   = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getPool, sql } = require('../utils/db-pool');
const { generarToken, verificarToken, esAdmin, cargarPermisosModulos } = require('../middleware/auth');
const { registrarAuditoria, obtenerIP } = require('../middleware/auditoria');
const { enviarCorreoBienvenida, enviarCorreoRecuperacion } = require('../utils/mailer');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    let { email, contraseña } = req.body;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'] || 'Desconocido';

    if (contraseña) contraseña = contraseña.trim();
    if (!email || !contraseña) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('email', sql.NVarChar, email.trim().toLowerCase())
            .query(`
                SELECT u.ID_Usuario, u.Email, u.Nombre, u.Apellido, u.Contraseña_Hash, 
                       u.Activo, u.Bloqueado, u.Intentos_Fallidos, u.Primer_Login,
                       r.ID_Rol, r.Nombre_Rol, r.Permisos_Ver, r.Permisos_Crear, 
                       r.Permisos_Editar, r.Permisos_Eliminar, r.Permisos_Gestionar_Usuarios
                FROM [hubspot].[Usuarios] u
                JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
                WHERE LOWER(u.Email) = @email
            `);

        const usuario = result.recordset[0];

        if (!usuario) {
            await registrarAuditoria(pool, null, 'LOGIN', 'Usuarios', null,
                `Email no registrado: ${email}`, null, null, ip, userAgent, 'ERROR');
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        if (usuario.Bloqueado) {
            await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario,
                'Login en cuenta bloqueada', null, null, ip, userAgent, 'ERROR');
            return res.status(403).json({ error: 'Cuenta bloqueada. Contacta al administrador.' });
        }

        if (!usuario.Activo) {
            await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario,
                'Login en cuenta inactiva', null, null, ip, userAgent, 'ERROR');
            return res.status(403).json({ error: 'Cuenta inactiva. Contacta al administrador.' });
        }

        const contraseñaValida = await bcrypt.compare(contraseña, usuario.Contraseña_Hash);

        if (!contraseñaValida) {
            const nuevoIntento  = usuario.Intentos_Fallidos + 1;
            const bloqueado     = nuevoIntento >= 5 ? 1 : 0;
            const fechaBloqueo  = bloqueado ? new Date() : null;

            await pool.request()
                .input('id',           sql.Int,      usuario.ID_Usuario)
                .input('intentos',     sql.Int,      nuevoIntento)
                .input('bloqueado',    sql.Bit,      bloqueado)
                .input('fecha_bloqueo', sql.DateTime, fechaBloqueo)
                .query(`
                    UPDATE [hubspot].[Usuarios]
                    SET Intentos_Fallidos = @intentos, Bloqueado = @bloqueado, Fecha_Bloqueo = @fecha_bloqueo
                    WHERE ID_Usuario = @id
                `);

            await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario,
                `Contraseña incorrecta (intento ${nuevoIntento}/5)`, null, null, ip, userAgent, 'ERROR');

            const intentosRestantes = 5 - nuevoIntento;
            return res.status(401).json({
                error: bloqueado
                    ? 'Cuenta bloqueada por demasiados intentos. Contacta al administrador.'
                    : `Credenciales inválidas. ${intentosRestantes} intento(s) restante(s).`
            });
        }

        // Login exitoso
        await pool.request()
            .input('id',          sql.Int,      usuario.ID_Usuario)
            .input('ultimo_login', sql.DateTime, new Date())
            .query(`
                UPDATE [hubspot].[Usuarios]
                SET Intentos_Fallidos = 0, Bloqueado = 0, Ultimo_Login = @ultimo_login
                WHERE ID_Usuario = @id
            `);

        const permisosModulos = await cargarPermisosModulos(usuario.ID_Usuario, usuario.Nombre_Rol);
        const token = generarToken(usuario, permisosModulos);

        await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario,
            'Login exitoso', null, null, ip, userAgent, 'EXITOSO');

        return res.json({
            mensaje: 'Login exitoso',
            token,
            primer_login: usuario.Primer_Login === true || usuario.Primer_Login === 1,
            usuario: {
                id:      usuario.ID_Usuario,
                email:   usuario.Email,
                nombre:  usuario.Nombre,
                apellido: usuario.Apellido,
                rol:     usuario.Nombre_Rol,
                modulos: permisosModulos
            }
        });

    } catch (err) {
        console.error('Error en login:', err.message);
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();
        await registrarAuditoria(pool, req.usuario.id, 'LOGOUT', 'Usuarios', req.usuario.id,
            'Logout exitoso', null, null, obtenerIP(req), req.headers['user-agent'], 'EXITOSO');
        return res.json({ mensaje: 'Sesión cerrada exitosamente' });
    } catch (err) {
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/cambiar-contraseña (cambio normal autenticado)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cambiar-contraseña', verificarToken, async (req, res) => {
    const { contraseñaActual, contraseñaNueva } = req.body;
    const ip = obtenerIP(req);

    if (!contraseñaActual || !contraseñaNueva) {
        return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    if (contraseñaNueva.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.usuario.id)
            .query('SELECT Contraseña_Hash FROM [hubspot].[Usuarios] WHERE ID_Usuario = @id');

        const usuario = result.recordset[0];
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        const valida = await bcrypt.compare(contraseñaActual, usuario.Contraseña_Hash);
        if (!valida) {
            await registrarAuditoria(pool, req.usuario.id, 'CAMBIO_CONTRASEÑA', 'Usuarios', req.usuario.id,
                'Contraseña actual incorrecta', null, null, ip, req.headers['user-agent'], 'ERROR');
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        const nuevoHash = await bcrypt.hash(contraseñaNueva, 12);
        await pool.request()
            .input('id',   sql.Int,      req.usuario.id)
            .input('hash', sql.NVarChar, nuevoHash)
            .query(`
                UPDATE [hubspot].[Usuarios]
                SET Contraseña_Hash = @hash, Primer_Login = 0, Fecha_Actualizacion = GETDATE()
                WHERE ID_Usuario = @id
            `);

        await registrarAuditoria(pool, req.usuario.id, 'CAMBIO_CONTRASEÑA', 'Usuarios', req.usuario.id,
            'Contraseña cambiada exitosamente', null, null, ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Contraseña actualizada exitosamente' });
    } catch (err) {
        console.error('Error al cambiar contraseña:', err.message);
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/olvidé-contraseña (solicitar recuperación)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/olvide-contraseña', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('email', sql.NVarChar, email.trim().toLowerCase())
            .query(`
                SELECT ID_Usuario, Nombre, Email, Activo 
                FROM [hubspot].[Usuarios] 
                WHERE LOWER(Email) = @email AND Activo = 1
            `);

        // Siempre responder "éxito" para no revelar si el email existe
        if (result.recordset.length === 0) {
            return res.json({ mensaje: 'Si el correo existe, recibirás un enlace de recuperación.' });
        }

        const usuario = result.recordset[0];
        const token   = uuidv4();
        const expira  = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

        // Invalidar tokens anteriores
        await pool.request()
            .input('id', sql.Int, usuario.ID_Usuario)
            .query(`UPDATE [hubspot].[TokensRecuperacion] SET Usado = 1 WHERE ID_Usuario = @id AND Usado = 0`);

        // Guardar nuevo token
        await pool.request()
            .input('id_usuario', sql.Int,      usuario.ID_Usuario)
            .input('token',      sql.NVarChar, token)
            .input('expira',     sql.DateTime, expira)
            .query(`
                INSERT INTO [hubspot].[TokensRecuperacion] (ID_Usuario, Token, FechaExpira)
                VALUES (@id_usuario, @token, @expira)
            `);

        // Enviar correo (no bloquear respuesta)
        enviarCorreoRecuperacion(usuario.Email, usuario.Nombre, token)
            .catch(err => console.error('Error enviando correo recuperación:', err.message));

        return res.json({ mensaje: 'Si el correo existe, recibirás un enlace de recuperación.' });
    } catch (err) {
        console.error('Error en recuperación:', err.message);
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-contraseña (usar token de recuperación)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-contraseña', async (req, res) => {
    const { token, contraseñaNueva } = req.body;

    if (!token || !contraseñaNueva) {
        return res.status(400).json({ error: 'Token y nueva contraseña requeridos' });
    }

    if (contraseñaNueva.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('token', sql.NVarChar, token)
            .query(`
                SELECT t.ID, t.ID_Usuario, t.FechaExpira, t.Usado
                FROM [hubspot].[TokensRecuperacion] t
                WHERE t.Token = @token
            `);

        const rec = result.recordset[0];

        if (!rec)           return res.status(400).json({ error: 'Token inválido o expirado' });
        if (rec.Usado)      return res.status(400).json({ error: 'Este enlace ya fue utilizado' });
        if (new Date() > new Date(rec.FechaExpira))
                            return res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' });

        const nuevoHash = await bcrypt.hash(contraseñaNueva, 12);

        await pool.request()
            .input('id',   sql.Int,      rec.ID_Usuario)
            .input('hash', sql.NVarChar, nuevoHash)
            .query(`
                UPDATE [hubspot].[Usuarios]
                SET Contraseña_Hash = @hash, Primer_Login = 0, 
                    Intentos_Fallidos = 0, Bloqueado = 0, Fecha_Actualizacion = GETDATE()
                WHERE ID_Usuario = @id
            `);

        // Marcar token como usado
        await pool.request()
            .input('id', sql.Int, rec.ID)
            .query(`UPDATE [hubspot].[TokensRecuperacion] SET Usado = 1 WHERE ID = @id`);

        await registrarAuditoria(pool, rec.ID_Usuario, 'RESET_CONTRASEÑA', 'Usuarios', rec.ID_Usuario,
            'Contraseña restablecida via token de recuperación', null, null, 'recovery', 'recovery', 'EXITOSO');

        return res.json({ mensaje: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' });
    } catch (err) {
        console.error('Error en reset contraseña:', err.message);
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/crear-usuario (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/crear-usuario', verificarToken, esAdmin, async (req, res) => {
    let { email, nombre, apellido, rol, contraseña } = req.body;
    const ip = obtenerIP(req);

    if (contraseña) contraseña = contraseña.trim();

    if (!email || !nombre || !rol || !contraseña) {
        return res.status(400).json({ error: 'Email, nombre, rol y contraseña son requeridos' });
    }

    if (contraseña.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const pool = await getPool();

        const rolResult = await pool.request()
            .input('nombre_rol', sql.NVarChar, rol)
            .query('SELECT ID_Rol FROM [hubspot].[Roles] WHERE Nombre_Rol = @nombre_rol');

        if (rolResult.recordset.length === 0) {
            return res.status(400).json({ error: 'Rol no válido' });
        }

        const idRol = rolResult.recordset[0].ID_Rol;

        const hashContraseña = await bcrypt.hash(contraseña, 12);

        const insertResult = await pool.request()
            .input('email',    sql.NVarChar, email.trim().toLowerCase())
            .input('nombre',   sql.NVarChar, nombre.trim())
            .input('apellido', sql.NVarChar, apellido ? apellido.trim() : '')
            .input('hash',     sql.NVarChar, hashContraseña)
            .input('id_rol',   sql.Int,      idRol)
            .query(`
                INSERT INTO [hubspot].[Usuarios] (Email, Nombre, Apellido, Contraseña_Hash, ID_Rol, Activo, Primer_Login)
                OUTPUT INSERTED.ID_Usuario
                VALUES (@email, @nombre, @apellido, @hash, @id_rol, 1, 1)
            `);

        const idUsuario = insertResult.recordset[0].ID_Usuario;

        // Asignar permisos básicos de visualización a todos los módulos no-admin
        await pool.request()
            .input('id_usuario', sql.Int, idUsuario)
            .query(`
                INSERT INTO [hubspot].[PermisosUsuarioModulo] (ID_Usuario, Modulo, Puede_Ver, Puede_Crear, Puede_Editar, Puede_Eliminar)
                SELECT @id_usuario, Clave, 1, 0, 0, 0
                FROM [hubspot].[Modulos]
                WHERE Solo_Admin = 0
            `);

        await registrarAuditoria(pool, req.usuario.id, 'CREAR_USUARIO', 'Usuarios', idUsuario,
            `Usuario creado: ${email}`, null, { email, nombre, apellido, rol }, ip, req.headers['user-agent'], 'EXITOSO');

        return res.status(201).json({
            mensaje: 'Usuario creado exitosamente.',
            usuario: { id: idUsuario, email, nombre, apellido, rol }
        });

    } catch (err) {
        console.error('Error al crear usuario:', err.message);
        if (err.message.includes('UNIQUE') || err.message.includes('unique') || err.number === 2627) {
            return res.status(400).json({ error: 'El email ya está registrado en el sistema' });
        }
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/usuarios (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/usuarios', verificarToken, esAdmin, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT u.ID_Usuario, u.Email, u.Nombre, u.Apellido, u.Activo, u.Bloqueado, 
                   u.Primer_Login, u.Ultimo_Login, u.Fecha_Creacion, u.Intentos_Fallidos,
                   r.Nombre_Rol
            FROM [hubspot].[Usuarios] u
            JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
            ORDER BY u.Fecha_Creacion DESC
        `);
        return res.json(result.recordset);
    } catch (err) {
        console.error('Error listando usuarios:', err.message);
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/auth/usuarios/:id (Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/usuarios/:id', verificarToken, esAdmin, async (req, res) => {
    const { id } = req.params;
    let { nombre, apellido, rol, activo, bloqueado, contraseña } = req.body;
    const ip = obtenerIP(req);

    if (contraseña) contraseña = contraseña.trim();

    try {
        const pool = await getPool();

        const usuarioActual = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT u.ID_Usuario, u.Nombre, u.Apellido, u.Activo, u.Bloqueado, r.Nombre_Rol
                FROM [hubspot].[Usuarios] u
                JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
                WHERE u.ID_Usuario = @id
            `);

        if (usuarioActual.recordset.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const anterior = usuarioActual.recordset[0];

        // Si se cambia el rol, obtener ID del nuevo rol
        let idRolNuevo = null;
        if (rol && rol !== anterior.Nombre_Rol) {
            const rolResult = await pool.request()
                .input('rol', sql.NVarChar, rol)
                .query('SELECT ID_Rol FROM [hubspot].[Roles] WHERE Nombre_Rol = @rol');
            if (rolResult.recordset.length > 0) {
                idRolNuevo = rolResult.recordset[0].ID_Rol;
            }
        }

        let hasPassword = false;
        let nuevoHash = '';
        if (contraseña && contraseña.length >= 6) {
            nuevoHash = await bcrypt.hash(contraseña, 12);
            hasPassword = true;
        }

        const query = idRolNuevo
            ? `UPDATE [hubspot].[Usuarios] SET Nombre=@nombre, Apellido=@apellido, Activo=@activo, Bloqueado=@bloqueado, ID_Rol=@id_rol, Fecha_Actualizacion=GETDATE() ${hasPassword ? ', Contraseña_Hash=@hash, Primer_Login=1' : ''} WHERE ID_Usuario=@id`
            : `UPDATE [hubspot].[Usuarios] SET Nombre=@nombre, Apellido=@apellido, Activo=@activo, Bloqueado=@bloqueado, Fecha_Actualizacion=GETDATE() ${hasPassword ? ', Contraseña_Hash=@hash, Primer_Login=1' : ''} WHERE ID_Usuario=@id`;

        const req2 = pool.request()
            .input('id',       sql.Int,      id)
            .input('nombre',   sql.NVarChar, nombre   !== undefined ? nombre   : anterior.Nombre)
            .input('apellido', sql.NVarChar, apellido !== undefined ? apellido : anterior.Apellido)
            .input('activo',   sql.Bit,      activo   !== undefined ? activo   : anterior.Activo)
            .input('bloqueado', sql.Bit,     bloqueado !== undefined ? bloqueado : anterior.Bloqueado);

        if (hasPassword) req2.input('hash', sql.NVarChar, nuevoHash);
        if (idRolNuevo) req2.input('id_rol', sql.Int, idRolNuevo);

        await req2.query(query);

        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_USUARIO', 'Usuarios', id,
            `Usuario editado: ${anterior.Nombre}`, anterior, { nombre, apellido, rol, activo, bloqueado },
            ip, req.headers['user-agent'], 'EXITOSO');

        return res.json({ mensaje: 'Usuario actualizado exitosamente' });
    } catch (err) {
        console.error('Error al actualizar usuario:', err.message);
        return res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/roles
// ─────────────────────────────────────────────────────────────────────────────
router.get('/roles', verificarToken, esAdmin, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(
            'SELECT ID_Rol, Nombre_Rol, Descripcion FROM [hubspot].[Roles] ORDER BY ID_Rol'
        );
        return res.json(result.recordset);
    } catch (err) {
        return res.status(500).json({ error: 'Error obteniendo roles' });
    }
});

module.exports = router;