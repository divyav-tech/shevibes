from flask import Blueprint, request, jsonify

users_bp = Blueprint('users', __name__)

@users_bp.route('/api/users/profile', methods=['GET'])
def get_profile():
    return jsonify({'profile': None, 'message': 'Profile endpoint active'})

@users_bp.route('/api/users/profile', methods=['POST'])
def update_profile():
    data = request.get_json() or {}
    return jsonify({'message': 'Profile updated successfully', 'profile': data})
