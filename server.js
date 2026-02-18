const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// CONFIGURACIÓN DE CREDENCIALES
const config = {
    user: 'biberlitzta', // Reemplaza
    password: 'Ingenieria50.##_', // Reemplaza
    server: 'berlitz.database.windows.net', // Reemplaza
    database: 'dwberlitz',
    options: {
        encrypt: true, 
        trustServerCertificate: false 
    }
};

// Obtener registros (Consulta amigable con JOIN)
app.get('/eventos', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        const anioActual = new Date().getFullYear();
        
        // Esta consulta trae por defecto el año en curso para no saturar la red
        let result = await pool.request().query(`
            SELECT E.ID, E.Descripción, E.Fecha, D.Des_pipeline 
            FROM [hubspot].[EventosyFestivos] E
            LEFT JOIN [hubspot].[Dim_pipeline] D ON E.ID_pipeline = D.ID_pipeline
            WHERE YEAR(E.Fecha) = ${anioActual}
            ORDER BY E.Fecha DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Nueva ruta para obtener la lista de Pipelines para el desplegable
// Ruta para obtener la lista de Pipelines (Dim_pipeline)
app.get('/pipelines', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        let result = await pool.request().query(`
            SELECT ID_pipeline, Des_pipeline 
            FROM [hubspot].[Dim_pipeline]
            ORDER BY Des_pipeline ASC
        `);
        res.json(result.recordset); // Esto envía los datos al navegador
    } catch (err) {
        console.error("Error en /pipelines:", err);
        res.status(500).send(err.message);
    }
});

// Insertar nuevo registro
app.post('/eventos', async (req, res) => {
    const { descripcion, fecha, id_pipeline } = req.body;
    try {
        let pool = await sql.connect(config);
        await pool.request()
            .input('desc', sql.NVarChar, descripcion)
            .input('fecha', sql.Date, fecha)
            .input('pipe', sql.Int, id_pipeline)
            .query('INSERT INTO [hubspot].[EventosyFestivos] (Descripción, Fecha, ID_pipeline) VALUES (@desc, @fecha, @pipe)');
        res.status(201).send("Registro guardado");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Ruta para eliminar un registro
app.post('/eliminar-evento', async (req, res) => {
    const { id } = req.body;
    try {
        let pool = await sql.connect(config);
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM [hubspot].[EventosyFestivos] WHERE ID = @id');
        res.status(200).send("Registro eliminado");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));