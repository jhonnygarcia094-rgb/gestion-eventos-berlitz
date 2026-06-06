// app.js — Lógica principal SPA del sistema Berlitz v2

const API = ''; // Rutas relativas al servidor

/* ═══════════════════════════════════════════════════════════
   INICIALIZACIÓN
═══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
    const usuario = obtenerUsuario();
    if (!usuario) { window.location.href = '/login.html'; return; }

    // Inicializar UI de usuario
    document.getElementById('sidebarAvatar').textContent = usuario.nombre?.charAt(0)?.toUpperCase() || 'U';
    document.getElementById('sidebarUserName').textContent = usuario.nombre + (usuario.apellido ? ' ' + usuario.apellido : '');
    document.getElementById('sidebarUserRole').textContent = usuario.rol || '—';
    document.getElementById('topbarUser').textContent = usuario.email;

    // Configurar menú según permisos
    aplicarPermisos(usuario);

    // Sidebar toggle
    iniciarSidebar();

    // Routing
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    cargarVista(hash);
});

/* ═══════════════════════════════════════════════════════════
   PERMISOS Y MENÚ
═══════════════════════════════════════════════════════════ */
function aplicarPermisos(usuario) {
    const esAdmin = usuario.rol === 'Admin';
    const modulos = usuario.modulos || {};

    // Ocultar secciones sin permiso
    if (!esAdmin && !tienePermiso('eventos', 'ver')) document.getElementById('navItem-eventos')?.remove();
    if (!esAdmin && !tienePermiso('marketing_inversion', 'ver')) document.getElementById('navItem-mkt-inversion')?.remove();
    if (!esAdmin && !tienePermiso('marketing_metas', 'ver')) document.getElementById('navItem-mkt-metas')?.remove();
    if (!esAdmin) document.getElementById('navGroup-admin')?.remove();

    // Ocultar grupo marketing si no tiene sub-items
    const subItems = document.querySelectorAll('#marketingSubmenu .nav-item');
    if (subItems.length === 0) document.getElementById('navGroup-marketing')?.remove();
}

/* ═══════════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════════ */
let sidebarCollapsed = false;

function iniciarSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const toggleBtn = document.getElementById('sidebarToggle');
    const toggleIcon = document.getElementById('toggleIcon');
    const overlay = document.getElementById('sidebarOverlay');
    const mobileBtn = document.getElementById('btnMobileMenu');

    // Toggle desktop
    toggleBtn.addEventListener('click', () => {
        sidebarCollapsed = !sidebarCollapsed;
        sidebar.classList.toggle('collapsed', sidebarCollapsed);
        mainContent.classList.toggle('sidebar-collapsed', sidebarCollapsed);
        toggleIcon.className = sidebarCollapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
    });

    // Toggle mobile
    mobileBtn.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
        overlay.style.display = 'block';
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        overlay.style.display = 'none';
    });

    // Marketing submenu toggle
    document.getElementById('nav-marketing-toggle')?.addEventListener('click', () => {
        if (sidebarCollapsed) return;
        const submenu = document.getElementById('marketingSubmenu');
        const chevron = document.getElementById('marketingChevron');
        const isOpen = submenu.classList.contains('open');
        submenu.classList.toggle('open', !isOpen);
        chevron.classList.toggle('rotated', !isOpen);
    });

    // Nav links click
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            // En mobile, cerrar sidebar
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
                overlay.style.display = 'none';
            }
            cargarVista(view);
        });
    });
}

/* ═══════════════════════════════════════════════════════════
   ROUTING
═══════════════════════════════════════════════════════════ */
const VIEWS = {
    dashboard: { title: 'Dashboard', subtitle: 'Panel general del sistema', load: loadDashboard },
    eventos: { title: 'Gestión de Eventos', subtitle: 'Administración de eventos y festivos', load: loadEventos },
    'marketing-inversion': { title: 'Inversión Publicitaria', subtitle: 'Marketing › Inversión', load: loadInversion },
    'marketing-metas': { title: 'Metas de Marketing', subtitle: 'Marketing › Metas', load: loadMetas },
    'operaciones-metas': { title: 'Metas Asesor', subtitle: 'Operaciones › Metas Asesor', load: loadMetasAsesor },
    'admin-usuarios': { title: 'Gestión de Usuarios', subtitle: 'Administración › Usuarios', load: loadAdminUsuarios },
    'admin-configuracion': { title: 'Configuración', subtitle: 'Administración › Configuración', load: loadAdminConfig }
};

