import os
import re
import logging
from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from backend.database import db

logger = logging.getLogger(__name__)
auth_bp = Blueprint('auth', __name__)

# Fallback in-memory storage for local storage mode when MySQL is unavailable
_in_memory_users = {}
_in_memory_id_counter = 1

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

def validate_college_email(email):
    if not email or not isinstance(email, str):
        return False, "College email ID is required."
    email = email.strip()
    if not EMAIL_REGEX.match(email):
        return False, "Please enter a valid email address."
    
    allowed_domain = os.getenv('COLLEGE_EMAIL_DOMAIN', '').strip()
    if allowed_domain:
        # Check domain suffix
        domain_part = email.split('@')[-1]
        if domain_part.lower() != allowed_domain.lower() and not domain_part.lower().endswith('.' + allowed_domain.lower()):
            return False, f"Email must belong to the college domain @{allowed_domain}"
            
    return True, None

def format_user_profile(user_dict, interests=None):
    if not user_dict:
        return None
    role = user_dict.get('role', 'student')
    if role == 'cr':
        role_label = 'Class Representative'
    elif 'representative' in str(role).lower():
        role_label = 'Class Representative'
    else:
        role_label = 'Regular Student'

    return {
        'id': user_dict.get('id'),
        'name': user_dict.get('name'),
        'college_email': user_dict.get('college_email'),
        'college': user_dict.get('college', 'Indira Gandhi Delhi Technical University for Women'),
        'year': user_dict.get('year', '1st Year'),
        'branch': user_dict.get('branch', 'CSE'),
        'section': user_dict.get('section', 'A'),
        'role': role_label,
        'interests': interests or user_dict.get('interests', [])
    }

@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    college_email = (data.get('college_email') or '').strip().lower()
    password = data.get('password') or ''
    
    if not name:
        return jsonify({'error': 'Full name is required'}), 400
    if not password:
        return jsonify({'error': 'Password is required'}), 400

    valid, err_msg = validate_college_email(college_email)
    if not valid:
        return jsonify({'error': err_msg}), 400

    college = data.get('college', 'Indira Gandhi Delhi Technical University for Women')
    year = data.get('year', '1st Year')
    branch = data.get('branch', 'CSE')
    section = data.get('section', 'A')
    role_input = (data.get('role') or '').lower()
    role = 'cr' if 'representative' in role_input or role_input == 'cr' else 'student'
    interests = data.get('interests', [])

    password_hash = generate_password_hash(password)

    try:
        # Check DB first
        existing_user = db.fetch_one("SELECT id FROM users WHERE college_email = %s", (college_email,))
        if existing_user:
            return jsonify({'error': 'This college email is already registered. Please sign in instead.'}), 400

        cursor = db.execute_query("""
            INSERT INTO users (name, college_email, password_hash, college, year, branch, section, role)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (name, college_email, password_hash, college, year, branch, section, role))

        if cursor and cursor.lastrowid:
            user_id = cursor.lastrowid
            # Sync interests in DB
            for interest_name in interests:
                db.execute_query("INSERT IGNORE INTO interests (name) VALUES (%s)", (interest_name,))
                int_row = db.fetch_one("SELECT id FROM interests WHERE name = %s", (interest_name,))
                if int_row:
                    db.execute_query("INSERT IGNORE INTO user_interests (user_id, interest_id) VALUES (%s, %s)", (user_id, int_row['id']))

            session['user_id'] = user_id
            profile = format_user_profile({
                'id': user_id, 'name': name, 'college_email': college_email,
                'college': college, 'year': year, 'branch': branch, 'section': section,
                'role': role
            }, interests)
            return jsonify({'message': 'Registration successful', 'user': profile}), 201

    except Exception as e:
        logger.error(f"Database error during registration: {e}")

    # Fallback for when DB is unavailable or in memory mode
    global _in_memory_id_counter
    for u in _in_memory_users.values():
        if u['college_email'] == college_email:
            return jsonify({'error': 'This college email is already registered. Please sign in instead.'}), 400

    user_id = _in_memory_id_counter
    _in_memory_id_counter += 1
    user_record = {
        'id': user_id,
        'name': name,
        'college_email': college_email,
        'password_hash': password_hash,
        'college': college,
        'year': year,
        'branch': branch,
        'section': section,
        'role': role,
        'interests': interests
    }
    _in_memory_users[user_id] = user_record
    session['user_id'] = user_id

    profile = format_user_profile(user_record, interests)
    return jsonify({'message': 'Registration successful (local mode)', 'user': profile}), 201

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    college_email = (data.get('college_email') or '').strip().lower()
    password = data.get('password') or ''

    if not college_email or not password:
        return jsonify({'error': 'Incorrect college email or password.'}), 401

    user_row = None
    interests = []

    try:
        user_row = db.fetch_one("SELECT * FROM users WHERE college_email = %s", (college_email,))
        if user_row:
            interests_rows = db.fetch_all("""
                SELECT i.name FROM interests i 
                JOIN user_interests ui ON i.id = ui.interest_id 
                WHERE ui.user_id = %s
            """, (user_row['id'],))
            interests = [r['name'] for r in interests_rows]
    except Exception as e:
        logger.error(f"Database error during login: {e}")

    if not user_row:
        # Check in-memory storage
        for u in _in_memory_users.values():
            if u['college_email'] == college_email:
                user_row = u
                interests = u.get('interests', [])
                break

    if not user_row or not check_password_hash(user_row['password_hash'], password):
        return jsonify({'error': 'Incorrect college email or password.'}), 401

    session['user_id'] = user_row['id']
    profile = format_user_profile(user_row, interests)
    return jsonify({'message': 'Login successful', 'user': profile}), 200

@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'message': 'Logged out successfully'}), 200

@auth_bp.route('/api/auth/me', methods=['GET'])
def get_me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'authenticated': False, 'user': None}), 401

    user_row = None
    interests = []
    try:
        user_row = db.fetch_one("SELECT * FROM users WHERE id = %s", (user_id,))
        if user_row:
            interests_rows = db.fetch_all("""
                SELECT i.name FROM interests i 
                JOIN user_interests ui ON i.id = ui.interest_id 
                WHERE ui.user_id = %s
            """, (user_id,))
            interests = [r['name'] for r in interests_rows]
    except Exception as e:
        logger.error(f"Database error in /api/auth/me: {e}")

    if not user_row and user_id in _in_memory_users:
        user_row = _in_memory_users[user_id]
        interests = user_row.get('interests', [])

    if not user_row:
        session.pop('user_id', None)
        return jsonify({'authenticated': False, 'user': None}), 401

    profile = format_user_profile(user_row, interests)
    return jsonify({'authenticated': True, 'user': profile}), 200
