const { sql } = require('mssql');
const { getPool } = require('./utils/db-pool');

async function test() {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT id as OwnerId, 
                   fullName as OwnerName,
                   email as Email
            FROM [hubspot].[Owners] 
            WHERE id IS NOT NULL
            ORDER BY fullName
        `);
        console.log("Owners:", result.recordset);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}
test();
