@echo off
chcp 65001 >nul
title Chinese DOS Games

echo.
echo   🕹️  Chinese DOS Games — Web Edition
echo   ====================================
echo.

:: ── Check Python ──
python --version >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Python 3.10+ is required but not found.
    echo.
    echo   Install options:
    echo     1. Microsoft Store: search "Python 3.12"
    echo     2. Download: https://www.python.org/downloads/
    echo     3. winget: winget install Python.Python.3.12
    echo.
    pause
    exit /b 1
)

:: ── Check / install deps ──
echo   📦 Checking dependencies...
cd /d "%~dp0web"
pip install -r requirements.txt -q 2>nul
if errorlevel 1 (
    echo   [WARN] Some packages may have failed. Trying with --user...
    pip install -r requirements.txt -q --user 2>nul
)

:: ── Generate SSL cert if missing ──
if not exist "certs\cert.pem" (
    echo   🔒 Generating SSL certificate...
    python -c "import os; os.makedirs('certs',exist_ok=True)" 2>nul
    python -c "
import os,datetime,ipaddress
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
p='certs/cert.pem'; kp='certs/key.pem'
if not os.path.exists(p):
    key=rsa.generate_private_key(65537,2048,default_backend())
    sub=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'localhost')])
    cert=x509.CertificateBuilder().subject_name(sub).issuer_name(sub).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(datetime.datetime.utcnow()).not_valid_after(datetime.datetime.utcnow()+datetime.timedelta(days=3650)).add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'),x509.IPAddress(ipaddress.IPv4Address('127.0.0.1'))]),False).sign(key,hashes.SHA256(),default_backend())
    with open(kp,'wb') as f: f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.TraditionalOpenSSL,serialization.NoEncryption()))
    with open(p,'wb') as f: f.write(cert.public_bytes(serialization.Encoding.PEM))
    print('   SSL cert created.')
" 2>nul
)

:: ── Open browser ──
echo   🌐 Opening browser...
start https://localhost:5000 2>nul

:: ── Start server ──
echo   🚀 Starting server...
echo.
echo   Open https://localhost:5000 in your browser
echo   Press Ctrl+C to stop
echo.
python app.py --ssl

pause
