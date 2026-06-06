-- =====================================================
-- Script de alteración de tablas de Marketing
-- Proyecto: Gestión de Eventos Berlitz
-- Esquema: [dwberlitz].[hubspot]
-- Fecha: 2026-06-06
-- IMPORTANTE: Ejecutar con precaución si hay datos existentes
-- =====================================================

-- =====================================================
-- 1. TABLA: inversionPublicitaria — Agregar PK
-- =====================================================
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[hubspot].[inversionPublicitaria]') 
      AND name = 'ID_Inversion'
)
BEGIN
    -- Agregar columna PK con IDENTITY
    ALTER TABLE [hubspot].[inversionPublicitaria] 
    ADD ID_Inversion INT IDENTITY(1,1) NOT NULL;

    -- Agregar constraint PK
    ALTER TABLE [hubspot].[inversionPublicitaria]
    ADD CONSTRAINT PK_inversionPublicitaria PRIMARY KEY (ID_Inversion);

    PRINT 'PK ID_Inversion agregada a [hubspot].[inversionPublicitaria]';
END
ELSE
    PRINT 'La columna ID_Inversion ya existe en [hubspot].[inversionPublicitaria]';

-- Agregar columnas de auditoría si no existen
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[hubspot].[inversionPublicitaria]') 
      AND name = 'FechaCarga'
)
BEGIN
    ALTER TABLE [hubspot].[inversionPublicitaria] 
    ADD FechaCarga DATETIME DEFAULT GETDATE(),
        FechaActualizacion DATETIME DEFAULT GETDATE(),
        CreadoPor INT NULL,
        ActualizadoPor INT NULL;

    PRINT 'Columnas de auditoría agregadas a [hubspot].[inversionPublicitaria]';
END

-- Índices para inversionPublicitaria
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InversionPubl_Periodo' AND object_id = OBJECT_ID('[hubspot].[inversionPublicitaria]'))
BEGIN
    CREATE INDEX IX_InversionPubl_Periodo   ON [hubspot].[inversionPublicitaria](ID_Periodo);
    CREATE INDEX IX_InversionPubl_Pipeline  ON [hubspot].[inversionPublicitaria](ID_pipeline);
    PRINT 'Índices creados para [hubspot].[inversionPublicitaria]';
END

-- =====================================================
-- 2. TABLA: MetasMarketing — Verificar/Agregar PK
-- =====================================================
-- La columna 'llave' existe pero puede no ser PK formal
-- Verificar si ya tiene una PK definida
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'hubspot' 
      AND TABLE_NAME = 'MetasMarketing'
      AND CONSTRAINT_TYPE = 'PRIMARY KEY'
)
BEGIN
    -- Si 'llave' tiene valores únicos, usarla como PK
    -- De lo contrario, agregar columna nueva ID_Meta
    IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[hubspot].[MetasMarketing]') 
          AND name = 'ID_Meta'
    )
    BEGIN
        ALTER TABLE [hubspot].[MetasMarketing]
        ADD ID_Meta INT IDENTITY(1,1) NOT NULL;

        ALTER TABLE [hubspot].[MetasMarketing]
        ADD CONSTRAINT PK_MetasMarketing PRIMARY KEY (ID_Meta);

        PRINT 'PK ID_Meta agregada a [hubspot].[MetasMarketing]';
    END
END
ELSE
BEGIN
    -- Verificar si ID_Meta ya existe, si no, agregarla de forma alternativa
    IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[hubspot].[MetasMarketing]') 
          AND name = 'ID_Meta'
    )
    BEGIN
        ALTER TABLE [hubspot].[MetasMarketing]
        ADD ID_Meta INT IDENTITY(1,1) NOT NULL;
        PRINT 'Columna ID_Meta agregada a [hubspot].[MetasMarketing]';
    END

    PRINT 'La tabla [hubspot].[MetasMarketing] ya tiene una PK definida';
END

-- Índices para MetasMarketing
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MetasMarketing_Periodo' AND object_id = OBJECT_ID('[hubspot].[MetasMarketing]'))
BEGIN
    CREATE INDEX IX_MetasMarketing_Periodo  ON [hubspot].[MetasMarketing](ID_Periodo);
    CREATE INDEX IX_MetasMarketing_Pais     ON [hubspot].[MetasMarketing](Pais);
    CREATE INDEX IX_MetasMarketing_Tipo     ON [hubspot].[MetasMarketing](TipoLeads);
    PRINT 'Índices creados para [hubspot].[MetasMarketing]';
END

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================
PRINT '';
PRINT '======================================';
PRINT 'Estructura de tablas de Marketing:';
PRINT '======================================';

SELECT 
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    c.IS_NULLABLE,
    CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PK' ELSE '' END AS Es_PK
FROM INFORMATION_SCHEMA.TABLES t
JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
LEFT JOIN (
    SELECT ku.TABLE_NAME, ku.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
WHERE t.TABLE_SCHEMA = 'hubspot' 
  AND t.TABLE_NAME IN ('inversionPublicitaria', 'MetasMarketing')
ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION;

PRINT 'Script de alteración completado exitosamente ✅';
