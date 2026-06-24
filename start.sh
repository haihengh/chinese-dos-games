#!/usr/bin/env bash
set -e

echo
echo "  🕹️  Chinese DOS Games — Web Edition"
echo "  ===================================="
echo

# ── Check Python ──
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    echo "  [ERROR] Python 3.10+ is required but not found."
    echo "  Install: https://www.python.org/downloads/"
    exit 1
fi
PYTHON=$(command -v python3 || command -v python)

# ── Navigate to script directory ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/web"

# ── Install deps ──
echo "  📦 Checking dependencies..."
$PYTHON -m pip install -r requirements.txt -q 2>/dev/null || true

# ── Generate SSL cert if missing ──
if [ ! -f "certs/cert.pem" ]; then
    echo "  🔒 Generating SSL certificate..."
    mkdir -p certs
    $PYTHON -c "
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
" 2>/dev/null
fi

# ── Open browser ──
echo "  🌐 Opening browser..."
if command -v open &>/dev/null; then
    open "https://localhost:5000" 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
    xdg-open "https://localhost:5000" 2>/dev/null || true
fi

# ── Start server ──
echo "  🚀 Starting server..."
echo
echo "  Open https://localhost:5000 in your browser"
echo "  Press Ctrl+C to stop"
echo
$PYTHON app.py --ssl
