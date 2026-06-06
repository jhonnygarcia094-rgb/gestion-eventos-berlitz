# Gestión de Eventos Berlitz

Aplicación web para la gestión de eventos y festivos de Berlitz.

## 📋 Descripción

Sistema CRUD (Create, Read, Update, Delete) para administrar eventos y festivos con filtros por fecha, país y descripción.

## 🛠️ Tecnologías

- **Frontend:** HTML, CSS, JavaScript vanilla
- **Backend:** Node.js con Express
- **Base de Datos:** SQL Server (MSSQL)
- **Deployment:** Render

## 📦 Instalación

### Requisitos previos
- Node.js >= 14.0.0
- npm o yarn
- SQL Server (remoto)

### Pasos de instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/jhonnygarcia094-rgb/gestion-eventos-berlitz.git
cd gestion-eventos-berlitz
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```
Editar el archivo `.env` con tus credenciales:
```env
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_SERVER=tu_servidor.database.windows.net
DB_DATABASE=tu_base_datos
PORT=3000
```

4. **Iniciar el servidor**
```bash
npm start
```

Para desarrollo con auto-reload:
```bash
npm run dev
```

## 🚀 Uso

1. Accede a `http://localhost:3000` en tu navegador
2. La aplicación cargará automáticamente los eventos del año actual
3. Usa los filtros para buscar eventos
4. Agrega, edita o elimina eventos según sea necesario

## 📋 Funcionalidades

- ✅ Listar todos los eventos del año actual
- ✅ Filtrar por descripción, mes, año y país
- ✅ Agregar nuevos eventos
- ✅ Eliminar eventos
- ✅ Validación de datos en cliente y servidor
- ✅ Protección contra XSS

## 🔒 Seguridad

- ✅ Credenciales en variables de entorno (.env)
- ✅ Consultas SQL con parámetros preparados
- ✅ Validación de entrada en cliente y servidor
- ✅ Escape de caracteres HTML (prevención XSS)
- ✅ CORS configurado

## 📝 Cambios recientes

### Correcciones de seguridad
- Movidas las credenciales a variables de entorno
- Agregado `.gitignore` para proteger datos sensibles
- Implementadas consultas SQL con parámetros preparados
- Validación de entrada mejorada
- Protección XSS en el frontend

## 👨‍💻 Autor

jhonnygarcia094-rgb

## 📄 Licencia

ISC

---

**Nota:** Antes de deployar, asegúrate de configurar correctamente las variables de entorno en tu plataforma de hosting (Render, Heroku, etc.)