function cargarVista(viewName) {
    const view = VIEWS[viewName];
    if (!view) { cargarVista('dashboard'); return; }

    // Actualizar header
    document.getElementById('topbarTitle').textContent = view.title;
    document.getElementById('topbarSubtitle').textContent = view.subtitle;

    // Actualizar nav activo
    document.querySelectorAll('.nav-link, .nav-sublink').forEach(l => l.classList.remove('active'));
    const navEl = document.getElementById(`nav-${viewName}`) || document.querySelector(`[data-view="${viewName}"]`);
    if (navEl) navEl.classList.add('active');

    // Hash URL
    window.location.hash = viewName;

    // Cargar vista
    const container = document.getElementById('viewContainer');
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:60px;"><div class="spinner"></div></div>';
    view.load(container);
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '📢'}</span><span class="toast-msg">${msg}</span>`;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

/* ═══════════════════════════════════════════════════════════
   MODAL HELPER
═══════════════════════════════════════════════════════════ */
function crearModal(id, title, bodyHtml, footerHtml = '', size = '') {
    document.getElementById(id)?.remove();
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box ${size}">
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
                <button class="modal-close" onclick="cerrarModal('${id}')">✕</button>
            </div>
            <div class="modal-body">${bodyHtml}</div>
            ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
        </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));
}

function cerrarModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open'); setTimeout(() => el.remove(), 200); }
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════ */
async function loadDashboard(container) {
    try {
        const resp = await fetchAutenticado(`${API}/api/dashboard/stats`);
        const data = await resp.json();

        container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fa-solid fa-calendar-days"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${data.eventos?.total ?? 0}</div>
                    <div class="stat-label">Eventos ${data.anio}</div>
                    <div class="stat-trend up"><i class="fa-solid fa-arrow-up"></i> ${data.eventos?.proximos ?? 0} próximos</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fa-solid fa-users"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${data.usuarios?.activos ?? 0}</div>
                    <div class="stat-label">Usuarios Activos</div>
                    <div class="stat-trend ${data.usuarios?.bloqueados > 0 ? 'down' : 'up'}">
                        ${data.usuarios?.bloqueados ?? 0} bloqueados
                    </div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon yellow"><i class="fa-solid fa-dollar-sign"></i></div>
                <div class="stat-info">
                    <div class="stat-value">$${Number(data.inversion?.total ?? 0).toLocaleString('es', { maximumFractionDigits: 0 })}</div>
                    <div class="stat-label">Inversión ${data.anio}</div>
                    <div class="stat-trend up">${data.inversion?.periodos ?? 0} períodos</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon red"><i class="fa-solid fa-bullseye"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${Number(data.metas?.total_leads ?? 0).toLocaleString()}</div>
                    <div class="stat-label">Total Leads ${data.anio}</div>
                    <div class="stat-trend up">${Number(data.metas?.total_matriculas ?? 0).toLocaleString()} matrículas</div>
                </div>
            </div>
        </div>

        <div class="dashboard-grid">
            <!-- Próximos Eventos -->
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title"><i class="fa-solid fa-calendar-check" style="color:var(--primary)"></i> Próximos Eventos</div>
                        <div class="card-subtitle">Los más cercanos a hoy</div>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <table>
                        <thead><tr><th>Evento</th><th>Fecha</th><th>País</th></tr></thead>
                        <tbody>
                            ${(data.proximos_eventos || []).length === 0
                ? `<tr><td colspan="3"><div class="empty-state" style="padding:30px"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sin eventos próximos</div></div></td></tr>`
                : (data.proximos_eventos || []).map(e => `
                                <tr>
                                    <td><strong>${escapeHtml(e.Descripción)}</strong></td>
                                    <td><span class="badge badge-primary">${formatFecha(e.Fecha)}</span></td>
                                    <td>${escapeHtml(e.Pais || 'N/A')}</td>
                                </tr>`).join('')
            }
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Actividad Reciente -->
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title"><i class="fa-solid fa-clock-rotate-left" style="color:var(--primary)"></i> Actividad Reciente</div>
                        <div class="card-subtitle">Últimas 10 acciones</div>
                    </div>
                </div>
                <div class="card-body">
                    <ul class="activity-list">
                        ${(data.actividad_reciente || []).map(a => `
                        <li class="activity-item">
                            <div class="activity-dot ${a.Estado_Resultado === 'ERROR' ? 'error' : ''}"></div>
                            <div>
                                <div class="activity-text">${escapeHtml(a.Descripcion || a.Tipo_Accion)}</div>
                                <div class="activity-meta">${escapeHtml(a.Usuario || 'Sistema')} · ${formatFechaHora(a.Fecha_Accion)}</div>
                            </div>
                        </li>`).join('') || '<li class="activity-item"><div class="activity-text text-muted">Sin actividad reciente</div></li>'}
                    </ul>
                </div>
            </div>

            <!-- Eventos por País -->
            <div class="card" style="grid-column:1/-1;">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-globe" style="color:var(--primary)"></i> Eventos por País — ${data.anio}</div>
                </div>
                <div class="card-body">
                    <div style="display:flex;flex-wrap:wrap;gap:12px;">
                        ${(data.eventos_por_pais || []).map((p, i) => {
                const colors = ['blue', 'green', 'yellow', 'red'];
                const color = colors[i % colors.length];
                return `<div class="stat-card" style="flex:1;min-width:150px;max-width:200px;">
                                <div class="stat-icon ${color}"><i class="fa-solid fa-flag"></i></div>
                                <div class="stat-info">
                                    <div class="stat-value">${p.Total}</div>
                                    <div class="stat-label">${escapeHtml(p.Pais || 'Sin país')}</div>
                                </div>
                            </div>`;
            }).join('') || '<p class="text-muted">Sin datos disponibles</p>'}
                    </div>
                </div>
            </div>
        </div>`;

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error cargando dashboard</div><div class="empty-state-desc">${err.message}</div></div>`;
    }
}

/* ═══════════════════════════════════════════════════════════
   GESTIÓN DE EVENTOS
═══════════════════════════════════════════════════════════ */
let pipelines = [];
let eventosData = [];

async function loadEventos(container) {
    const usuario = obtenerUsuario();
    const puedeCrear = tienePermiso('eventos', 'crear');
    const puedeEditar = tienePermiso('eventos', 'editar');
    const puedeEliminar = tienePermiso('eventos', 'eliminar');

    container.innerHTML = `
    <div class="toolbar">
        <div class="filters-row">
            <input type="text"   id="fDesc"     class="form-control filter-input" placeholder="🔍 Buscar descripción...">
            <select              id="fMes"      class="form-control filter-input"><option value="">Todos los meses</option>${mesesOptions()}</select>
            <input type="number" id="fAnio"     class="form-control filter-input" placeholder="Año" value="${new Date().getFullYear()}" min="2020" max="2099">
            <select              id="fPipeline" class="form-control filter-input"><option value="">Todos los países</option></select>
            <button class="btn btn-secondary" onclick="cargarEventos()"><i class="fa-solid fa-rotate-right"></i> Actualizar</button>
        </div>
        ${puedeCrear ? `<button class="btn btn-primary" id="btnNuevoEvento"><i class="fa-solid fa-plus"></i> Nuevo Evento</button>` : ''}
    </div>
    <div class="card">
        <div class="table-wrapper">
            <table id="tablaEventos">
                <thead><tr><th>Descripción</th><th>Fecha</th><th>País</th><th>Acciones</th></tr></thead>
                <tbody id="tbodyEventos"><tr><td colspan="4"><div class="empty-state"><div class="spinner"></div></div></td></tr></tbody>
            </table>
        </div>
    </div>`;

    // Cargar pipelines
    try {
        const resp = await fetchAutenticado(`${API}/api/eventos/pipelines`);
        pipelines = await resp.json();
        const sel = document.getElementById('fPipeline');
        pipelines.forEach(p => sel.innerHTML += `<option value="${escapeHtml(p.Des_pipeline)}">${escapeHtml(p.Des_pipeline)}</option>`);
    } catch (e) { console.warn('No se cargaron pipelines'); }

    // Botón nuevo evento
    if (puedeCrear) {
        document.getElementById('btnNuevoEvento').addEventListener('click', () => abrirModalEvento(null, pipelines));
    }

    // Filtros en tiempo real
    ['fDesc', 'fMes', 'fAnio', 'fPipeline'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', filtrarEventos);
        document.getElementById(id)?.addEventListener('change', filtrarEventos);
    });

    await cargarEventos();
}

async function cargarEventos() {
    const anio = document.getElementById('fAnio')?.value || new Date().getFullYear();
    const mes = document.getElementById('fMes')?.value || '';
    const pipeline = document.getElementById('fPipeline')?.value || '';
    const desc = document.getElementById('fDesc')?.value || '';

    let url = `${API}/api/eventos?anio=${anio}`;
    if (mes) url += `&mes=${mes}`;
    if (pipeline) url += `&pipeline=${encodeURIComponent(pipeline)}`;
    if (desc) url += `&desc=${encodeURIComponent(desc)}`;

    try {
        const resp = await fetchAutenticado(url);
        eventosData = await resp.json();
        renderEventos(eventosData);
    } catch (err) {
        document.getElementById('tbodyEventos').innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

function filtrarEventos() {
    const desc = (document.getElementById('fDesc')?.value || '').toLowerCase();
    const mes = document.getElementById('fMes')?.value || '';
    const pipeline = document.getElementById('fPipeline')?.value || '';

    const filtrados = eventosData.filter(e => {
        const f = new Date(e.Fecha);
        const mObj = (f.getUTCMonth() + 1).toString().padStart(2, '0');
        return (!desc || e.Descripción.toLowerCase().includes(desc))
            && (!mes || mObj === mes)
            && (!pipeline || (e.Des_pipeline || '') === pipeline);
    });

    renderEventos(filtrados);
}

function renderEventos(lista) {
    const usuario = obtenerUsuario();
    const puedeEditar = tienePermiso('eventos', 'editar');
    const puedeElim = tienePermiso('eventos', 'eliminar');
    const tbody = document.getElementById('tbodyEventos');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sin eventos</div><div class="empty-state-desc">No se encontraron eventos con los filtros aplicados</div></div></td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(e => `
    <tr>
        <td><strong>${escapeHtml(e.Descripción)}</strong></td>
        <td>${formatFecha(e.Fecha)}</td>
        <td><span class="badge badge-primary">${escapeHtml(e.Des_pipeline || 'N/A')}</span></td>
        <td>
            <div class="flex gap-2">
                ${puedeEditar ? `<button class="btn btn-sm btn-secondary" onclick="abrirModalEvento(${e.ID}, pipelines)"><i class="fa-solid fa-pen"></i></button>` : ''}
                ${puedeElim ? `<button class="btn btn-sm btn-danger"    onclick="eliminarEvento(${e.ID}, '${escapeHtml(e.Descripción)}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                ${(!puedeEditar && !puedeElim) ? `<span class="text-muted fs-12">Sin acciones</span>` : ''}
            </div>
        </td>
    </tr>`).join('');
}

