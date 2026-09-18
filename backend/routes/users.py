from flask import Blueprint, request, jsonify, session
from backend.database import db
from backend.routes.auth import _in_memory_users, format_user_profile
from backend.security import login_required, get_current_user
import logging

logger = logging.getLogger(__name__)
users_bp = Blueprint('users', __name__)

@users_bp.route('/api/users/profile', methods=['GET'])
@login_required
def get_profile():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized', 'profile': None, 'success': False}), 401

    user_id = user['id']

    try:
        db_user = db.fetch_one("SELECT * FROM users WHERE id = %s", (user_id,))
        if db_user:
            interests_rows = db.fetch_all("""
                SELECT i.name FROM interests i 
                JOIN user_interests ui ON i.id = ui.interest_id 
                WHERE ui.user_id = %s
            """, (db_user['id'],))
            db_user['interests'] = [row['name'] for row in interests_rows]
            profile = format_user_profile(db_user, db_user['interests'])
            return jsonify({'profile': profile, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_profile: {e}")

    # Fallback to in-memory mode if DB unavailable
    if user_id in _in_memory_users:
        u = _in_memory_users[user_id]
        profile = format_user_profile(u, u.get('interests', []))
        return jsonify({'profile': profile, 'source': 'local', 'success': True})

    return jsonify({'error': 'User profile not found', 'profile': None, 'success': False}), 404

@users_bp.route('/api/users/profile', methods=['POST'])
@login_required
def update_profile():
    current_user = get_current_user()
    if not current_user:
        return jsonify({'error': 'Unauthorized'}), 401

    user_id = current_user['id']
    # Role is strictly authoritative and cannot be escalated via request body
    role = current_user.get('role', 'student')

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    college = data.get('college', current_user.get('college', 'Indira Gandhi Delhi Technical University for Women'))
    year = data.get('year', current_user.get('year', '1st Year'))
    branch = data.get('branch', current_user.get('branch', 'CSE'))
    section = data.get('section', current_user.get('section', 'A'))
    interests = data.get('interests', current_user.get('interests', []))

    try:
        cursor = db.execute_query("""
            UPDATE users SET name=%s, college=%s, year=%s, branch=%s, section=%s, role=%s WHERE id=%s
        """, (name, college, year, branch, section, role, user_id))

        if cursor is not None:
            # Sync user interests in DB
            db.execute_query("DELETE FROM user_interests WHERE user_id = %s", (user_id,))
            for interest_name in interests:
                db.execute_query("INSERT IGNORE INTO interests (name) VALUES (%s)", (interest_name,))
                int_row = db.fetch_one("SELECT id FROM interests WHERE name = %s", (interest_name,))
                if int_row:
                    db.execute_query("INSERT IGNORE INTO user_interests (user_id, interest_id) VALUES (%s, %s)", (user_id, int_row['id']))

            user_row = db.fetch_one("SELECT * FROM users WHERE id = %s", (user_id,))
            if user_row:
                profile = format_user_profile(user_row, interests)
                return jsonify({'message': 'Profile updated successfully', 'user_id': user_id, 'profile': profile}), 200
    except Exception as e:
        logger.error(f"Error updating user profile in DB: {e}")

    # Fallback in-memory update
    if user_id in _in_memory_users:
        u = _in_memory_users[user_id]
        u['name'] = name
        u['college'] = college
        u['year'] = year
        u['branch'] = branch
        u['section'] = section
        u['interests'] = interests
        # u['role'] preserved, not overwritten from client
        profile = format_user_profile(u, interests)
        return jsonify({'message': 'Profile updated locally', 'user_id': user_id, 'profile': profile}), 200

    return jsonify({'message': 'Profile updated', 'profile': format_user_profile(current_user, interests)}), 200
