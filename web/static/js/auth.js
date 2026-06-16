/**
 * Chinese DOS Games — Auth (Login / Register) Script
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        // If already logged in, redirect
        if (window.DOS.App.isLoggedIn()) {
            window.location.href = '/';
            return;
        }

        const isLogin = !!document.getElementById('login-form');
        const form = document.getElementById(isLogin ? 'login-form' : 'register-form');

        if (!form) return;

        const errorEl = document.getElementById('form-error');
        const submitBtn = document.getElementById('submit-btn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = form.username.value.trim();
            const password = form.password.value;

            // Client-side validation
            if (!username || username.length < 2) {
                showError('用户名需要至少 2 个字符');
                return;
            }
            if (!password || password.length < 4) {
                showError('密码需要至少 4 个字符');
                return;
            }

            errorEl.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = isLogin ? '登录中...' : '注册中...';

            try {
                const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });

                const data = await resp.json();

                if (!resp.ok) {
                    showError(data.error || '操作失败');
                    submitBtn.disabled = false;
                    submitBtn.textContent = isLogin ? '登录' : '注册';
                    return;
                }

                // Store token
                if (data.token) {
                    window.DOS.App.setToken(data.token);
                    window.DOS.App.updateNavAuth();
                    window.location.href = '/';
                }
            } catch (err) {
                showError('网络错误，请稍后重试');
                submitBtn.disabled = false;
                submitBtn.textContent = isLogin ? '登录' : '注册';
            }
        });

        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
    });
})();
