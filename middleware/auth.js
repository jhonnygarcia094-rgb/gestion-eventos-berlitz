// Middleware para autenticación JWT
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura_cambiar_en_produccion';
const JWT_EXPIRES_IN = '24h';

// Generar token
function generarToken(usuario) {
    return jwt.sign(
        {
            id: usuario.ID_Usuario,
            email: usuario.Email,
            rol: usuario.Nombre_Rol,
            permisos: {
                ver: usuario.Permisos_Ver,
                crear: usuario.Permisos_Crear,
                editar: usuario.Permisos_Editar,
                eliminar: usuario.Permisos_Eliminar,
                gestionar_usuarios: usuario.Permisos_Gestionar_Usuarios
            }
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Middleware para verificar token
function verificarToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer token
    
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado' });
        }
        return res.status(401).json({ error: 'Token inválido' });
    }
}

// Middleware para verificar permisos
function verificarPermiso(permiso) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: 'No autenticado' });
        }
        
        if (!req.usuario.permisos[permiso]) {
            return res.status(403).json({ error: 'No tienes permiso para esta acción' });
        }
        
        next();
    };
}

// Middleware para verificar que sea Admin
function esAdmin(req, res, next) {
    if (req.usuario?.rol !== 'Admin') {
        return res.status(403).json({ error: 'Solo administradores' });
    }
    next();
}

module.exports = {
    generarToken,
    verificarToken,
    verificarPermiso,
    esAdmin,
    JWT_SECRET
};