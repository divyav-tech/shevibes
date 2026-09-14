from flask import Blueprint, request, jsonify

opportunities_bp = Blueprint('opportunities', __name__)

@opportunities_bp.route('/api/opportunities', methods=['GET'])
def get_opportunities():
    return jsonify({'opportunities': [], 'message': 'Opportunities endpoint active'})
