const express = require('express');
const bcrypt = require('bcrypt');
const sql = require('mssql');
const { generarToken, verificarToken, esAdmin } = require('../middleware/auth');
const { registrarAuditoria, obtenerIP } = require('../middleware/auditoria');

const router = express.Router();

// --- LOGIN ---
router.post('/login', async (req, res) => {
    const { email, contraseña } = req.body;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'];

    if (!email || !contraseña) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    try {
        let pool = await sql.connect(req.app.locals.dbConfig);

        // Obtener usuario con sus roles y permisos
        let result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT u.ID_Usuario, u.Email, u.Nombre, u.Contraseña_Hash, u.Activo, u.Bloqueado, u.Intentos_Fallidos,
                       r.ID_Rol, r.Nombre_Rol, r.Permisos_Ver, r.Permisos_Crear, r.Permisos_Editar, 
                       r.Permisos_Eliminar, r.Permisos_Gestionar_Usuarios
                FROM [hubspot].[Usuarios] u
                JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
                WHERE u.Email = @email
            `);

        const usuario = result.recordset[0];

        if (!usuario) {
            await registrarAuditoria(pool, null, 'LOGIN', 'Usuarios', null, `Intento de login con email no registrado: ${email}`, null, null, ip, userAgent, 'ERROR');
            await pool.close();
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Verificar si está bloqueado
        if (usuario.Bloqueado) {
            await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario, 'Intento de login en cuenta bloqueada', null, null, ip, userAgent, 'ERROR');
            await pool.close();
            return res.status(403).json({ error: 'Cuenta bloqueada. Contacta al administrador.' });
        }

        // Verificar si está activo
        if (!usuario.Activo) {
            await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario, 'Intento de login en cuenta inactiva', null, null, ip, userAgent, 'ERROR');
            await pool.close();
            return res.status(403).json({ error: 'Cuenta inactiva' });
        }

        // Verificar contraseña
        const contraseñaValida = await bcrypt.compare(contraseña, usuario.Contraseña_Hash);

        if (!contraseñaValida) {
            // Incrementar intentos fallidos
            const nuevoIntento = usuario.Intentos_Fallidos + 1;
            const bloqueado = nuevoIntento >= 5 ? 1 : 0;
            const fechaBloqueo = bloqueado ? new Date() : null;

            await pool.request()
                .input('id', sql.Int, usuario.ID_Usuario)
                .input('intentos', sql.Int, nuevoIntento)
                .input('bloqueado', sql.Bit, bloqueado)
                .input('fecha_bloqueo', sql.DateTime, fechaBloqueo)
                .query(`
                    UPDATE [hubspot].[Usuarios]
                    SET Intentos_Fallidos = @intentos, Bloqueado = @bloqueado, Fecha_Bloqueo = @fecha_bloqueo
                    WHERE ID_Usuario = @id
                `);

            await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario, `Contraseña incorrecta (intento ${nuevoIntento}/5)`, null, null, ip, userAgent, 'ERROR');
            await pool.close();
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Login exitoso - resetear intentos
        await pool.request()
            .input('id', sql.Int, usuario.ID_Usuario)
            .input('ultimo_login', sql.DateTime, new Date())
            .query(`
                UPDATE [hubspot].[Usuarios]
                SET Intentos_Fallidos = 0, Bloqueado = 0, Ultimo_Login = @ultimo_login
                WHERE ID_Usuario = @id
            `);

        // Generar token
        const token = generarToken(usuario);

        // Registrar login exitoso
        await registrarAuditoria(pool, usuario.ID_Usuario, 'LOGIN', 'Usuarios', usuario.ID_Usuario, 'Login exitoso', null, null, ip, userAgent, 'EXITOSO');

        await pool.close();

        return res.json({
            mensaje: 'Login exitoso',
            token,
            usuario: {
                id: usuario.ID_Usuario,
                email: usuario.Email,
                nombre: usuario.Nombre,
                rol: usuario.Nombre_Rol
            }
        });

    } catch (err) {
        console.error('Error en login:', err.message);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- LOGOUT ---
router.post('/logout', verificarToken, async (req, res) => {
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'];

    try {
        let pool = await sql.connect(req.app.locals.dbConfig);
        await registrarAuditoria(pool, req.usuario.id, 'LOGOUT', 'Usuarios', req.usuario.id, 'Logout exitoso', null, null, ip, userAgent, 'EXITOSO');
        await pool.close();

        return res.json({ mensaje: 'Logout exitoso' });
    } catch (err) {
        console.error('Error en logout:', err.message);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- CREAR USUARIO (Solo Admin) ---
router.post('/crear-usuario', verificarToken, esAdmin, async (req, res) => {
    const { email, nombre, apellido, rol } = req.body;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'];

    if (!email || !nombre || !rol) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    try {
        let pool = await sql.connect(req.app.locals.dbConfig);

        // Verificar que el rol exista
        let rolResult = await pool.request()
            .input('nombre_rol', sql.NVarChar, rol)
            .query('SELECT ID_Rol FROM [hubspot].[Roles] WHERE Nombre_Rol = @nombre_rol');

        if (rolResult.recordset.length === 0) {
            await pool.close();
            return res.status(400).json({ error: 'Rol no válido' });
        }

        const idRol = rolResult.recordset[0].ID_Rol;

        // Generar contraseña temporal
        const contraseñaTemporal = Math.random().toString(36).slice(-8) + 'Aa1!';
        const hashContraseña = await bcrypt.hash(contraseñaTemporal, 10);

        // Crear usuario
        let insertResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('nombre', sql.NVarChar, nombre)
            .input('apellido', sql.NVarChar, apellido)
            .input('hash', sql.NVarChar, hashContraseña)
            .input('id_rol', sql.Int, idRol)
            .query(`
                INSERT INTO [hubspot].[Usuarios] (Email, Nombre, Apellido, Contraseña_Hash, ID_Rol, Activo)
                OUTPUT INSERTED.ID_Usuario
                VALUES (@email, @nombre, @apellido, @hash, @id_rol, 1)
            `);

        const idUsuario = insertResult.recordset[0].ID_Usuario;

        // Registrar en auditoría
        await registrarAuditoria(pool, req.usuario.id, 'CREAR_USUARIO', 'Usuarios', idUsuario, `Usuario creado: ${email}`, null, { email, nombre, apellido, rol }, ip, userAgent, 'EXITOSO');

        await pool.close();

        return res.status(201).json({
            mensaje: 'Usuario creado exitosamente',
            usuario: {
                id: idUsuario,
                email,
                nombre,
                apellido,
                rol,
                contraseñaTemporal
            }
        });

    } catch (err) {
        console.error('Error al crear usuario:', err.message);
        if (err.message.includes('Violation of UNIQUE')) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- LISTAR USUARIOS (Solo Admin) ---
router.get('/usuarios', verificarToken, esAdmin, async (req, res) => {
    try {
        let pool = await sql.connect(req.app.locals.dbConfig);

        let result = await pool.request().query(`
            SELECT u.ID_Usuario, u.Email, u.Nombre, u.Apellido, u.Activo, u.Bloqueado, 
                   u.Ultimo_Login, u.Fecha_Creacion, r.Nombre_Rol
            FROM [hubspot].[Usuarios] u
            JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
            ORDER BY u.Fecha_Creacion DESC
        `);

        await pool.close();
        return res.json(result.recordset);

    } catch (err) {
        console.error('Error al listar usuarios:', err.message);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- EDITAR USUARIO (Solo Admin) ---
router.put('/usuarios/:id', verificarToken, esAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, rol, activo, bloqueado } = req.body;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'];

    try {
        let pool = await sql.connect(req.app.locals.dbConfig);

        // Obtener datos actuales
        let usuarioActual = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT u.ID_Usuario, u.Nombre, u.Apellido, u.Activo, u.Bloqueado, r.Nombre_Rol
                FROM [hubspot].[Usuarios] u
                JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
                WHERE u.ID_Usuario = @id
            `);

        if (usuarioActual.recordset.length === 0) {
            await pool.close();
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const valoresAnteriores = usuarioActual.recordset[0];

        // Actualizar usuario
        await pool.request()
            .input('id', sql.Int, id)
            .input('nombre', sql.NVarChar, nombre || valoresAnteriores.Nombre)
            .input('apellido', sql.NVarChar, apellido || valoresAnteriores.Apellido)
            .input('activo', sql.Bit, activo !== undefined ? activo : valoresAnteriores.Activo)
            .input('bloqueado', sql.Bit, bloqueado !== undefined ? bloqueado : valoresAnteriores.Bloqueado)
            .query(`
                UPDATE [hubspot].[Usuarios]
                SET Nombre = @nombre, Apellido = @apellido, Activo = @activo, Bloqueado = @bloqueado
                WHERE ID_Usuario = @id
            `);

        // Registrar auditoría
        await registrarAuditoria(pool, req.usuario.id, 'EDITAR_USUARIO', 'Usuarios', id, `Usuario editado: ${valoresAnteriores.Nombre}`, valoresAnteriores, { nombre, apellido, rol, activo, bloqueado }, ip, userAgent, 'EXITOSO');

        await pool.close();

        return res.json({ mensaje: 'Usuario actualizado' });

    } catch (err) {
        console.error('Error al actualizar usuario:', err.message);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- CAMBIAR CONTRASEÑA ---
router.post('/cambiar-contraseña', verificarToken, async (req, res) => {
    const { contraseñaActual, contraseñaNueva } = req.body;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'];

    if (!contraseñaActual || !contraseñaNueva) {
        return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
    }

    try {
        let pool = await sql.connect(req.app.locals.dbConfig);

        // Obtener usuario
        let result = await pool.request()
            .input('id', sql.Int, req.usuario.id)
            .query('SELECT Contraseña_Hash FROM [hubspot].[Usuarios] WHERE ID_Usuario = @id');

        const usuario = result.recordset[0];

        // Verificar contraseña actual
        const contraseñaValida = await bcrypt.compare(contraseñaActual, usuario.Contraseña_Hash);

        if (!contraseñaValida) {
            await registrarAuditoria(pool, req.usuario.id, 'CAMBIO_CONTRASEÑA', 'Usuarios', req.usuario.id, 'Intento de cambio con contraseña incorrecta', null, null, ip, userAgent, 'ERROR');
            await pool.close();
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        // Hashear nueva contraseña
        const nuevoHash = await bcrypt.hash(contraseñaNueva, 10);

        // Actualizar
        await pool.request()
            .input('id', sql.Int, req.usuario.id)
            .input('hash', sql.NVarChar, nuevoHash)
            .query('UPDATE [hubspot].[Usuarios] SET Contraseña_Hash = @hash WHERE ID_Usuario = @id');

        // Registrar
        await registrarAuditoria(pool, req.usuario.id, 'CAMBIO_CONTRASEÑA', 'Usuarios', req.usuario.id, 'Contraseña cambiada exitosamente', null, null, ip, userAgent, 'EXITOSO');

        await pool.close();

        return res.json({ mensaje: 'Contraseña actualizada' });

    } catch (err) {
        console.error('Error al cambiar contraseña:', err.message);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

module.exports = router;
