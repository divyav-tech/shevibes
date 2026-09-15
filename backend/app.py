import os
import sys
from flask import Flask, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Add project root to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from backend.routes.ai import ai_bp
from backend.routes.notices import notices_bp
from backend.routes.opportunities import opportunities_bp
from backend.routes.calendar import calendar_bp
from backend.routes.users import users_bp
from backend.routes.auth import auth_bp

app = Flask(__name__, static_folder='../frontend', static_url_path='')
app.secret_key = os.getenv('SECRET_KEY', 'campus-board-secret-key-2026')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
CORS(app, supports_credentials=True)

# Register API blueprints
app.register_blueprint(ai_bp)
app.register_blueprint(notices_bp)
app.register_blueprint(opportunities_bp)
app.register_blueprint(calendar_bp)
app.register_blueprint(users_bp)
app.register_blueprint(auth_bp)

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"Campus Board server running on http://localhost:{port}")
    app.run(debug=True, port=port)
