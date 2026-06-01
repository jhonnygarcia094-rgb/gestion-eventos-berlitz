// Script compartido para manejo de autenticación

const TOKEN_KEY = 'token';
const USUARIO_KEY = 'usuario';
const API_BASE_URL = 'https://gestion-eventos-berlitz.onrender.com';

// Obtener token del localStorage
function obtenerToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// Obtener usuario del localStorage
function obtenerUsuario() {
    const usuario = localStorage.getItem(USUARIO_KEY);
    return usuario ? JSON.parse(usuario) : null;
}

// Verificar si está autenticado
function estaAutenticado() {
    return obtenerToken() !== null;
}

// Hacer logout
function logout() {
    const token = obtenerToken();
    
    if (token) {
        // Notificar al servidor
        fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }).catch(err => console.error('Error al logout:', err));
    }
    
    // Limpiar localStorage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    
    // Redirigir a login
    window.location.href = '/login.html';
}

// Hacer fetch con autenticación
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

// Verificar autenticación al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    // Si está en login.html, no hacer nada
    if (window.location.pathname.includes('login.html')) {
        return;
    }
    
    // Si no está autenticado y no está en login, redirigir
    if (!estaAutenticado() && !window.location.pathname.includes('login')) {
        window.location.href = '/login.html';
    }
});
