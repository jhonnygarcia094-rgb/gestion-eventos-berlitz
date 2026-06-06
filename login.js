// login.js — Funciones compartidas de autenticación (v2)

const TOKEN_KEY   = 'token';
const USUARIO_KEY = 'usuario';
// URL dinámica: usa URL relativa cuando el JS se sirve desde el mismo servidor
const API_BASE_URL = '';  // Vacío = relativo al servidor actual

function obtenerToken()   { return localStorage.getItem(TOKEN_KEY); }
function obtenerUsuario() {
    const u = localStorage.getItem(USUARIO_KEY);
    return u ? JSON.parse(u) : null;
}
function estaAutenticado() { return !!obtenerToken(); }

function logout() {
    const token = obtenerToken();
    if (token) {
        fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    window.location.href = '/login.html';
}

/**
 * Fetch autenticado — maneja expiración de token
 */
function fetchAutenticado(url, opciones = {}) {
    const token = obtenerToken();
    if (!token) { window.location.href = '/login.html'; return Promise.reject('No autenticado'); }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(opciones.headers || {})
    };

    return fetch(url, { ...opciones, headers }).then(async resp => {
        if (resp.status === 401) {
            const data = await resp.json().catch(() => ({}));
            if (data.code === 'TOKEN_EXPIRED' || data.code === 'TOKEN_INVALID') {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(USUARIO_KEY);
                window.location.href = '/login.html?expired=1';
                return;
            }
        }
        return resp;
    });
}

/**
 * Verifica si el usuario tiene permiso en un módulo
 */
function tienePermiso(modulo, accion = 'ver') {
    const usuario = obtenerUsuario();
    if (!usuario) return false;
    if (usuario.rol === 'Admin') return true;
    if (!usuario.modulos || !usuario.modulos[modulo]) return false;
    const perm = usuario.modulos[modulo];
    const key  = `Puede_${accion.charAt(0).toUpperCase() + accion.slice(1)}`;
    return !!perm[key];
}

// ── Proteger páginas que no son login ─────────────────────────────
if (!window.location.pathname.includes('login') && !window.location.pathname.includes('reset-password')) {
    if (!estaAutenticado()) {
        window.location.href = '/login.html';
    }
}
