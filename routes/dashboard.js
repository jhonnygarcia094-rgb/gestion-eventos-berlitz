// routes/dashboard.js — Estadísticas generales para el dashboard
const express = require('express');
const { getPool, sql } = require('../utils/db-pool');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats — Estadísticas generales
router.get('/stats', verificarToken, async (req, res) => {
    try {
        const pool = await getPool();
        const anioActual = new Date().getFullYear();
        const mesActual  = new Date().getMonth() + 1;

        // Eventos del año
        const eventosAnio = await pool.request()
            .input('anio', sql.Int, anioActual)
            .query(`
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN MONTH(Fecha) = MONTH(GETDATE()) THEN 1 ELSE 0 END) AS este_mes,
                       SUM(CASE WHEN Fecha >= GETDATE() THEN 1 ELSE 0 END) AS proximos
                FROM [hubspot].[EventosyFestivos]
                WHERE YEAR(Fecha) = @anio
            `);

        // Usuarios activos
        const usuarios = await pool.request().query(`
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN Activo = 1 AND Bloqueado = 0 THEN 1 ELSE 0 END) AS activos,
                   SUM(CASE WHEN Bloqueado = 1 THEN 1 ELSE 0 END) AS bloqueados
            FROM [hubspot].[Usuarios]
        `);

        // Inversión publicitaria (intentar, puede fallar si tabla no existe aún)
        let inversion = { total: 0, periodos: 0 };
        try {
            const invResult = await pool.request()
                .input('anio', sql.NVarChar, anioActual.toString())
                .query(`
                    SELECT 
                        ISNULL(SUM(Amount_Spend), 0) AS total,
                        COUNT(DISTINCT ID_Periodo) AS periodos
                    FROM [hubspot].[inversionPublicitaria]
                    WHERE ID_Periodo LIKE @anio + '%'
                `);
            inversion = invResult.recordset[0];
        } catch (e) { /* tabla puede no tener datos */ }

        // Metas de Marketing
        let metas = { total_registros: 0, total_leads: 0, total_matriculas: 0 };
        try {
            const metasResult = await pool.request()
                .input('anio', sql.NVarChar, anioActual.toString())
                .query(`
                    SELECT 
                        COUNT(*) AS total_registros,
                        ISNULL(SUM(Leads), 0) AS total_leads,
                        ISNULL(SUM(Matriculas), 0) AS total_matriculas
                    FROM [hubspot].[MetasMarketing]
                    WHERE ID_Periodo LIKE @anio + '%'
                `);
            metas = metasResult.recordset[0];
        } catch (e) { /* tabla puede no tener datos */ }

        // Actividad reciente (últimos 10 registros de auditoría)
        const auditoria = await pool.request()
            .input('limit', sql.Int, 10)
            .query(`
                SELECT TOP 10 
                    a.Tipo_Accion, a.Descripcion, a.Estado_Resultado, a.Fecha_Accion,
                    u.Nombre + ' ' + ISNULL(u.Apellido,'') AS Usuario
                FROM [hubspot].[Auditoria] a
                LEFT JOIN [hubspot].[Usuarios] u ON a.ID_Usuario = u.ID_Usuario
                ORDER BY a.Fecha_Accion DESC
            `);

        // Próximos eventos (los 5 más cercanos)
        const proximosEventos = await pool.request().query(`
            SELECT TOP 5 E.Descripción, E.Fecha, D.Des_pipeline AS Pais
            FROM [hubspot].[EventosyFestivos] E
            LEFT JOIN [hubspot].[Dim_pipeline] D ON E.ID_pipeline = D.ID_pipeline
            WHERE E.Fecha >= CAST(GETDATE() AS DATE)
            ORDER BY E.Fecha ASC
        `);

        // Eventos por pipeline (para gráfico)
        const eventosPorPais = await pool.request()
            .input('anio', sql.Int, anioActual)
            .query(`
                SELECT D.Des_pipeline AS Pais, COUNT(*) AS Total
                FROM [hubspot].[EventosyFestivos] E
                LEFT JOIN [hubspot].[Dim_pipeline] D ON E.ID_pipeline = D.ID_pipeline
                WHERE YEAR(E.Fecha) = @anio
                GROUP BY D.Des_pipeline
                ORDER BY Total DESC
            `);

        return res.json({
            anio: anioActual,
            eventos: eventosAnio.recordset[0],
            usuarios: usuarios.recordset[0],
            inversion,
            metas,
            actividad_reciente: auditoria.recordset,
            proximos_eventos:   proximosEventos.recordset,
            eventos_por_pais:   eventosPorPais.recordset
        });

    } catch (err) {
        console.error('Error GET /dashboard/stats:', err.message);
        return res.status(500).json({ error: 'Error obteniendo estadísticas del dashboard' });
    }
});

module.exports = router;
