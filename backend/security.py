import functools
import logging
from flask import session, jsonify
from backend.database import db

logger = logging.getLogger(__name__)

def get_current_user():
    """Authoritative retrieval of authenticated user from database or memory fallback."""
    user_id = session.get('user_id')
    if not user_id:
        return None

    try:
        user = db.fetch_one("SELECT * FROM users WHERE id = %s", (user_id,))
        if user:
            return user
    except Exception as e:
        logger.error(f"Database error in get_current_user: {e}")

    # Fallback to in-memory storage if DB is in local memory mode
    from backend.routes.auth import _in_memory_users
    return _in_memory_users.get(user_id)

def is_cr(user):
    """Verify if user has Class Representative role."""
    if not user:
        return False
    role = str(user.get('role', '')).strip().lower()
    return role == 'cr' or 'representative' in role or role == 'class representative'

def login_required(f):
    """Decorator requiring a valid authenticated session."""
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required', 'authenticated': False}), 401
        return f(*args, **kwargs)
    return decorated_function

def cr_required(f):
    """Decorator requiring an authenticated user with Class Representative role."""
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required', 'authenticated': False}), 401
        if not is_cr(user):
            return jsonify({'error': 'CR access required', 'message': 'Only Class Representatives are authorized to perform this action.'}), 403
        return f(*args, **kwargs)
    return decorated_function
