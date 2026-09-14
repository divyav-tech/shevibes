from flask import Blueprint, request, jsonify
from backend.database import db
import logging

logger = logging.getLogger(__name__)
users_bp = Blueprint('users', __name__)

@users_bp.route('/api/users/profile', methods=['GET'])
def get_profile():
    try:
        user = db.fetch_one("SELECT * FROM users ORDER BY id DESC LIMIT 1")
        if user:
            interests_rows = db.fetch_all("""
                SELECT i.name FROM interests i 
                JOIN user_interests ui ON i.id = ui.interest_id 
                WHERE ui.user_id = %s
            """, (user['id'],))
            user['interests'] = [row['name'] for row in interests_rows]
            return jsonify({'profile': user, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_profile: {e}")
    return jsonify({'profile': None, 'source': 'local', 'success': True})

@users_bp.route('/api/users/profile', methods=['POST'])
def update_profile():
    data = request.get_json() or {}
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    college = data.get('college', 'Maharaja Agrasen Institute of Technology')
    year = data.get('year', '1st Year')
    branch = data.get('branch', 'CSE')
    section = data.get('section', 'A')
    role = 'cr' if 'representative' in (data.get('role') or '').lower() else 'student'
    interests = data.get('interests', [])

    try:
        # Check existing user
        existing = db.fetch_one("SELECT id FROM users ORDER BY id DESC LIMIT 1")
        if existing:
            user_id = existing['id']
            db.execute_query("""
                UPDATE users SET name=%s, college=%s, year=%s, branch=%s, section=%s, role=%s WHERE id=%s
            """, (name, college, year, branch, section, role, user_id))
        else:
            cursor = db.execute_query("""
                INSERT INTO users (name, college, year, branch, section, role) VALUES (%s, %s, %s, %s, %s, %s)
            """, (name, college, year, branch, section, role))
            user_id = cursor.lastrowid if cursor else 1

        # Sync user interests
        if user_id:
            db.execute_query("DELETE FROM user_interests WHERE user_id = %s", (user_id,))
            for interest_name in interests:
                # Ensure interest exists
                db.execute_query("INSERT IGNORE INTO interests (name) VALUES (%s)", (interest_name,))
                int_row = db.fetch_one("SELECT id FROM interests WHERE name = %s", (interest_name,))
                if int_row:
                    db.execute_query("INSERT IGNORE INTO user_interests (user_id, interest_id) VALUES (%s, %s)", (user_id, int_row['id']))

        return jsonify({'message': 'Profile updated successfully', 'user_id': user_id, 'profile': data}), 200
    except Exception as e:
        logger.error(f"Error updating user profile in DB: {e}")
        return jsonify({'message': 'Saved locally (DB unavailable)', 'profile': data}), 200
