"""Campus Board development launcher.

Run from the project root with:
    python app.py
"""
import os
from backend.app import app

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"Campus Board server running on http://localhost:{port}")
    app.run(debug=True, port=port)