function abrirModalEvento(id, pipes) {
    const esEdicion = !!id;
    const evento = esEdicion ? eventosData.find(e => e.ID === id) : null;

    const pipeOptions = (pipes || []).map(p =>
        `<option value="${p.ID_pipeline}" ${evento && evento.ID_pipeline === p.ID_pipeline ? 'selected' : ''}>${escapeHtml(p.Des_pipeline)}</option>`
    ).join('');

    const body = `
        <div class="form-group">
            <label class="form-label">Descripción del Evento *</label>
            <input type="text" id="evDesc" class="form-control" value="${escapeHtml(evento?.Descripción || '')}" placeholder="Ej: Festivo Nacional" maxlength="500">
        </div>
        <div class="form-group">
            <label class="form-label">Fecha *</label>
            <input type="date" id="evFecha" class="form-control" value="${evento ? evento.Fecha?.substring(0, 10) : ''}">
        </div>
        <div class="form-group">
            <label class="form-label">País / Pipeline *</label>
            <select id="evPipe" class="form-control"><option value="">-- Selecciona --</option>${pipeOptions}</select>
        </div>`;

    const footer = `
        <button class="btn btn-secondary" onclick="cerrarModal('modalEvento')">Cancelar</button>
        <button class="btn btn-primary"   onclick="guardarEvento(${id || 'null'})">
            <i class="fa-solid fa-save"></i> ${esEdicion ? 'Actualizar' : 'Guardar'}
        </button>`;

    crearModal('modalEvento', esEdicion ? '✏️ Editar Evento' : '📅 Nuevo Evento', body, footer);
}

async function guardarEvento(id) {
    const desc = document.getElementById('evDesc')?.value?.trim();
    const fecha = document.getElementById('evFecha')?.value;
    const pipeId = document.getElementById('evPipe')?.value;

    if (!desc || !fecha || !pipeId) { showToast('Completa todos los campos', 'warning'); return; }

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API}/api/eventos/${id}` : `${API}/api/eventos`;
        const resp = await fetchAutenticado(url, {
            method,
            body: JSON.stringify({ descripcion: desc, fecha, id_pipeline: parseInt(pipeId) })
        });
        const data = await resp.json();
        if (resp.ok) {
            cerrarModal('modalEvento');
            showToast(data.mensaje, 'success');
            cargarEventos();
        } else {
            showToast(data.error || 'Error al guardar', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

async function eliminarEvento(id, desc) {
    if (!confirm(`¿Eliminar "${desc}"? Esta acción no se puede deshacer.`)) return;
    try {
        const resp = await fetchAutenticado(`${API}/api/eventos/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (resp.ok) {
            showToast(data.mensaje, 'success');
            cargarEventos();
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════
   MARKETING — INVERSIÓN
═══════════════════════════════════════════════════════════ */
function formatPeriodo(periodoStr) {
    if (!periodoStr) return '—';
    try {
        const d = new Date(periodoStr);
        const utcDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
        return utcDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    } catch (e) { return periodoStr; }
}

let inversionData = [];

async function loadInversion(container) {
    const puedeCrear = tienePermiso('marketing_inversion', 'crear');
    const puedeEditar = tienePermiso('marketing_inversion', 'editar');
    const puedeEliminar = tienePermiso('marketing_inversion', 'eliminar');

    container.innerHTML = `
    <div class="toolbar">
        <div class="filters-row">
            <input type="month" id="fInvPeriodo" class="form-control filter-input">
            <select id="fInvPipeline" class="form-control filter-input"><option value="">Todos los países</option></select>
            <button class="btn btn-secondary" onclick="cargarInversiones()"><i class="fa-solid fa-rotate-right"></i> Actualizar</button>
        </div>
        ${puedeCrear ? `<button class="btn btn-primary" onclick="abrirModalInversion(null)"><i class="fa-solid fa-plus"></i> Nueva Inversión</button>` : ''}
    </div>
    <div class="card">
        <div class="table-wrapper">
            <table>
                <thead><tr><th>Período</th><th>País</th><th>Inversión</th><th>Acciones</th></tr></thead>
                <tbody id="tbodyInversion"><tr><td colspan="4"><div class="empty-state"><div class="spinner"></div></div></td></tr></tbody>
            </table>
        </div>
    </div>`;

    // Pipelines
    try {
        const resp = await fetchAutenticado(`${API}/api/eventos/pipelines`);
        const pipes = await resp.json();
        const sel = document.getElementById('fInvPipeline');
        pipes.forEach(p => sel.innerHTML += `<option value="${p.ID_pipeline}">${escapeHtml(p.Des_pipeline)}</option>`);
    } catch (e) { }

    ['fInvPeriodo', 'fInvPipeline'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', cargarInversiones);
        document.getElementById(id)?.addEventListener('change', cargarInversiones);
    });

    await cargarInversiones();
}

