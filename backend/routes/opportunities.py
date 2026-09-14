from flask import Blueprint, request, jsonify
from backend.database import db
import logging

logger = logging.getLogger(__name__)
opportunities_bp = Blueprint('opportunities', __name__)

@opportunities_bp.route('/api/opportunities', methods=['GET'])
def get_opportunities():
    try:
        rows = db.fetch_all("SELECT * FROM opportunities ORDER BY created_at DESC")
        if rows:
            return jsonify({'opportunities': rows, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_opportunities: {e}")
    return jsonify({'opportunities': [], 'source': 'local', 'success': True})
