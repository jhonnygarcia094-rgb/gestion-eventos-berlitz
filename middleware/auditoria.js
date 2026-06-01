// Middleware para auditoría
const sql = require('mssql');

async function registrarAuditoria(pool, idUsuario, tipoAccion, tablaAfectada, idRegistro, descripcion, valoresAnteriores, valoresNuevos, direccionIP, userAgent, estadoResultado = 'EXITOSO') {
    try {
        await pool.request()
            .input('id_usuario', sql.Int, idUsuario)
            .input('tipo_accion', sql.NVarChar, tipoAccion)
            .input('tabla_afectada', sql.NVarChar, tablaAfectada)
            .input('id_registro', sql.Int, idRegistro)
            .input('descripcion', sql.NVarChar, descripcion)
            .input('valores_anteriores', sql.NVarChar, valoresAnteriores ? JSON.stringify(valoresAnteriores) : null)
            .input('valores_nuevos', sql.NVarChar, valoresNuevos ? JSON.stringify(valoresNuevos) : null)
            .input('direccion_ip', sql.NVarChar, direccionIP)
            .input('user_agent', sql.NVarChar, userAgent)
            .input('estado_resultado', sql.NVarChar, estadoResultado)
            .query(`
                INSERT INTO [hubspot].[Auditoria] 
                (ID_Usuario, Tipo_Accion, Tabla_Afectada, ID_Registro_Afectado, Descripcion, Valores_Anteriores, Valores_Nuevos, Direccion_IP, User_Agent, Estado_Resultado)
                VALUES (@id_usuario, @tipo_accion, @tabla_afectada, @id_registro, @descripcion, @valores_anteriores, @valores_nuevos, @direccion_ip, @user_agent, @estado_resultado)
            `);
    } catch (err) {
        console.error('Error al registrar auditoría:', err.message);
    }
}

// Middleware para obtener IP del cliente
function obtenerIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.connection.remoteAddress || 
           req.ip || 
           'desconocida';
}

module.exports = {
    registrarAuditoria,
    obtenerIP
};