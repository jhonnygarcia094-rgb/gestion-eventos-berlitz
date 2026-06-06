// middleware/auditoria.js — Middleware de auditoría
const sql = require('mssql');

/**
 * Registra una acción en la tabla de auditoría
 */
async function registrarAuditoria(pool, idUsuario, tipoAccion, tablaAfectada, idRegistro, descripcion,
    valoresAnteriores, valoresNuevos, direccionIP, userAgent, estadoResultado = 'EXITOSO') {
    try {
        await pool.request()
            .input('id_usuario',       sql.Int,      idUsuario)
            .input('tipo_accion',      sql.NVarChar, tipoAccion)
            .input('tabla_afectada',   sql.NVarChar, tablaAfectada)
            .input('id_registro',      sql.Int,      idRegistro)
            .input('descripcion',      sql.NVarChar, descripcion ? descripcion.substring(0, 500) : null)
            .input('valores_anteriores', sql.NVarChar(sql.MAX), valoresAnteriores ? JSON.stringify(valoresAnteriores) : null)
            .input('valores_nuevos',     sql.NVarChar(sql.MAX), valoresNuevos     ? JSON.stringify(valoresNuevos)     : null)
            .input('direccion_ip',     sql.NVarChar, direccionIP ? direccionIP.substring(0, 45) : 'desconocida')
            .input('user_agent',       sql.NVarChar(sql.MAX), userAgent)
            .input('estado_resultado', sql.NVarChar, estadoResultado)
            .query(`
                INSERT INTO [hubspot].[Auditoria] 
                    (ID_Usuario, Tipo_Accion, Tabla_Afectada, ID_Registro_Afectado, Descripcion, 
                     Valores_Anteriores, Valores_Nuevos, Direccion_IP, User_Agent, Estado_Resultado)
                VALUES 
                    (@id_usuario, @tipo_accion, @tabla_afectada, @id_registro, @descripcion,
                     @valores_anteriores, @valores_nuevos, @direccion_ip, @user_agent, @estado_resultado)
            `);
    } catch (err) {
        // No fallar la operación principal si la auditoría falla
        console.error('Error al registrar auditoría:', err.message);
    }
}

/**
 * Extrae la IP real del cliente considerando proxies/load balancers
 */
function obtenerIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || 'desconocida';
}

module.exports = { registrarAuditoria, obtenerIP };