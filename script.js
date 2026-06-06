const API_URL = 'https://gestion-eventos-berlitz.onrender.com/eventos';
const PIPELINES_URL = 'https://gestion-eventos-berlitz.onrender.com/pipelines';
const ELIMINAR_URL = 'https://gestion-eventos-berlitz.onrender.com/eliminar-evento';
let datosGlobales = [];

// Obtener token
function obtenerToken() {
    return localStorage.getItem('token');
}

// Obtener usuario
function obtenerUsuario() {
    const usuario = localStorage.getItem('usuario');
    return usuario ? JSON.parse(usuario) : null;
}

// Logout
function logout() {
    const token = obtenerToken();
    
    if (token) {
        fetch('https://gestion-eventos-berlitz.onrender.com/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }).catch(err => console.error('Error al logout:', err));
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/login.html';
}

// Fetch autenticado
function fetchAutenticado(url, opciones = {}) {
    const token = obtenerToken();
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    const headers = opciones.headers || {};
    headers['Authorization'] = `Bearer ${token}`;
    headers['Content-Type'] = 'application/json';
    
    return fetch(url, {
        ...opciones,
        headers
    });
}

// 1. CARGA INICIAL: Se ejecuta al abrir la página
window.onload = async function() {
    console.log("Iniciando aplicación...");
    
    // Verificar autenticación
    if (!obtenerToken()) {
        window.location.href = '/login.html';
        return;
    }
    
    // Mostrar datos del usuario
    mostrarDatosUsuario();
    
    await cargarPipelines(); 
    await cargarDatos();     
};

// Mostrar datos del usuario autenticado
function mostrarDatosUsuario() {
    const usuario = obtenerUsuario();
    
    if (usuario) {
        const userInfoDiv = document.getElementById('userInfo');
        if (userInfoDiv) {
            userInfoDiv.innerHTML = `
                <span>👤 ${usuario.nombre} (${usuario.rol})</span>
                <button class="btn-logout" onclick="logout()">Salir</button>
            `;
        }
    }
}

// 2. OBTENER PIPELINES (Para filtros y formulario)
async function cargarPipelines() {
    try {
        const resp = await fetchAutenticado(PIPELINES_URL);
        
        if (!resp.ok) {
            throw new Error(`Error al cargar pipelines: ${resp.statusText}`);
        }
        
        const pipelines = await resp.json();
        
        const selectFiltro = document.getElementById('filtroPipeline');
        const selectNuevo = document.getElementById('nuevoPipe');
        
        if(!selectFiltro || !selectNuevo) {
            console.warn("No se encontraron los elementos select de pipelines");
            return;
        }

        selectFiltro.innerHTML = '<option value="">Todos los paises</option>';
        selectNuevo.innerHTML = '<option value="">-- Seleccione un pais --</option>';
        
        pipelines.forEach(p => {
            selectFiltro.innerHTML += `<option value="${escapeHtml(p.Des_pipeline)}">${escapeHtml(p.Des_pipeline)}</option>`;
            selectNuevo.innerHTML += `<option value="${p.ID_pipeline}">${escapeHtml(p.Des_pipeline)}</option>`;
        });
        console.log("✅ Pipelines cargados.");
    } catch (err) {
        console.error("Error al obtener pipelines:", err);
        alert("No se pudieron cargar los países.");
    }
}

// 3. OBTENER EVENTOS (Consulta principal)
async function cargarDatos() {
    try {
        const resp = await fetchAutenticado(API_URL);
        if (!resp.ok) throw new Error("Error en el servidor");
        
        datosGlobales = await resp.json();
        renderizarTabla(datosGlobales);
    } catch (err) {
        console.error("Error al cargar eventos:", err);
        alert("No se pudieron cargar los datos.");
    }
}

// 4. DIBUJAR TABLA (Incluye botón eliminar)
function renderizarTabla(lista) {
    const tbody = document.querySelector('#tablaEventos tbody');
    
    if (!tbody) {
        console.error("No se encontró el tbody de la tabla");
        return;
    }
    
    tbody.innerHTML = '';
    
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay registros.</td></tr>';
        return;
    }

    const usuario = obtenerUsuario();
    const puedeEliminar = usuario && usuario.rol === 'Admin';

    lista.forEach(item => {
        const fechaObj = new Date(item.Fecha);
        const fechaTxt = fechaObj.getUTCDate().toString().padStart(2, '0') + '/' + 
                         (fechaObj.getUTCMonth() + 1).toString().padStart(2, '0') + '/' + 
                         fechaObj.getUTCFullYear();

        const botonesAccion = puedeEliminar ? 
            `<button class="btn-eliminar" onclick="confirmarEliminacion(${item.ID})">🗑️ Eliminar</button>` : 
            '<span style="color: #999;">-</span>';

        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHtml(item.Descripción)}</strong></td>
                <td>${fechaTxt}</td>
                <td>${escapeHtml(item.Des_pipeline || 'N/A')}</td>
                <td>${botonesAccion}</td>
            </tr>
        `;
    });
}

// 5. LÓGICA DE FILTRADO
function filtrar() {
    const desc = document.getElementById('filtroDesc').value.toLowerCase();
    const mes = document.getElementById('filtroMes').value;
    const anio = document.getElementById('filtroAnio').value;
    const pipe = document.getElementById('filtroPipeline').value;

    const filtrados = datosGlobales.filter(item => {
        const f = new Date(item.Fecha);
        const mObj = (f.getUTCMonth() + 1).toString().padStart(2, '0');
        const aObj = f.getUTCFullYear().toString();
        const pObj = item.Des_pipeline || "";

        return item.Descripción.toLowerCase().includes(desc) &&
               (mes === "" || mObj === mes) &&
               (anio === "" || aObj === anio) &&
               (pipe === "" || pObj === pipe);
    });

    renderizarTabla(filtrados);
}

// 6. GUARDAR REGISTRO
async function guardarRegistro() {
    const desc = document.getElementById('nuevoDesc').value.trim();
    const fecha = document.getElementById('nuevaFecha').value;
    const pipeId = document.getElementById('nuevoPipe').value;

    if (!desc || !fecha || !pipeId) {
        alert("Completa todos los campos.");
        return;
    }

    try {
        const resp = await fetchAutenticado(API_URL, {
            method: 'POST',
            body: JSON.stringify({ descripcion: desc, fecha: fecha, id_pipeline: parseInt(pipeId) })
        });

        if (resp.ok) {
            alert("✅ Guardado exitosamente.");
            document.getElementById('nuevoDesc').value = '';
            document.getElementById('nuevaFecha').value = '';
            document.getElementById('nuevoPipe').value = '';
            mostrarConsulta();
            cargarDatos(); 
        } else {
            const error = await resp.json();
            alert("Error al guardar: " + (error.error || "Error desconocido"));
        }
    } catch (err) {
        console.error("Error al guardar:", err);
        alert("Error al guardar el registro.");
    }
}

// 7. ELIMINAR REGISTRO
async function confirmarEliminacion(id) {
    if (confirm("¿Seguro que deseas eliminar este registro?")) {
        try {
            const resp = await fetchAutenticado(ELIMINAR_URL, {
                method: 'POST',
                body: JSON.stringify({ id: id })
            });

            if (resp.ok) {
                alert("✅ Registro eliminado.");
                cargarDatos();
            } else {
                const error = await resp.json();
                alert("Error al eliminar: " + (error.error || "Error desconocido"));
            }
        } catch (err) {
            console.error("Error al eliminar:", err);
            alert("Error al eliminar el registro.");
        }
    }
}

// 8. NAVEGACIÓN
function mostrarFormulario() {
    document.getElementById('vistaConsulta').style.display = 'none';
    document.getElementById('vistaFormulario').style.display = 'block';
}

function mostrarConsulta() {
    document.getElementById('vistaFormulario').style.display = 'none';
    document.getElementById('vistaConsulta').style.display = 'block';
}

// 9. FUNCIÓN PARA ESCAPAR HTML (Prevenir XSS)
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}