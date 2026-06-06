// utils/dbPool.js - Pool de conexiones persistente a SQL Server
const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 1,
        idleTimeoutMillis: 30000
    }
};

let poolPromise = null;

/**
 * Obtiene el pool de conexiones (singleton)
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(config)
            .connect()
            .then(pool => {
                console.log('✅ Pool de conexión SQL Server establecido');
                pool.on('error', err => {
                    console.error('❌ Error en pool SQL Server:', err);
                    poolPromise = null; // Resetear para reconectar
                });
                return pool;
            })
            .catch(err => {
                poolPromise = null;
                console.error('❌ Error conectando a SQL Server:', err.message);
                throw err;
            });
    }
    return poolPromise;
}

/**
 * Ejecuta una consulta con parámetros de forma segura
 * @param {string} query - Consulta SQL parametrizada
 * @param {Array} params - Array de {name, type, value}
 * @returns {Promise<sql.IResult>}
 */
async function executeQuery(query, params = []) {
    const pool = await getPool();
    const request = pool.request();
    params.forEach(p => request.input(p.name, p.type, p.value));
    return request.query(query);
}

module.exports = { getPool, executeQuery, sql };
