// Script para hashear la contraseña del admin
// Ejecutar con: npm run hash-password

const bcrypt = require('bcrypt');
const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

async function hashPassword() {
    const plainPassword = 'Lut62504';
    const saltRounds = 10;
    
    try {
        console.log('🔐 Hasheando contraseña del admin...');
        const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
        console.log('✅ Contraseña hasheada:', hashedPassword);
        
        console.log('\n📊 Actualizando base de datos...');
        let pool = await sql.connect(config);
        
        await pool.request()
            .input('email', sql.NVarChar, 'Jhonny.Garcia@berlitz.com.pe')
            .input('hash', sql.NVarChar, hashedPassword)
            .query('UPDATE [hubspot].[Usuarios] SET Contraseña_Hash = @hash WHERE Email = @email');
        
        console.log('✅ Base de datos actualizada exitosamente');
        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

hashPassword();