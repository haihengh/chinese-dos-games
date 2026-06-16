/**
 * Chinese DOS Games — Upload Script
 */
(function () {
    'use strict';

    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

    document.addEventListener('DOMContentLoaded', () => {
        // Check auth
        if (!window.DOS.App.isLoggedIn()) {
            document.getElementById('upload-zone').style.display = 'none';
            document.getElementById('upload-login-prompt').style.display = 'block';
            return;
        }

        document.getElementById('upload-login-prompt').style.display = 'none';

        const uploadZone = document.getElementById('upload-zone');
        const fileInput = document.getElementById('file-input');
        const btnSelect = document.getElementById('btn-select-file');
        const uploadStatus = document.getElementById('upload-status');
        const uploadSuccess = document.getElementById('upload-success');
        const progressFill = document.getElementById('progress-fill');
        const uploadFilename = document.getElementById('upload-filename');
        const uploadFilesize = document.getElementById('upload-filesize');
        const uploadMessage = document.getElementById('upload-message');
        const uploadError = document.getElementById('upload-error');

        // Click to select file
        btnSelect.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('click', (e) => {
            if (e.target !== btnSelect) fileInput.click();
        });

        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) handleFile(file);
        });

        function handleFile(file) {
            // Validate
            if (!file.name.toLowerCase().endsWith('.zip')) {
                showError('只接受 .zip 文件');
                return;
            }
            if (file.size > MAX_FILE_SIZE) {
                showError('文件太大，最大支持 200MB');
                return;
            }
            if (file.size === 0) {
                showError('文件为空');
                return;
            }

            // Show status
            uploadZone.style.display = 'none';
            uploadStatus.style.display = 'block';
            uploadSuccess.style.display = 'none';
            uploadError.style.display = 'none';
            progressFill.style.width = '0%';
            uploadFilename.textContent = file.name;
            uploadFilesize.textContent = formatSize(file.size);
            uploadMessage.textContent = '准备上传...';

            // Upload
            uploadFile(file);
        }

        function uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = pct + '%';
                    uploadMessage.textContent = `上传中... ${pct}%`;
                }
            });

            xhr.addEventListener('load', () => {
                try {
                    const resp = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300 && resp.success) {
                        uploadStatus.style.display = 'none';
                        uploadSuccess.style.display = 'block';

                        const btnPlay = document.getElementById('btn-play-uploaded');
                        if (btnPlay && resp.identifier) {
                            btnPlay.href = '/games/' + encodeURIComponent(resp.identifier);
                        }
                    } else {
                        showError(resp.error || '上传处理失败');
                    }
                } catch (e) {
                    showError('服务器响应异常');
                }
            });

            xhr.addEventListener('error', () => {
                showError('网络错误，上传失败');
            });

            xhr.addEventListener('abort', () => {
                showError('上传已取消');
            });

            const token = window.DOS.App.getToken();
            xhr.open('POST', '/api/upload');
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.send(formData);
        }

        function showError(msg) {
            uploadError.textContent = msg;
            uploadError.style.display = 'block';
            uploadZone.style.display = 'block';
            uploadStatus.style.display = 'none';
            uploadSuccess.style.display = 'none';
        }

        function formatSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }
    });
})();
