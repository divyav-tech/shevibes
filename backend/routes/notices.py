from flask import Blueprint, request, jsonify

notices_bp = Blueprint('notices', __name__)

@notices_bp.route('/api/notices', methods=['GET'])
def get_notices():
    return jsonify({'notices': [], 'message': 'Notices endpoint active'})

@notices_bp.route('/api/notices', methods=['POST'])
def create_notice():
    data = request.get_json() or {}
    return jsonify({'message': 'Notice created successfully', 'notice': data}), 201
