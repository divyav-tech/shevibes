from flask import Blueprint, request, jsonify
from backend.database import db
import logging

logger = logging.getLogger(__name__)
calendar_bp = Blueprint('calendar', __name__)

@calendar_bp.route('/api/calendar/events', methods=['GET'])
def get_events():
    try:
        rows = db.fetch_all("SELECT * FROM calendar_events ORDER BY event_date ASC")
        if rows:
            return jsonify({'events': rows, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_events: {e}")
    return jsonify({'events': [], 'source': 'local', 'success': True})

@calendar_bp.route('/api/calendar/events', methods=['POST'])
def create_event():
    data = request.get_json() or {}
    title = data.get('title')
    event_date = data.get('event_date') or data.get('date')
    if not title or not event_date:
        return jsonify({'error': 'Title and event_date are required'}), 400

    description = data.get('description', '')
    event_time = data.get('event_time') or data.get('time')
    location = data.get('location') or data.get('venue') or 'Campus'
    category = (data.get('category') or 'academic').lower()

    query = """
    INSERT INTO calendar_events (title, description, event_date, event_time, location, category)
    VALUES (%s, %s, %s, %s, %s, %s)
    """
    cursor = db.execute_query(query, (title, description, event_date, event_time, location, category))
    event_id = cursor.lastrowid if cursor else None

    return jsonify({'message': 'Event created successfully', 'id': event_id, 'event': data}), 201