async function cargarInversiones() {
    const periodo = document.getElementById('fInvPeriodo')?.value || '';
    const pipeline = document.getElementById('fInvPipeline')?.value || '';

    let url = `${API}/api/marketing/inversion?1=1`;
    if (periodo) url += `&periodo=${encodeURIComponent(periodo)}`;
    if (pipeline) url += `&pipeline=${pipeline}`;

    try {
        const resp = await fetchAutenticado(url);
        inversionData = await resp.json();
        const tbody = document.getElementById('tbodyInversion');
        if (!tbody) return;

        if (!inversionData.length) {
            tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-title">Sin inversiones registradas</div></div></td></tr>`;
            return;
        }

        const puedeEditar = tienePermiso('marketing_inversion', 'editar');
        const puedeElim = tienePermiso('marketing_inversion', 'eliminar');

        tbody.innerHTML = inversionData.map(i => `
        <tr>
            <td><span class="badge badge-info">${formatPeriodo(i.ID_Periodo)}</span></td>
            <td>${escapeHtml(i.Des_pipeline || 'N/A')}</td>
            <td><strong>$${Number(i.Amount_Spend).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            <td>
                <div class="flex gap-2">
                    ${puedeEditar ? `<button class="btn btn-sm btn-secondary" onclick="abrirModalInversion(${i.ID_Inversion})"><i class="fa-solid fa-pen"></i></button>` : ''}
                    ${puedeElim ? `<button class="btn btn-sm btn-danger"    onclick="eliminarInversion(${i.ID_Inversion})"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>`).join('');
    } catch (err) {
        document.getElementById('tbodyInversion').innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function abrirModalInversion(id) {
    const esEdicion = !!id;
    const inv = esEdicion ? inversionData.find(i => i.ID_Inversion === id) : null;

    let pipeOptions = '<option value="">-- Selecciona --</option>';
    try {
        const resp = await fetchAutenticado(`${API}/api/eventos/pipelines`);
        const pipes = await resp.json();
        pipeOptions += pipes.map(p => `<option value="${p.ID_pipeline}" ${inv && inv.ID_pipeline === p.ID_pipeline ? 'selected' : ''}>${escapeHtml(p.Des_pipeline)}</option>`).join('');
    } catch (e) { }

    const body = `
        <div class="form-group"><label class="form-label">Período *</label><input type="month" id="invPeriodo" class="form-control" value="${inv?.ID_Periodo ? inv.ID_Periodo.substring(0, 7) : ''}"></div>
        <div class="form-group"><label class="form-label">País / Pipeline *</label><select id="invPipeline" class="form-control">${pipeOptions}</select></div>
        <div class="form-group"><label class="form-label">Inversión (USD) *</label><input type="number" id="invAmount" class="form-control" value="${inv?.Amount_Spend || ''}" placeholder="0.00" step="0.01" min="0"></div>`;

    const footer = `
        <button class="btn btn-secondary" onclick="cerrarModal('modalInversion')">Cancelar</button>
        <button class="btn btn-primary"   onclick="guardarInversion(${id || 'null'})"><i class="fa-solid fa-save"></i> ${esEdicion ? 'Actualizar' : 'Guardar'}</button>`;

    crearModal('modalInversion', esEdicion ? '✏️ Editar Inversión' : '💰 Nueva Inversión', body, footer);
}

async function guardarInversion(id) {
    let periodo = document.getElementById('invPeriodo')?.value?.trim();
    const pipeline = document.getElementById('invPipeline')?.value;
    const amount = document.getElementById('invAmount')?.value;

    if (!periodo || !pipeline || !amount) { showToast('Completa todos los campos', 'warning'); return; }
    periodo += '-01'; // Guardar como dia 1 del mes

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API}/api/marketing/inversion/${id}` : `${API}/api/marketing/inversion`;
        const resp = await fetchAutenticado(url, { method, body: JSON.stringify({ id_periodo: periodo, id_pipeline: parseInt(pipeline), amount_spend: parseFloat(amount) }) });
        const data = await resp.json();
        if (resp.ok) { cerrarModal('modalInversion'); showToast(data.mensaje, 'success'); cargarInversiones(); }
        else showToast(data.error || 'Error al guardar', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

async function eliminarInversion(id) {
    if (!confirm('¿Eliminar esta inversión?')) return;
    try {
        const resp = await fetchAutenticado(`${API}/api/marketing/inversion/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (resp.ok) { showToast(data.mensaje, 'success'); cargarInversiones(); }
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   MARKETING — METAS
═══════════════════════════════════════════════════════════ */
let metasData = [];

async function loadMetas(container) {
    const puedeCrear = tienePermiso('marketing_metas', 'crear');

    container.innerHTML = `
    <div class="toolbar">
        <div class="filters-row">
            <input type="month" id="fMetPeriodo" class="form-control filter-input">
            <select id="fMetPais"  class="form-control filter-input"><option value="">Todos los países</option></select>
            <select id="fMetTipo"  class="form-control filter-input"><option value="">Todos los tipos</option></select>
            <button class="btn btn-secondary" onclick="cargarMetas()"><i class="fa-solid fa-rotate-right"></i> Actualizar</button>
        </div>
        ${puedeCrear ? `<button class="btn btn-primary" onclick="abrirModalMeta(null)"><i class="fa-solid fa-plus"></i> Nueva Meta</button>` : ''}
    </div>
    <div class="card">
        <div class="table-wrapper">
            <table>
                <thead><tr><th>Período</th><th>País</th><th>Tipo</th><th>Leads</th><th>Ratio Conv.</th><th>Matrículas</th><th>Acciones</th></tr></thead>
                <tbody id="tbodyMetas"><tr><td colspan="7"><div class="empty-state"><div class="spinner"></div></div></td></tr></tbody>
            </table>
        </div>
    </div>`;

    // Catálogos
    try {
        const resp = await fetchAutenticado(`${API}/api/marketing/metas/catalogos`);
        const cat = await resp.json();
        const selPais = document.getElementById('fMetPais');
        const selTipo = document.getElementById('fMetTipo');
        cat.paises?.forEach(p => selPais.innerHTML += `<option>${escapeHtml(p)}</option>`);
        cat.tipos?.forEach(t => selTipo.innerHTML += `<option>${escapeHtml(t)}</option>`);
    } catch (e) { }

    ['fMetPeriodo', 'fMetPais', 'fMetTipo'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', cargarMetas);
        document.getElementById(id)?.addEventListener('change', cargarMetas);
    });

    await cargarMetas();
}

async function cargarMetas() {
    const periodo = document.getElementById('fMetPeriodo')?.value || '';
    const pais = document.getElementById('fMetPais')?.value || '';
    const tipo = document.getElementById('fMetTipo')?.value || '';

    let url = `${API}/api/marketing/metas?1=1`;
    if (periodo) url += `&periodo=${encodeURIComponent(periodo)}`;
    if (pais) url += `&pais=${encodeURIComponent(pais)}`;
    if (tipo) url += `&tipo=${encodeURIComponent(tipo)}`;

    try {
        const resp = await fetchAutenticado(url);
        metasData = await resp.json();
        const tbody = document.getElementById('tbodyMetas');
        if (!tbody) return;

        if (!metasData.length) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-title">Sin metas registradas</div></div></td></tr>`;
            return;
        }

        const puedeEditar = tienePermiso('marketing_metas', 'editar');
        const puedeElim = tienePermiso('marketing_metas', 'eliminar');

        tbody.innerHTML = metasData.map(m => `
        <tr>
            <td><span class="badge badge-info">${formatPeriodo(m.ID_Periodo)}</span></td>
            <td>${escapeHtml(m.Pais)}</td>
            <td><span class="badge badge-neutral">${escapeHtml(m.TipoLeads)}</span></td>
            <td><strong>${Number(m.Leads || 0).toLocaleString()}</strong></td>
            <td>${Number((m.Ratio_conversion || 0) * 100).toFixed(1)}%</td>
            <td>${Number(m.Matriculas || 0).toLocaleString()}</td>
            <td>
                <div class="flex gap-2">
                    ${puedeEditar ? `<button class="btn btn-sm btn-secondary" onclick="abrirModalMeta(${m.ID_Meta})"><i class="fa-solid fa-pen"></i></button>` : ''}
                    ${puedeElim ? `<button class="btn btn-sm btn-danger"    onclick="eliminarMeta(${m.ID_Meta})"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>`).join('');
    } catch (err) {
        document.getElementById('tbodyMetas').innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function abrirModalMeta(id) {
    const m = id ? metasData.find(x => x.ID_Meta === id) : null;

    let pipeOptions = '<option value="">-- Selecciona --</option>';
    let tipoOptions = '<option value="">-- Selecciona --</option>';
    try {
        const respPipe = await fetchAutenticado(`${API}/api/eventos/pipelines`);
        const pipes = await respPipe.json();
        pipeOptions += pipes.map(p => `<option value="${escapeHtml(p.Des_pipeline)}" ${m && m.Pais === p.Des_pipeline ? 'selected' : ''}>${escapeHtml(p.Des_pipeline)}</option>`).join('');

        const respCat = await fetchAutenticado(`${API}/api/marketing/metas/catalogos`);
        const cat = await respCat.json();
        tipoOptions += cat.tipos?.map(t => `<option value="${escapeHtml(t)}" ${m && m.TipoLeads === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
    } catch (e) { }

    const body = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group"><label class="form-label">Período *</label><input type="month" id="mPeriodo" class="form-control" value="${m?.ID_Periodo ? m.ID_Periodo.substring(0, 7) : ''}"></div>
            <div class="form-group"><label class="form-label">País *</label><select id="mPais" class="form-control">${pipeOptions}</select></div>
            <div class="form-group"><label class="form-label">Tipo de Leads *</label><select id="mTipo" class="form-control">${tipoOptions}</select></div>
            <div class="form-group"><label class="form-label">Leads</label><input type="number" id="mLeads" class="form-control" value="${m?.Leads || 0}" min="0"></div>
            <div class="form-group"><label class="form-label">Ratio Conversión (0-1)</label><input type="number" id="mRatio" class="form-control" value="${m?.Ratio_conversion || 0}" step="0.0001" min="0" max="1"></div>
            <div class="form-group"><label class="form-label">Matrículas</label><input type="number" id="mMatriculas" class="form-control" value="${m?.Matriculas || 0}" min="0"></div>
        </div>`;
    const footer = `
        <button class="btn btn-secondary" onclick="cerrarModal('modalMeta')">Cancelar</button>
        <button class="btn btn-primary"   onclick="guardarMeta(${id || 'null'})"><i class="fa-solid fa-save"></i> ${id ? 'Actualizar' : 'Guardar'}</button>`;
    crearModal('modalMeta', id ? '✏️ Editar Meta' : '🎯 Nueva Meta', body, footer, 'modal-lg');
}

async function guardarMeta(id) {
    let id_periodo = document.getElementById('mPeriodo')?.value?.trim();
    if (id_periodo) id_periodo += '-01';

    const payload = {
        id_periodo,
        pais: document.getElementById('mPais')?.value?.trim(),
        tipo_leads: document.getElementById('mTipo')?.value?.trim(),
        leads: document.getElementById('mLeads')?.value,
        ratio_conversion: document.getElementById('mRatio')?.value,
        matriculas: document.getElementById('mMatriculas')?.value
    };
    if (!payload.id_periodo || !payload.pais || !payload.tipo_leads) { showToast('Período, País y Tipo son requeridos', 'warning'); return; }
    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API}/api/marketing/metas/${id}` : `${API}/api/marketing/metas`;
        const resp = await fetchAutenticado(url, { method, body: JSON.stringify(payload) });
        const data = await resp.json();
        if (resp.ok) { cerrarModal('modalMeta'); showToast(data.mensaje, 'success'); cargarMetas(); }
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

async function eliminarMeta(id) {
    if (!confirm('¿Eliminar esta meta?')) return;
    try {
        const resp = await fetchAutenticado(`${API}/api/marketing/metas/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (resp.ok) { showToast(data.mensaje, 'success'); cargarMetas(); }
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   ADMIN — USUARIOS
═══════════════════════════════════════════════════════════ */
let usuariosData = [];

async function loadAdminUsuarios(container) {
    container.innerHTML = `
    <div class="toolbar">
        <div class="filters-row">
            <input type="text" id="fUser" class="form-control filter-input" placeholder="🔍 Buscar usuario...">
        </div>
        <button class="btn btn-primary" onclick="abrirModalCrearUsuario()"><i class="fa-solid fa-user-plus"></i> Nuevo Usuario</button>
    </div>
    <div class="card">
        <div class="table-wrapper">
            <table>
                <thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último Acceso</th><th>Acciones</th></tr></thead>
                <tbody id="tbodyUsuarios"><tr><td colspan="6"><div class="empty-state"><div class="spinner"></div></div></td></tr></tbody>
            </table>
        </div>
    </div>`;

    document.getElementById('fUser')?.addEventListener('input', filtrarUsuarios);
    await cargarUsuarios();
}

async function cargarUsuarios() {
    try {
        const resp = await fetchAutenticado(`${API}/api/auth/usuarios`);
        usuariosData = await resp.json();
        renderUsuarios(usuariosData);
    } catch (err) {
        document.getElementById('tbodyUsuarios').innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

function filtrarUsuarios() {
    const q = (document.getElementById('fUser')?.value || '').toLowerCase();
    renderUsuarios(usuariosData.filter(u =>
        u.Email.toLowerCase().includes(q) ||
        u.Nombre.toLowerCase().includes(q) ||
        (u.Apellido || '').toLowerCase().includes(q)
    ));
}

function renderUsuarios(lista) {
    const tbody = document.getElementById('tbodyUsuarios');
    if (!tbody) return;
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">Sin usuarios</div></div></td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map(u => `
    <tr>
        <td>${escapeHtml(u.Email)}</td>
        <td><strong>${escapeHtml(u.Nombre)} ${escapeHtml(u.Apellido || '')}</strong></td>
        <td><span class="badge ${u.Nombre_Rol === 'Admin' ? 'badge-primary' : u.Nombre_Rol === 'Viewer' ? 'badge-info' : 'badge-success'}">${u.Nombre_Rol}</span></td>
        <td>
            ${u.Bloqueado
            ? '<span class="badge badge-danger">Bloqueado</span>'
            : u.Activo
                ? '<span class="badge badge-success">Activo</span>'
                : '<span class="badge badge-warning">Inactivo</span>'
        }
            ${u.Primer_Login ? '<span class="badge badge-warning" style="margin-left:4px">1er Login</span>' : ''}
        </td>
        <td class="text-muted fs-12">${u.Ultimo_Login ? formatFechaHora(u.Ultimo_Login) : 'Nunca'}</td>
        <td>
            <div class="flex gap-2">
                <button class="btn btn-sm btn-secondary" onclick="abrirModalEditarUsuario(${u.ID_Usuario})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-primary"   onclick="abrirModalPermisos(${u.ID_Usuario},'${escapeHtml(u.Nombre)}')" title="Permisos"><i class="fa-solid fa-shield-halved"></i></button>
                ${u.Bloqueado
            ? `<button class="btn btn-sm btn-success" onclick="toggleBloqueo(${u.ID_Usuario},false)" title="Desbloquear"><i class="fa-solid fa-lock-open"></i></button>`
            : `<button class="btn btn-sm btn-warning" onclick="toggleBloqueo(${u.ID_Usuario},true)"  title="Bloquear"><i class="fa-solid fa-lock"></i></button>`
        }
            </div>
        </td>
    </tr>`).join('');
}

function abrirModalCrearUsuario() {
    const body = `
        <div class="form-group"><label class="form-label">Email *</label><input type="email" id="nuEmail" class="form-control" placeholder="usuario@berlitz.com"></div>
        <div class="form-group"><label class="form-label">Nombre *</label><input type="text" id="nuNombre" class="form-control" placeholder="Nombre"></div>
        <div class="form-group"><label class="form-label">Apellido</label><input type="text" id="nuApellido" class="form-control" placeholder="Apellido"></div>
        <div class="form-group"><label class="form-label">Rol *</label>
            <select id="nuRol" class="form-control">
                <option value="">-- Selecciona --</option>
                <option value="Admin">Administrador</option>
                <option value="Usuario">Usuario Estándar</option>
                <option value="Viewer">Solo Lectura</option>
            </select>
        </div>
        <div style="background:var(--info-pale);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--info);">
            <i class="fa-solid fa-circle-info"></i> Se enviará un correo con las credenciales temporales al usuario.
        </div>`;
    const footer = `
        <button class="btn btn-secondary" onclick="cerrarModal('modalCrearUser')">Cancelar</button>
        <button class="btn btn-primary"   onclick="crearUsuario()"><i class="fa-solid fa-user-plus"></i> Crear y Enviar Correo</button>`;
    crearModal('modalCrearUser', '👤 Nuevo Usuario', body, footer);
}

async function crearUsuario() {
    const email = document.getElementById('nuEmail')?.value?.trim();
    const nombre = document.getElementById('nuNombre')?.value?.trim();
    const apellido = document.getElementById('nuApellido')?.value?.trim();
    const rol = document.getElementById('nuRol')?.value;
    if (!email || !nombre || !rol) { showToast('Email, nombre y rol son requeridos', 'warning'); return; }
    try {
        const resp = await fetchAutenticado(`${API}/api/auth/crear-usuario`, { method: 'POST', body: JSON.stringify({ email, nombre, apellido, rol }) });
        const data = await resp.json();
        if (resp.ok) {
            cerrarModal('modalCrearUser');
            showToast(`✅ Usuario creado. Contraseña temporal: ${data.usuario?.contraseñaTemporal}`, 'success');
            setTimeout(cargarUsuarios, 500);
        } else showToast(data.error || 'Error al crear usuario', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

function abrirModalEditarUsuario(id) {
    const u = usuariosData.find(x => x.ID_Usuario === id);
    if (!u) return;
    const body = `
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-control" value="${escapeHtml(u.Email)}" disabled style="opacity:.6"></div>
        <div class="form-group"><label class="form-label">Nombre</label><input type="text" id="euNombre" class="form-control" value="${escapeHtml(u.Nombre)}"></div>
        <div class="form-group"><label class="form-label">Apellido</label><input type="text" id="euApellido" class="form-control" value="${escapeHtml(u.Apellido || '')}"></div>
        <div class="form-group"><label class="form-label">Rol</label>
            <select id="euRol" class="form-control">
                <option value="Admin"   ${u.Nombre_Rol === 'Admin' ? 'selected' : ''}>Administrador</option>
                <option value="Usuario" ${u.Nombre_Rol === 'Usuario' ? 'selected' : ''}>Usuario Estándar</option>
                <option value="Viewer"  ${u.Nombre_Rol === 'Viewer' ? 'selected' : ''}>Solo Lectura</option>
            </select>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:12px;">
            <label class="form-label" style="margin:0">Activo:</label>
            <label class="toggle-switch"><input type="checkbox" id="euActivo" ${u.Activo ? 'checked' : ''}><span class="toggle-slider"></span></label>
        </div>`;
    const footer = `
        <button class="btn btn-secondary" onclick="cerrarModal('modalEditUser')">Cancelar</button>
        <button class="btn btn-primary"   onclick="guardarUsuario(${id})"><i class="fa-solid fa-save"></i> Guardar</button>`;
    crearModal('modalEditUser', `✏️ Editar: ${escapeHtml(u.Nombre)}`, body, footer);
}

async function guardarUsuario(id) {
    const nombre = document.getElementById('euNombre')?.value?.trim();
    const apellido = document.getElementById('euApellido')?.value?.trim();
    const rol = document.getElementById('euRol')?.value;
    const activo = document.getElementById('euActivo')?.checked;
    try {
        const resp = await fetchAutenticado(`${API}/api/auth/usuarios/${id}`, { method: 'PUT', body: JSON.stringify({ nombre, apellido, rol, activo }) });
        const data = await resp.json();
        if (resp.ok) { cerrarModal('modalEditUser'); showToast(data.mensaje, 'success'); cargarUsuarios(); }
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

async function toggleBloqueo(id, bloquear) {
    const accion = bloquear ? 'bloquear' : 'desbloquear';
    if (!confirm(`¿${accion} este usuario?`)) return;
    try {
        const resp = await fetchAutenticado(`${API}/api/auth/usuarios/${id}`, { method: 'PUT', body: JSON.stringify({ bloqueado: bloquear }) });
        const data = await resp.json();
        if (resp.ok) { showToast(data.mensaje, 'success'); cargarUsuarios(); }
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

async function abrirModalPermisos(idUsuario, nombre) {
    let permisos = [];
    try {
        const resp = await fetchAutenticado(`${API}/api/permisos/usuario/${idUsuario}`);
        permisos = await resp.json();
    } catch (err) { showToast('Error cargando permisos', 'error'); return; }

    const rows = permisos.map(p => `
    <div class="permission-row">
        <div class="permission-module">
            <i class="fa-solid ${p.Icono || 'fa-circle'}" style="color:var(--primary);width:18px;text-align:center;"></i>
            <span>${escapeHtml(p.Nombre)}</span>
            ${p.Solo_Admin ? '<span class="badge badge-warning" style="font-size:10px;">Solo Admin</span>' : ''}
        </div>
        <div class="permission-controls">
            <label class="permission-check"><input type="checkbox" id="pm_${p.Clave}_ver"     ${p.Puede_Ver ? 'checked' : ''}     ${p.Solo_Admin ? 'disabled' : ''} onchange="actualizarPermiso('${p.Clave}','ver',this.checked)">Ver</label>
            <label class="permission-check"><input type="checkbox" id="pm_${p.Clave}_crear"   ${p.Puede_Crear ? 'checked' : ''}   ${p.Solo_Admin ? 'disabled' : ''} onchange="actualizarPermiso('${p.Clave}','crear',this.checked)">Crear</label>
            <label class="permission-check"><input type="checkbox" id="pm_${p.Clave}_editar"  ${p.Puede_Editar ? 'checked' : ''}  ${p.Solo_Admin ? 'disabled' : ''} onchange="actualizarPermiso('${p.Clave}','editar',this.checked)">Editar</label>
            <label class="permission-check"><input type="checkbox" id="pm_${p.Clave}_eliminar"${p.Puede_Eliminar ? 'checked' : ''} ${p.Solo_Admin ? 'disabled' : ''} onchange="actualizarPermiso('${p.Clave}','eliminar',this.checked)">Eliminar</label>
        </div>
    </div>`).join('');

    const body = `
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">Configura el acceso de <strong>${escapeHtml(nombre)}</strong> para cada módulo.</p>
        <div class="permissions-grid" id="permissionsGrid">${rows}</div>
        <div id="permStatus" style="margin-top:12px;font-size:12px;color:var(--text-muted);text-align:right;">Los cambios se guardan automáticamente</div>`;

    crearModal('modalPermisos', `🔐 Permisos: ${escapeHtml(nombre)}`, body, `<button class="btn btn-secondary" onclick="cerrarModal('modalPermisos')">Cerrar</button>`, 'modal-lg');

    window._permisosTemp = permisos.reduce((acc, p) => {
        acc[p.Clave] = { Puede_Ver: p.Puede_Ver, Puede_Crear: p.Puede_Crear, Puede_Editar: p.Puede_Editar, Puede_Eliminar: p.Puede_Eliminar };
        return acc;
    }, {});
    window._permisosUserId = idUsuario;
}

let permDebounce = null;
function actualizarPermiso(modulo, accion, valor) {
    if (!window._permisosTemp) return;
    const map = { ver: 'Puede_Ver', crear: 'Puede_Crear', editar: 'Puede_Editar', eliminar: 'Puede_Eliminar' };
    window._permisosTemp[modulo][map[accion]] = valor;

    clearTimeout(permDebounce);
    permDebounce = setTimeout(async () => {
        const permisos = Object.entries(window._permisosTemp).map(([modulo, p]) => ({
            modulo,
            puede_ver: p.Puede_Ver ? 1 : 0,
            puede_crear: p.Puede_Crear ? 1 : 0,
            puede_editar: p.Puede_Editar ? 1 : 0,
            puede_eliminar: p.Puede_Eliminar ? 1 : 0
        }));
        try {
            const resp = await fetchAutenticado(`${API}/api/permisos/usuario/${window._permisosUserId}`, { method: 'PUT', body: JSON.stringify({ permisos }) });
            const data = await resp.json();
            const status = document.getElementById('permStatus');
            if (status) status.textContent = resp.ok ? `✅ Guardado: ${new Date().toLocaleTimeString()}` : `❌ Error: ${data.error}`;
        } catch (err) { console.error('Error guardando permisos:', err); }
    }, 600);
}

/* ═══════════════════════════════════════════════════════════
   ADMIN — CONFIGURACIÓN
═══════════════════════════════════════════════════════════ */
async function loadAdminConfig(container) {
    container.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>';

    try {
        const resp = await fetchAutenticado(`${API}/api/configuracion`);
        const config = await resp.json();

        const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
        const appKeys = config.filter(c => !smtpKeys.includes(c.Clave));
        const smtpConf = config.filter(c => smtpKeys.includes(c.Clave));

        container.innerHTML = `
        <div style="display:grid;gap:24px;">
            <!-- SMTP -->
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title"><i class="fa-solid fa-envelope" style="color:var(--primary)"></i> Configuración SMTP</div>
                        <div class="card-subtitle">Servidor de correo para notificaciones</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-secondary btn-sm" onclick="probarSMTP()"><i class="fa-solid fa-plug"></i> Probar Conexión</button>
                        <button class="btn btn-primary btn-sm"   onclick="guardarConfig()"><i class="fa-solid fa-save"></i> Guardar Todo</button>
                    </div>
                </div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" id="smtpForm">
                        ${smtpConf.map(c => `
                        <div class="form-group">
                            <label class="form-label">${c.Clave}<span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${escapeHtml(c.Descripcion || '')}</span></label>
                            <input type="${c.Clave === 'SMTP_PASS' ? 'password' : 'text'}" 
                                   id="cfg_${c.Clave}" 
                                   class="form-control" 
                                   data-clave="${c.Clave}"
                                   value="${c.Clave === 'SMTP_PASS' ? '' : escapeHtml(c.Valor || '')}" 
                                   placeholder="${c.Clave === 'SMTP_PASS' ? '(no mostrada - escribe para cambiar)' : escapeHtml(c.Valor || '')}">
                        </div>`).join('')}
                    </div>
                    <div id="smtpStatus" style="margin-top:8px;font-size:13px;"></div>
                </div>
            </div>

            <!-- App Config -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-sliders" style="color:var(--primary)"></i> Configuración General</div>
                </div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        ${appKeys.map(c => `
                        <div class="form-group">
                            <label class="form-label">${c.Clave}<span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${escapeHtml(c.Descripcion || '')}</span></label>
                            <input type="text" id="cfg_${c.Clave}" class="form-control" data-clave="${c.Clave}" value="${escapeHtml(c.Valor || '')}">
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>`;

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error cargando configuración</div></div>`;
    }
}

async function guardarConfig() {
    const inputs = document.querySelectorAll('[data-clave]');
    const configuraciones = [];
    inputs.forEach(input => {
        const clave = input.getAttribute('data-clave');
        const valor = input.value.trim();
        if (clave === 'SMTP_PASS' && !valor) return; // No sobrescribir si vacío
        configuraciones.push({ clave, valor });
    });

    try {
        const resp = await fetchAutenticado(`${API}/api/configuracion/bulk/update`, { method: 'PUT', body: JSON.stringify({ configuraciones }) });
        const data = await resp.json();
        if (resp.ok) showToast(data.mensaje, 'success');
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

async function probarSMTP() {
    const statusEl = document.getElementById('smtpStatus');
    if (statusEl) { statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando conexión...'; statusEl.style.color = 'var(--text-muted)'; }
    try {
        const resp = await fetchAutenticado(`${API}/api/configuracion/probar-smtp`, { method: 'POST' });
        const data = await resp.json();
        if (resp.ok) {
            if (statusEl) { statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.mensaje}`; statusEl.style.color = 'var(--success)'; }
            showToast('SMTP conectado correctamente', 'success');
        } else {
            if (statusEl) { statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error}`; statusEl.style.color = 'var(--danger)'; }
            showToast('Error en conexión SMTP', 'error');
        }
    } catch (err) { showToast('Error de conexión', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   OPERACIONES — METAS ASESOR
═══════════════════════════════════════════════════════════ */
let metasAsesorData = [];

async function loadMetasAsesor(container) {
    const puedeCrear = tienePermiso('operaciones_metas', 'crear');

    container.innerHTML = `
    <div class="toolbar">
        <div class="filters-row">
            <input type="month" id="fMetAsPeriodo" class="form-control filter-input">
            <select id="fMetAsPipeline" class="form-control filter-input"><option value="">Todos los países</option></select>
            <select id="fMetAsOwner" class="form-control filter-input"><option value="">Todos los asesores</option></select>
            <button class="btn btn-secondary" onclick="cargarMetasAsesor()"><i class="fa-solid fa-rotate-right"></i> Actualizar</button>
        </div>
        ${puedeCrear ? `<button class="btn btn-primary" onclick="abrirModalMetaAsesor(null)"><i class="fa-solid fa-plus"></i> Nueva Meta Asesor</button>` : ''}
    </div>
    <div class="card">
        <div class="table-wrapper">
            <table>
                <thead><tr><th>Período</th><th>País</th><th>Asesor</th><th>Moneda</th><th>Recaudo</th><th>Ventas</th><th>Tier</th><th>Acciones</th></tr></thead>
                <tbody id="tbodyMetasAsesor"><tr><td colspan="8"><div class="empty-state"><div class="spinner"></div></div></td></tr></tbody>
            </table>
        </div>
    </div>`;

    // Catálogos
    try {
        const respPipe = await fetchAutenticado(`${API}/api/eventos/pipelines`);
        const pipes = await respPipe.json();
        const selPipe = document.getElementById('fMetAsPipeline');
        pipes.forEach(p => selPipe.innerHTML += `<option value="${p.ID_pipeline}">${escapeHtml(p.Des_pipeline)}</option>`);

        const respOw = await fetchAutenticado(`${API}/api/metas-asesor/owners`);
        const owners = await respOw.json();
        const selOw = document.getElementById('fMetAsOwner');
        owners.forEach(o => selOw.innerHTML += `<option value="${escapeHtml(o.OwnerName)}">${escapeHtml(o.OwnerName)}</option>`);
    } catch (e) { }

    ['fMetAsPeriodo', 'fMetAsPipeline', 'fMetAsOwner'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', cargarMetasAsesor);
        document.getElementById(id)?.addEventListener('change', cargarMetasAsesor);
    });

    await cargarMetasAsesor();
}

async function cargarMetasAsesor() {
    const periodo = document.getElementById('fMetAsPeriodo')?.value || '';
    const pipeline = document.getElementById('fMetAsPipeline')?.value || '';
    const asesor = document.getElementById('fMetAsOwner')?.value || '';

    let url = `${API}/api/metas-asesor?1=1`;
    if (periodo) url += `&periodo=${encodeURIComponent(periodo)}`;
    if (pipeline) url += `&pipeline=${pipeline}`;
    if (asesor) url += `&asesor=${encodeURIComponent(asesor)}`;

    try {
        const resp = await fetchAutenticado(url);
        metasAsesorData = await resp.json();
        const tbody = document.getElementById('tbodyMetasAsesor');
        if (!tbody) return;

        if (!metasAsesorData.length) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🧑‍💼</div><div class="empty-state-title">Sin metas de asesor registradas</div></div></td></tr>`;
            return;
        }

        const puedeEditar = tienePermiso('operaciones_metas', 'editar');
        const puedeElim = tienePermiso('operaciones_metas', 'eliminar');

        tbody.innerHTML = metasAsesorData.map(m => `
        <tr>
            <td><span class="badge badge-info">${formatPeriodo(m.ID_Periodo)}</span></td>
            <td>${escapeHtml(m.Des_pipeline || m.Pais || 'N/A')}</td>
            <td><strong>${escapeHtml(m.Asesor)}</strong><br><span class="text-muted fs-12">${escapeHtml(m.CORREO || '')}</span></td>
            <td><span class="badge badge-neutral">${escapeHtml(m.Moneda || '')}</span></td>
            <td>$${Number(m.Recaudo || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${Number(m.NumeroVentas || 0).toLocaleString()}</td>
            <td>${m.Tier || '—'}</td>
            <td>
                <div class="flex gap-2">
                    ${puedeEditar ? `<button class="btn btn-sm btn-secondary" onclick="abrirModalMetaAsesor(${m.ID_MetaAsesor})"><i class="fa-solid fa-pen"></i></button>` : ''}
                    ${puedeElim ? `<button class="btn btn-sm btn-danger"    onclick="eliminarMetaAsesor(${m.ID_MetaAsesor})"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>`).join('');
    } catch (err) {
        document.getElementById('tbodyMetasAsesor').innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function abrirModalMetaAsesor(id) {
    const m = id ? metasAsesorData.find(x => x.ID_MetaAsesor === id) : null;

    let pipeOptions = '<option value="">-- Selecciona --</option>';
    let ownerOptions = '<option value="">-- Selecciona --</option>';
    let monedaOptions = '<option value="">-- Selecciona --</option>';
    let ownersCache = [];

    try {
        const respPipe = await fetchAutenticado(`${API}/api/eventos/pipelines`);
        const pipes = await respPipe.json();
        pipeOptions += pipes.map(p => `<option value="${p.ID_pipeline}" ${m && m.ID_pipeline === p.ID_pipeline ? 'selected' : ''}>${escapeHtml(p.Des_pipeline)}</option>`).join('');

        const respOw = await fetchAutenticado(`${API}/api/metas-asesor/owners`);
        ownersCache = await respOw.json();
        ownerOptions += ownersCache.map(o => `<option value="${escapeHtml(o.OwnerName)}" data-email="${escapeHtml(o.Email || '')}" ${m && m.Asesor === o.OwnerName ? 'selected' : ''}>${escapeHtml(o.OwnerName)}</option>`).join('');

        const respDiv = await fetchAutenticado(`${API}/api/metas-asesor/divisas`);
        const divisas = await respDiv.json();
        monedaOptions += divisas.map(d => `<option value="${escapeHtml(d.Moneda)}" ${m && m.Moneda === d.Moneda ? 'selected' : ''}>${escapeHtml(d.Moneda)}</option>`).join('');
    } catch (e) { }

    const body = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group"><label class="form-label">Período *</label><input type="month" id="maPeriodo" class="form-control" value="${m?.ID_Periodo ? String(m.ID_Periodo).substring(0, 7) : ''}"></div>
            <div class="form-group"><label class="form-label">País / Pipeline *</label><select id="maPipeline" class="form-control">${pipeOptions}</select></div>
            <div class="form-group"><label class="form-label">Asesor *</label><select id="maOwner" class="form-control">${ownerOptions}</select></div>
            <div class="form-group"><label class="form-label">Correo</label><input type="email" id="maCorreo" class="form-control" value="${escapeHtml(m?.CORREO || '')}" readonly style="background:var(--bg-subtle);"></div>
            <div class="form-group"><label class="form-label">Moneda *</label><select id="maMoneda" class="form-control">${monedaOptions}</select></div>
            <div class="form-group"><label class="form-label">Recaudo</label><input type="number" id="maRecaudo" class="form-control" value="${m?.Recaudo || 0}" step="0.01" min="0"></div>
            <div class="form-group"><label class="form-label">Número de Ventas</label><input type="number" id="maVentas" class="form-control" value="${m?.NumeroVentas || 0}" min="0"></div>
            <div class="form-group"><label class="form-label">Tier</label><input type="number" id="maTier" class="form-control" value="${m?.Tier || 0}" min="0"></div>
        </div>`;

    const footer = `
        <button class="btn btn-secondary" onclick="cerrarModal('modalMetaAsesor')">Cancelar</button>
        <button class="btn btn-primary"   onclick="guardarMetaAsesor(${id || 'null'})"><i class="fa-solid fa-save"></i> ${id ? 'Actualizar' : 'Guardar'}</button>`;
    crearModal('modalMetaAsesor', id ? '✏️ Editar Meta Asesor' : '🧑‍💼 Nueva Meta Asesor', body, footer, 'modal-lg');

    // Auto-llenar correo al seleccionar asesor
    document.getElementById('maOwner')?.addEventListener('change', function () {
        const selected = this.options[this.selectedIndex];
        const email = selected?.getAttribute('data-email') || '';
        document.getElementById('maCorreo').value = email;
    });
}

async function guardarMetaAsesor(id) {
    let id_periodo = document.getElementById('maPeriodo')?.value?.trim();
    if (id_periodo) id_periodo += '-01';

    const payload = {
        id_periodo,
        id_pipeline: document.getElementById('maPipeline')?.value,
        asesor: document.getElementById('maOwner')?.value,
        correo: document.getElementById('maCorreo')?.value,
        moneda: document.getElementById('maMoneda')?.value,
        recaudo: document.getElementById('maRecaudo')?.value,
        numero_ventas: document.getElementById('maVentas')?.value,
        tier: document.getElementById('maTier')?.value
    };

    if (!payload.id_periodo || !payload.id_pipeline || !payload.asesor || !payload.moneda) {
        showToast('Período, País, Asesor y Moneda son requeridos', 'warning'); return;
    }

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API}/api/metas-asesor/${id}` : `${API}/api/metas-asesor`;
        const resp = await fetchAutenticado(url, { method, body: JSON.stringify(payload) });
        const data = await resp.json();
        if (resp.ok) { cerrarModal('modalMetaAsesor'); showToast(data.mensaje, 'success'); cargarMetasAsesor(); }
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

async function eliminarMetaAsesor(id) {
    if (!confirm('¿Eliminar esta meta?')) return;
    try {
        const resp = await fetchAutenticado(`${API}/api/metas-asesor/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (resp.ok) { showToast(data.mensaje, 'success'); cargarMetasAsesor(); }
        else showToast(data.error || 'Error', 'error');
    } catch (err) { showToast('Error de conexión', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   UTILIDADES
═══════════════════════════════════════════════════════════ */
function escapeHtml(text) {
    if (!text && text !== 0) return '';
    return String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function formatFecha(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    return d.getUTCDate().toString().padStart(2, '0') + '/' + (d.getUTCMonth() + 1).toString().padStart(2, '0') + '/' + d.getUTCFullYear();
}

function formatFechaHora(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function mesesOptions() {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('');
}
