from flask import Blueprint, request, jsonify
from backend.database import db
import json
import logging

logger = logging.getLogger(__name__)
notices_bp = Blueprint('notices', __name__)

@notices_bp.route('/api/notices', methods=['GET'])
def get_notices():
    try:
        rows = db.fetch_all("SELECT * FROM announcements ORDER BY created_at DESC")
        if rows:
            for r in rows:
                if isinstance(r.get('tags'), str):
                    try:
                        r['tags'] = json.loads(r['tags'])
                    except Exception:
                        r['tags'] = []
            return jsonify({'notices': rows, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_notices: {e}")
    return jsonify({'notices': [], 'source': 'local', 'success': True})

@notices_bp.route('/api/notices', methods=['POST'])
def create_notice():
    data = request.get_json() or {}
    title = data.get('title')
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    summary = data.get('summary') or data.get('description', '')
    content = data.get('content') or data.get('raw', '')
    subject = data.get('subject')
    action = data.get('action')
    time = data.get('time')
    venue = data.get('venue')
    category = (data.get('category') or 'general').lower()
    priority = (data.get('priority') or 'medium').lower()
    class_name = data.get('forClass') or data.get('class_name')
    deadline = data.get('deadline')
    tags_json = json.dumps(data.get('tags', []))
    confidence = data.get('confidence', 1.0)
    source = data.get('source', 'Class Representative')
    ai_generated = 1 if data.get('aiGenerated') else 0

    query = """
    INSERT INTO announcements 
    (title, summary, content, subject, action, time, venue, category, priority, class_name, deadline, tags, confidence, source, ai_generated)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    params = (title, summary, content, subject, action, time, venue, category, priority, class_name, deadline, tags_json, confidence, source, ai_generated)
    
    cursor = db.execute_query(query, params)
    if not cursor:
        logger.error("DB failure: announcement INSERT returned no cursor")
        return jsonify({'error': 'Failed to save announcement. Database error.'}), 503
    announcement_id = cursor.lastrowid
    cal_event_created = False

    # Requirement 8: If add_to_calendar=true and deadline is present, auto-create calendar_event record
    if data.get('add_to_calendar') and deadline:
        cal_category_map = {
            'academic': 'academic',
            'deadline': 'deadline',
            'important': 'deadline',
            'opportunity': 'opportunity',
            'workshop': 'opportunity',
            'competition': 'opportunity',
            'event': 'event',
            'class': 'event',
            'society': 'event',
            'general': 'event',
        }
        cal_category = cal_category_map.get(category, 'event')
        evt_query = """
        INSERT INTO calendar_events (title, description, event_date, location, category, announcement_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """
        evt_params = (title, summary, deadline, venue or 'Campus', cal_category, announcement_id)
        evt_cursor = db.execute_query(evt_query, evt_params)
        if evt_cursor is not None:
            cal_event_created = True

    return jsonify({'message': 'Notice created successfully', 'id': announcement_id, 'calendar_event_created': cal_event_created if data.get('add_to_calendar') else None, 'notice': data}), 201
