require('dotenv').config();
const { getPool, sql } = require('./utils/db-pool');

async function run() {
    try {
        const pool = await getPool();
        
        console.log("--- Dim_Fuente Original ---");
        try {
            const t1 = await pool.request().query("SELECT TOP 1 * FROM [hubspot].[Dim_Fuente Original]");
            console.log(t1.recordset.length ? Object.keys(t1.recordset[0]) : "Empty table");
        } catch(e) { console.error("Error Dim_Fuente", e.message); }

        console.log("--- metasAsesor ---");
        try {
            const t2 = await pool.request().query("SELECT TOP 1 * FROM [hubspot].[metasAsesor]");
            console.log(t2.recordset.length ? Object.keys(t2.recordset[0]) : "Empty table");
        } catch(e) { console.error("Error metasAsesor", e.message); }

        console.log("--- Owners ---");
        try {
            const t3 = await pool.request().query("SELECT TOP 1 * FROM [hubspot].[Owners]");
            console.log(t3.recordset.length ? Object.keys(t3.recordset[0]) : "Empty table");
        } catch(e) { console.error("Error Owners", e.message); }

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
