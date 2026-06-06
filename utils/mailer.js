// utils/mailer.js - Servicio de envío de correos electrónicos
const nodemailer = require('nodemailer');
const { getPool, sql } = require('./db-pool');

/**
 * Obtiene la configuración SMTP desde la base de datos
 * @returns {Promise<Object>} Configuración SMTP
 */
async function obtenerConfigSMTP() {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT Clave, Valor FROM [hubspot].[ConfiguracionSistema]
            WHERE Clave IN ('SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_FROM','APP_NAME','APP_URL')
        `);

        const config = {};
        result.recordset.forEach(row => {
            config[row.Clave] = row.Valor;
        });

        return config;
    } catch (err) {
        console.error('Error obteniendo config SMTP:', err.message);
        // Fallback a variables de entorno
        return {
            SMTP_HOST:   process.env.SMTP_HOST   || 'smtp.gmail.com',
            SMTP_PORT:   process.env.SMTP_PORT   || '587',
            SMTP_SECURE: process.env.SMTP_SECURE || 'false',
            SMTP_USER:   process.env.SMTP_USER,
            SMTP_PASS:   process.env.SMTP_PASS,
            SMTP_FROM:   process.env.SMTP_FROM   || process.env.SMTP_USER,
            APP_NAME:    'Berlitz - Gestión de Eventos',
            APP_URL:     process.env.CORS_ORIGIN || 'http://localhost:3000'
        };
    }
}

/**
 * Crea un transporte nodemailer con config dinámica de BD
 */
async function crearTransporte() {
    const config = await obtenerConfigSMTP();

    return {
        transporter: nodemailer.createTransport({
            host:   config.SMTP_HOST,
            port:   parseInt(config.SMTP_PORT),
            secure: config.SMTP_SECURE === 'true',
            auth: {
                user: config.SMTP_USER,
                pass: config.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        }),
        config
    };
}

/**
 * Envía correo de bienvenida con credenciales al nuevo usuario
 */
async function enviarCorreoBienvenida(destinatario, nombre, email, passwordTemporal) {
    const { transporter, config } = await crearTransporte();

    const appName = config.APP_NAME || 'Berlitz - Gestión de Eventos';
    const appUrl  = config.APP_URL  || 'https://gestion-eventos-berlitz.onrender.com';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a ${appName}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fa;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#0050f0,#001a5e);padding:40px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">
                                🎓 ${appName}
                            </h1>
                            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">
                                Sistema de Gestión Integral
                            </p>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding:40px;">
                            <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:22px;">
                                ¡Bienvenido, ${nombre}! 👋
                            </h2>
                            <p style="color:#555;line-height:1.7;margin:0 0 24px;">
                                Tu cuenta ha sido creada exitosamente en el sistema. 
                                A continuación encontrarás tus credenciales de acceso.
                            </p>

                            <!-- Credenciales -->
                            <div style="background:#f0f4ff;border:2px solid #0050f0;border-radius:10px;padding:24px;margin:24px 0;">
                                <h3 style="color:#0050f0;margin:0 0 16px;font-size:16px;text-transform:uppercase;letter-spacing:1px;">
                                    🔑 Tus Credenciales de Acceso
                                </h3>
                                <table width="100%" cellpadding="8">
                                    <tr>
                                        <td style="color:#888;font-size:13px;width:120px;">Usuario (Email):</td>
                                        <td style="color:#1a1a2e;font-weight:600;font-size:14px;">${email}</td>
                                    </tr>
                                    <tr>
                                        <td style="color:#888;font-size:13px;">Contraseña:</td>
                                        <td>
                                            <span style="background:#0050f0;color:#fff;font-weight:700;font-size:18px;padding:6px 16px;border-radius:6px;letter-spacing:2px;font-family:monospace;">
                                                ${passwordTemporal}
                                            </span>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Advertencia -->
                            <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:16px;border-radius:0 8px 8px 0;margin:0 0 24px;">
                                <strong style="color:#856404;">⚠️ Importante:</strong>
                                <p style="color:#856404;margin:4px 0 0;font-size:13px;line-height:1.5;">
                                    Al ingresar por primera vez, el sistema te pedirá cambiar tu contraseña. 
                                    Guarda esta información en un lugar seguro.
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align:center;margin:32px 0;">
                                <a href="${appUrl}/login.html" 
                                   style="background:linear-gradient(135deg,#0050f0,#0033a0);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;">
                                    🚀 Ingresar al Sistema
                                </a>
                            </div>

                            <p style="color:#999;font-size:12px;text-align:center;margin:0;">
                                Si tienes problemas para acceder, contacta al administrador del sistema.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #eee;">
                            <p style="color:#aaa;font-size:12px;margin:0;">
                                © ${new Date().getFullYear()} ${appName} • Correo generado automáticamente, no responder.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const info = await transporter.sendMail({
        from:    config.SMTP_FROM,
        to:      destinatario,
        subject: `🎓 Bienvenido a ${appName} - Tus credenciales de acceso`,
        html
    });

    console.log(`✅ Correo de bienvenida enviado a ${destinatario}: ${info.messageId}`);
    return info;
}

/**
 * Envía correo de recuperación de contraseña con link de reset
 */
async function enviarCorreoRecuperacion(destinatario, nombre, tokenReset) {
    const { transporter, config } = await crearTransporte();

    const appName = config.APP_NAME || 'Berlitz - Gestión de Eventos';
    const appUrl  = config.APP_URL  || 'https://gestion-eventos-berlitz.onrender.com';
    const resetUrl = `${appUrl}/reset-password.html?token=${tokenReset}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Recuperación de Contraseña - ${appName}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fa;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="background:linear-gradient(135deg,#0050f0,#001a5e);padding:40px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:28px;">🔐 ${appName}</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px;">
                            <h2 style="color:#1a1a2e;margin:0 0 16px;">Recuperación de Contraseña</h2>
                            <p style="color:#555;line-height:1.7;">
                                Hola <strong>${nombre}</strong>, recibimos una solicitud para restablecer la contraseña 
                                de tu cuenta. Si no fuiste tú, ignora este mensaje.
                            </p>

                            <div style="background:#f0f4ff;border-radius:10px;padding:24px;margin:24px 0;text-align:center;">
                                <p style="color:#555;margin:0 0 16px;">Este enlace expira en <strong>1 hora</strong>.</p>
                                <a href="${resetUrl}" 
                                   style="background:linear-gradient(135deg,#0050f0,#0033a0);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;">
                                    🔑 Restablecer Contraseña
                                </a>
                            </div>

                            <div style="background:#ffebee;border-left:4px solid #f44336;padding:16px;border-radius:0 8px 8px 0;">
                                <strong style="color:#c62828;">⚠️ Seguridad:</strong>
                                <p style="color:#c62828;margin:4px 0 0;font-size:13px;">
                                    Si no solicitaste este cambio, tu cuenta podría estar en riesgo. 
                                    Contacta al administrador inmediatamente.
                                </p>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #eee;">
                            <p style="color:#aaa;font-size:12px;margin:0;">
                                © ${new Date().getFullYear()} ${appName} • Correo automático, no responder.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const info = await transporter.sendMail({
        from:    config.SMTP_FROM,
        to:      destinatario,
        subject: `🔐 Recuperación de contraseña - ${appName}`,
        html
    });

    console.log(`✅ Correo de recuperación enviado a ${destinatario}: ${info.messageId}`);
    return info;
}

/**
 * Prueba la conexión SMTP (para panel de configuración)
 */
async function probarConexionSMTP() {
    try {
        const { transporter, config } = await crearTransporte();
        await transporter.verify();
        return { ok: true, config: { host: config.SMTP_HOST, port: config.SMTP_PORT, user: config.SMTP_USER } };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

module.exports = {
    enviarCorreoBienvenida,
    enviarCorreoRecuperacion,
    probarConexionSMTP,
    obtenerConfigSMTP
};
