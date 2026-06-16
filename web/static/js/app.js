/**
 * Chinese DOS Games — Global App Script
 * Handles auth state, navbar, toast notifications, fetch wrapper.
 */
(function () {
    'use strict';

    const TOKEN_KEY = 'dos_token';
    const API_BASE = '/api';

    // ─── Auth State ───

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    function isLoggedIn() {
        return !!getToken();
    }

    function getAuthHeaders() {
        const token = getToken();
        return token ? { 'Authorization': 'Bearer ' + token } : {};
    }

    // ─── Fetch Wrapper ───

    async function apiFetch(url, options = {}) {
        const headers = {
            ...getAuthHeaders(),
            ...options.headers,
        };

        const resp = await fetch(url, { ...options, headers });

        if (resp.status === 401) {
            clearToken();
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }

        return resp;
    }

    // ─── Toast Notifications ───

    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ─── Navbar Auth UI ───

    function updateNavAuth() {
        const token = getToken();
        const navAuth = document.getElementById('nav-auth');
        const navUser = document.getElementById('nav-user');
        const navUpload = document.getElementById('nav-upload');
        const navUsername = document.getElementById('nav-username');

        if (!navAuth || !navUser) return;

        if (token) {
            navAuth.style.display = 'none';
            navUser.style.display = 'flex';
            if (navUpload) navUpload.style.display = '';

            // Decode JWT payload for username
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (navUsername) navUsername.textContent = payload.username;
            } catch (e) {
                if (navUsername) navUsername.textContent = '用户';
            }
        } else {
            navAuth.style.display = 'flex';
            navUser.style.display = 'none';
            if (navUpload) navUpload.style.display = 'none';
        }
    }

    // ─── Logout ───

    function setupLogout() {
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                clearToken();
                window.location.href = '/';
            });
        }
    }

    // ─── Initialize ───

    document.addEventListener('DOMContentLoaded', () => {
        updateNavAuth();
        setupLogout();
    });

    // ─── Exports ───

    window.DOS = window.DOS || {};
    window.DOS.App = {
        getToken,
        setToken,
        clearToken,
        isLoggedIn,
        getAuthHeaders,
        apiFetch,
        showToast,
        updateNavAuth,
    };
})();
