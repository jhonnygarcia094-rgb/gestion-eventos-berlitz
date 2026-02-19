const API_URL = 'https://gestion-eventos-berlitz.onrender.com/eventos';
const PIPELINES_URL = 'https://gestion-eventos-berlitz.onrender.com/pipelines';
const ELIMINAR_URL = 'https://gestion-eventos-berlitz.onrender.com/eliminar-evento';
let datosGlobales = [];

// 1. CARGA INICIAL: Se ejecuta al abrir la página
window.onload = async function() {
    console.log("Iniciando aplicación...");
    await cargarPipelines(); 
    await cargarDatos();     
};

// 2. OBTENER PIPELINES (Para filtros y formulario)
async function cargarPipelines() {
    try {
        const resp = await fetch(PIPELINES_URL);
        const pipelines = await resp.json();
        
        const selectFiltro = document.getElementById('filtroPipeline');
        const selectNuevo = document.getElementById('nuevoPipe');
        
        if(!selectFiltro || !selectNuevo) return;

        selectFiltro.innerHTML = '<option value="">Todos los paises</option>';
        selectNuevo.innerHTML = '<option value="">-- Seleccione un pais --</option>';
        
        pipelines.forEach(p => {
            selectFiltro.innerHTML += `<option value="${p.Des_pipeline}">${p.Des_pipeline}</option>`;
            selectNuevo.innerHTML += `<option value="${p.ID_pipeline}">${p.Des_pipeline}</option>`;
        });
        console.log("Pipelines cargados.");
    } catch (err) {
        console.error("Error al obtener pipelines:", err);
    }
}

// 3. OBTENER EVENTOS (Consulta principal)
async function cargarDatos() {
    try {
        const resp = await fetch(API_URL);
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
    tbody.innerHTML = '';
    
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay registros.</td></tr>';
        return;
    }

    lista.forEach(item => {
        const fechaObj = new Date(item.Fecha);
        const fechaTxt = fechaObj.getUTCDate().toString().padStart(2, '0') + '/' + 
                         (fechaObj.getUTCMonth() + 1).toString().padStart(2, '0') + '/' + 
                         fechaObj.getUTCFullYear();

        tbody.innerHTML += `
            <tr>
                <td><strong>${item.Descripción}</strong></td>
                <td>${fechaTxt}</td>
                <td>${item.Des_pipeline || 'N/A'}</td>
                <td>
                    <button class="btn-eliminar" onclick="confirmarEliminacion(${item.ID})">🗑️ Eliminar</button>
                </td>
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
    const desc = document.getElementById('nuevoDesc').value;
    const fecha = document.getElementById('nuevaFecha').value;
    const pipeId = document.getElementById('nuevoPipe').value;

    if (!desc || !fecha || !pipeId) {
        alert("Completa todos los campos.");
        return;
    }

    try {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descripcion: desc, fecha: fecha, id_pipeline: parseInt(pipeId) })
        });

        if (resp.ok) {
            alert("✅ Guardado.");
            document.getElementById('nuevoDesc').value = '';
            document.getElementById('nuevaFecha').value = '';
            document.getElementById('nuevoPipe').value = '';
            mostrarConsulta();
            cargarDatos(); 
        }
    } catch (err) {
        alert("Error al guardar.");
    }
}

// 7. ELIMINAR REGISTRO
async function confirmarEliminacion(id) {
    if (confirm("¿Seguro que deseas eliminar este registro?")) {
        try {
            const resp = await fetch(ELIMINAR_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });

            if (resp.ok) {
                alert("Eliminado.");
                cargarDatos();
            }
        } catch (err) {
            alert("Error al eliminar.");
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

