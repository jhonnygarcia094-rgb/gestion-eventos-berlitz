-- =====================================================
-- Script de creación de nuevas tablas
-- Proyecto: Gestión de Eventos Berlitz
-- Esquema: [dwberlitz].[hubspot]
-- Fecha: 2026-06-06
-- =====================================================

-- =====================================================
-- 1. AGREGAR COLUMNAS A TABLA USUARIOS
-- =====================================================
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[hubspot].[Usuarios]') AND name = 'Primer_Login'
)
BEGIN
    ALTER TABLE [hubspot].[Usuarios] ADD Primer_Login BIT DEFAULT 1;
    PRINT 'Columna Primer_Login agregada a [hubspot].[Usuarios]';
END
ELSE
    PRINT 'Columna Primer_Login ya existe';

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[hubspot].[Usuarios]') AND name = 'Apellido'
)
BEGIN
    ALTER TABLE [hubspot].[Usuarios] ADD Apellido NVARCHAR(150) NULL;
    PRINT 'Columna Apellido agregada a [hubspot].[Usuarios]';
END

-- =====================================================
-- 2. TABLA: ConfiguracionSistema
-- =====================================================
IF NOT EXISTS (
    SELECT * FROM sys.objects 
    WHERE object_id = OBJECT_ID(N'[hubspot].[ConfiguracionSistema]') AND type = N'U'
)
BEGIN
    CREATE TABLE [hubspot].[ConfiguracionSistema] (
        ConfigID        INT PRIMARY KEY IDENTITY(1,1),
        Clave           NVARCHAR(100) NOT NULL UNIQUE,
        Valor           NVARCHAR(500) NULL,
        Descripcion     NVARCHAR(255) NULL,
        ModificadoPor   INT NULL,
        FechaModificacion DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Config_Usuarios FOREIGN KEY (ModificadoPor) 
            REFERENCES [hubspot].[Usuarios](ID_Usuario) ON DELETE SET NULL
    );

    -- Valores iniciales de SMTP
    INSERT INTO [hubspot].[ConfiguracionSistema] (Clave, Valor, Descripcion) VALUES
    ('SMTP_HOST',    'smtp.gmail.com',             'Servidor SMTP de correo'),
    ('SMTP_PORT',    '587',                         'Puerto SMTP'),
    ('SMTP_SECURE',  'false',                       'Usar SSL/TLS directo (false = STARTTLS)'),
    ('SMTP_USER',    'jhonnygarcia094@gmail.com',   'Usuario/correo remitente SMTP'),
    ('SMTP_PASS',    'taqdzlprylteoloh',            'Contraseña o App Password del correo SMTP'),
    ('SMTP_FROM',    'Berlitz Sistema <jhonnygarcia094@gmail.com>', 'Nombre y correo del remitente'),
    ('APP_NAME',     'Berlitz - Gestión de Eventos','Nombre de la aplicación'),
    ('APP_URL',      'https://gestion-eventos-berlitz.onrender.com','URL base de la aplicación');

    PRINT 'Tabla [hubspot].[ConfiguracionSistema] creada e inicializada';
END
ELSE
    PRINT 'La tabla [hubspot].[ConfiguracionSistema] ya existe';

-- =====================================================
-- 3. TABLA: TokensRecuperacion (para reset de contraseña)
-- =====================================================
IF NOT EXISTS (
    SELECT * FROM sys.objects 
    WHERE object_id = OBJECT_ID(N'[hubspot].[TokensRecuperacion]') AND type = N'U'
)
BEGIN
    CREATE TABLE [hubspot].[TokensRecuperacion] (
        ID          INT PRIMARY KEY IDENTITY(1,1),
        ID_Usuario  INT NOT NULL,
        Token       NVARCHAR(255) NOT NULL UNIQUE,
        FechaExpira DATETIME NOT NULL,
        Usado       BIT DEFAULT 0,
        FechaCreacion DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Tokens_Usuarios FOREIGN KEY (ID_Usuario) 
            REFERENCES [hubspot].[Usuarios](ID_Usuario) ON DELETE CASCADE
    );

    CREATE INDEX IX_Tokens_Token    ON [hubspot].[TokensRecuperacion](Token);
    CREATE INDEX IX_Tokens_Expira   ON [hubspot].[TokensRecuperacion](FechaExpira);
    PRINT 'Tabla [hubspot].[TokensRecuperacion] creada';
END
ELSE
    PRINT 'La tabla [hubspot].[TokensRecuperacion] ya existe';

