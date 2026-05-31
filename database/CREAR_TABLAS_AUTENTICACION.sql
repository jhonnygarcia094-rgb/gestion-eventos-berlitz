-- =====================================================
-- Script de creación de tablas para autenticación
-- Esquema: hubspot
-- Fecha: 2026-05-31
-- =====================================================

-- 1. CREAR TABLA DE ROLES
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[hubspot].[Roles]') AND type in (N'U'))
BEGIN
    CREATE TABLE [hubspot].[Roles] (
        ID_Rol INT PRIMARY KEY IDENTITY(1,1),
        Nombre_Rol NVARCHAR(50) NOT NULL UNIQUE,
        Descripcion NVARCHAR(255),
        Permisos_Ver BIT DEFAULT 1,
        Permisos_Crear BIT DEFAULT 0,
        Permisos_Editar BIT DEFAULT 0,
        Permisos_Eliminar BIT DEFAULT 0,
        Permisos_Gestionar_Usuarios BIT DEFAULT 0,
        Fecha_Creacion DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Tabla [hubspot].[Roles] creada exitosamente';
END
ELSE
    PRINT 'La tabla [hubspot].[Roles] ya existe';

-- 2. CREAR TABLA DE USUARIOS
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[hubspot].[Usuarios]') AND type in (N'U'))
BEGIN
    CREATE TABLE [hubspot].[Usuarios] (
        ID_Usuario INT PRIMARY KEY IDENTITY(1,1),
        Email NVARCHAR(255) NOT NULL UNIQUE,
        Nombre NVARCHAR(150) NOT NULL,
        Apellido NVARCHAR(150),
        Contraseña_Hash NVARCHAR(255) NOT NULL,
        ID_Rol INT NOT NULL,
        Activo BIT DEFAULT 1,
        Intentos_Fallidos INT DEFAULT 0,
        Bloqueado BIT DEFAULT 0,
        Fecha_Bloqueo DATETIME NULL,
        Ultimo_Login DATETIME NULL,
        Fecha_Creacion DATETIME DEFAULT GETDATE(),
        Fecha_Actualizacion DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Usuarios_Roles FOREIGN KEY (ID_Rol) REFERENCES [hubspot].[Roles](ID_Rol)
    );
    
    CREATE INDEX IX_Usuarios_Email ON [hubspot].[Usuarios](Email);
    PRINT 'Tabla [hubspot].[Usuarios] creada exitosamente';
END
ELSE
    PRINT 'La tabla [hubspot].[Usuarios] ya existe';

-- 3. CREAR TABLA DE AUDITORÍA
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[hubspot].[Auditoria]') AND type in (N'U'))
BEGIN
    CREATE TABLE [hubspot].[Auditoria] (
        ID_Auditoria BIGINT PRIMARY KEY IDENTITY(1,1),
        ID_Usuario INT,
        Tipo_Accion NVARCHAR(50) NOT NULL, -- LOGIN, LOGOUT, CREAR_EVENTO, EDITAR_EVENTO, ELIMINAR_EVENTO, CREAR_USUARIO, EDITAR_USUARIO, etc.
        Tabla_Afectada NVARCHAR(100),
        ID_Registro_Afectado INT,
        Descripcion NVARCHAR(MAX),
        Valores_Anteriores NVARCHAR(MAX), -- JSON con valores anteriores
        Valores_Nuevos NVARCHAR(MAX), -- JSON con valores nuevos
        Direccion_IP NVARCHAR(45),
        User_Agent NVARCHAR(MAX),
        Estado_Resultado NVARCHAR(20), -- EXITOSO, ERROR, etc.
        Fecha_Accion DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_Auditoria_Usuarios FOREIGN KEY (ID_Usuario) REFERENCES [hubspot].[Usuarios](ID_Usuario) ON DELETE SET NULL
    );
    
    CREATE INDEX IX_Auditoria_Usuario ON [hubspot].[Auditoria](ID_Usuario);
    CREATE INDEX IX_Auditoria_Fecha ON [hubspot].[Auditoria](Fecha_Accion);
    CREATE INDEX IX_Auditoria_Accion ON [hubspot].[Auditoria](Tipo_Accion);
    PRINT 'Tabla [hubspot].[Auditoria] creada exitosamente';
END
ELSE
    PRINT 'La tabla [hubspot].[Auditoria] ya existe';

-- 4. INSERTAR ROLES POR DEFECTO
IF NOT EXISTS (SELECT * FROM [hubspot].[Roles] WHERE Nombre_Rol = 'Admin')
BEGIN
    INSERT INTO [hubspot].[Roles] (Nombre_Rol, Descripcion, Permisos_Ver, Permisos_Crear, Permisos_Editar, Permisos_Eliminar, Permisos_Gestionar_Usuarios)
    VALUES ('Admin', 'Administrador del sistema', 1, 1, 1, 1, 1);
    
    PRINT 'Rol Admin insertado';
END

IF NOT EXISTS (SELECT * FROM [hubspot].[Roles] WHERE Nombre_Rol = 'Usuario')
BEGIN
    INSERT INTO [hubspot].[Roles] (Nombre_Rol, Descripcion, Permisos_Ver, Permisos_Crear, Permisos_Editar, Permisos_Eliminar, Permisos_Gestionar_Usuarios)
    VALUES ('Usuario', 'Usuario estándar', 1, 1, 0, 0, 0);
    
    PRINT 'Rol Usuario insertado';
END

IF NOT EXISTS (SELECT * FROM [hubspot].[Roles] WHERE Nombre_Rol = 'Viewer')
BEGIN
    INSERT INTO [hubspot].[Roles] (Nombre_Rol, Descripcion, Permisos_Ver, Permisos_Crear, Permisos_Editar, Permisos_Eliminar, Permisos_Gestionar_Usuarios)
    VALUES ('Viewer', 'Solo lectura', 1, 0, 0, 0, 0);
    
    PRINT 'Rol Viewer insertado';
END

-- 5. INSERTAR USUARIO ADMIN POR DEFECTO
-- Nota: La contraseña debe ser hasheada con bcrypt antes de insertar
-- Para generar el hash, usa: bcrypt.hash('Lut62504', 10)
-- El hash generado para 'Lut62504' es: $2b$10$YourHashHere (será reemplazado por el script Node.js)

IF NOT EXISTS (SELECT * FROM [hubspot].[Usuarios] WHERE Email = 'Jhonny.Garcia@berlitz.com.pe')
BEGIN
    -- Este es un placeholder, será actualizado por el script de inicialización
    INSERT INTO [hubspot].[Usuarios] (Email, Nombre, Apellido, Contraseña_Hash, ID_Rol, Activo)
    SELECT 'Jhonny.Garcia@berlitz.com.pe', 'Jhonny', 'Garcia', '$2b$10$placeholder', ID_Rol
    FROM [hubspot].[Roles]
    WHERE Nombre_Rol = 'Admin';
    
    PRINT 'Usuario Admin creado (contraseña pendiente de actualizar)';
END

-- 6. VERIFICAR QUE TODO ESTÉ CREADO
PRINT '';
PRINT '======================================';
PRINT 'Estado de las tablas:';
PRINT '======================================';

SELECT COUNT(*) as 'Roles' FROM [hubspot].[Roles];
SELECT COUNT(*) as 'Usuarios' FROM [hubspot].[Usuarios];
SELECT COUNT(*) as 'Registros Auditoría' FROM [hubspot].[Auditoria];

PRINT '';
PRINT 'Script de creación completado exitosamente ✅';
PRINT 'IMPORTANTE: La contraseña del admin será hasheada por el servidor Node.js';