-- =====================================================
-- 4. TABLA: PermisosUsuarioModulo (permisos granulares)
-- =====================================================
IF NOT EXISTS (
    SELECT * FROM sys.objects 
    WHERE object_id = OBJECT_ID(N'[hubspot].[PermisosUsuarioModulo]') AND type = N'U'
)
BEGIN
    CREATE TABLE [hubspot].[PermisosUsuarioModulo] (
        ID          INT PRIMARY KEY IDENTITY(1,1),
        ID_Usuario  INT NOT NULL,
        Modulo      NVARCHAR(100) NOT NULL,   
        -- Módulos: dashboard, eventos, marketing_inversion, marketing_metas, admin_usuarios, admin_configuracion
        Puede_Ver       BIT DEFAULT 0,
        Puede_Crear     BIT DEFAULT 0,
        Puede_Editar    BIT DEFAULT 0,
        Puede_Eliminar  BIT DEFAULT 0,
        FechaAsignacion DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Permisos_Usuarios FOREIGN KEY (ID_Usuario) 
            REFERENCES [hubspot].[Usuarios](ID_Usuario) ON DELETE CASCADE,
        CONSTRAINT UQ_Usuario_Modulo UNIQUE (ID_Usuario, Modulo)
    );

    CREATE INDEX IX_PermisosModulo_Usuario ON [hubspot].[PermisosUsuarioModulo](ID_Usuario);
    PRINT 'Tabla [hubspot].[PermisosUsuarioModulo] creada';
END
ELSE
    PRINT 'La tabla [hubspot].[PermisosUsuarioModulo] ya existe';

-- =====================================================
-- 5. TABLA: Modulos (catálogo de módulos disponibles)
-- =====================================================
IF NOT EXISTS (
    SELECT * FROM sys.objects 
    WHERE object_id = OBJECT_ID(N'[hubspot].[Modulos]') AND type = N'U'
)
BEGIN
    CREATE TABLE [hubspot].[Modulos] (
        ID_Modulo   INT PRIMARY KEY IDENTITY(1,1),
        Clave       NVARCHAR(100) NOT NULL UNIQUE,
        Nombre      NVARCHAR(150) NOT NULL,
        Descripcion NVARCHAR(255),
        Icono       NVARCHAR(50),
        Orden       INT DEFAULT 0,
        Solo_Admin  BIT DEFAULT 0
    );

    INSERT INTO [hubspot].[Modulos] (Clave, Nombre, Descripcion, Icono, Orden, Solo_Admin) VALUES
    ('dashboard',            'Dashboard',               'Panel de control general',              'fa-tachometer-alt', 1, 0),
    ('eventos',              'Gestión de Eventos',      'Administración de eventos y festivos',  'fa-calendar-alt',   2, 0),
    ('marketing_inversion',  'Inversión Publicitaria',  'Gestión de inversión publicitaria',     'fa-chart-line',     3, 0),
    ('marketing_metas',      'Metas de Marketing',      'Gestión de metas y leads de marketing', 'fa-bullseye',      4, 0),
    ('admin_usuarios',       'Gestión de Usuarios',     'Administración de usuarios del sistema','fa-users',          5, 1),
    ('admin_configuracion',  'Configuración',           'Configuración del sistema',             'fa-cog',            6, 1);

    PRINT 'Tabla [hubspot].[Modulos] creada e inicializada';
END
ELSE
    PRINT 'La tabla [hubspot].[Modulos] ya existe';

-- =====================================================
-- 6. ASIGNAR PERMISOS COMPLETOS AL ADMIN EXISTENTE
--    (Para no perder acceso al migrar el sistema)
-- =====================================================
DECLARE @AdminID INT;
SELECT @AdminID = u.ID_Usuario 
FROM [hubspot].[Usuarios] u
JOIN [hubspot].[Roles] r ON u.ID_Rol = r.ID_Rol
WHERE r.Nombre_Rol = 'Admin';

IF @AdminID IS NOT NULL
BEGIN
    -- Insertar permisos completos para cada módulo si no existen
    INSERT INTO [hubspot].[PermisosUsuarioModulo] 
        (ID_Usuario, Modulo, Puede_Ver, Puede_Crear, Puede_Editar, Puede_Eliminar)
    SELECT @AdminID, Clave, 1, 1, 1, 1
    FROM [hubspot].[Modulos]
    WHERE NOT EXISTS (
        SELECT 1 FROM [hubspot].[PermisosUsuarioModulo] p
        WHERE p.ID_Usuario = @AdminID AND p.Modulo = [hubspot].[Modulos].Clave
    );

    -- Marcar admin como NO primer login
    UPDATE [hubspot].[Usuarios] SET Primer_Login = 0 WHERE ID_Usuario = @AdminID;

    PRINT 'Permisos completos asignados al usuario Admin';
END

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================
PRINT '';
PRINT '======================================';
PRINT 'Estado de las nuevas tablas:';
PRINT '======================================';
SELECT 'ConfiguracionSistema' AS Tabla, COUNT(*) AS Registros FROM [hubspot].[ConfiguracionSistema]
UNION ALL
SELECT 'PermisosUsuarioModulo', COUNT(*) FROM [hubspot].[PermisosUsuarioModulo]
UNION ALL
SELECT 'TokensRecuperacion', COUNT(*) FROM [hubspot].[TokensRecuperacion]
UNION ALL
SELECT 'Modulos', COUNT(*) FROM [hubspot].[Modulos];

PRINT 'Script completado exitosamente ✅';
