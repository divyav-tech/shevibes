from flask import Blueprint, request, jsonify, session
from backend.database import db
from backend.security import cr_required, get_current_user
import json
import logging

logger = logging.getLogger(__name__)
notices_bp = Blueprint('notices', __name__)

# In-memory storage for local mode
_in_memory_notices = []

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

    if _in_memory_notices:
        return jsonify({'notices': _in_memory_notices, 'source': 'local', 'success': True})

    # Keep the demo experience populated when MySQL has not been seeded yet.
    try:
        import os
        sample_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'sample_notices.json')
        with open(sample_path, 'r', encoding='utf-8') as fh:
            sample_notices = json.load(fh)
        if isinstance(sample_notices, list):
            return jsonify({'notices': sample_notices, 'source': 'demo', 'success': True})
    except Exception as e:
        logger.warning(f'Could not load sample notices: {e}')

    return jsonify({'notices': [], 'source': 'local', 'success': True})

@notices_bp.route('/api/notices', methods=['POST'])
@cr_required
def create_notice():
    user = get_current_user()
    user_id = user['id'] if user else None

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

    announcement_id = None
    cal_event_created = False

    try:
        query = """
        INSERT INTO announcements 
        (title, summary, content, subject, action, time, venue, category, priority, class_name, deadline, tags, confidence, source, ai_generated, posted_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        params = (title, summary, content, subject, action, time, venue, category, priority, class_name, deadline, tags_json, confidence, source, ai_generated, user_id)
        cursor = db.execute_query(query, params)
        if cursor and cursor.lastrowid:
            announcement_id = cursor.lastrowid

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
                INSERT INTO calendar_events (title, description, event_date, location, category, announcement_id, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """
                evt_params = (title, summary, deadline, venue or 'Campus', cal_category, announcement_id, user_id)
                evt_cursor = db.execute_query(evt_query, evt_params)
                if evt_cursor is not None:
                    cal_event_created = True

            return jsonify({
                'message': 'Notice created successfully',
                'id': announcement_id,
                'calendar_event_created': cal_event_created if data.get('add_to_calendar') else None,
                'notice': data
            }), 201
    except Exception as e:
        logger.error(f"DB Error saving notice: {e}")

    # Fallback to in-memory mode
    announcement_id = len(_in_memory_notices) + 1
    notice_obj = {
        'id': announcement_id,
        'title': title,
        'summary': summary,
        'content': content,
        'subject': subject,
        'action': action,
        'time': time,
        'venue': venue,
        'category': category,
        'priority': priority,
        'class_name': class_name,
        'deadline': deadline,
        'tags': data.get('tags', []),
        'confidence': confidence,
        'source': source,
        'ai_generated': ai_generated,
        'posted_by': user_id
    }
    _in_memory_notices.insert(0, notice_obj)

    if data.get('add_to_calendar') and deadline:
        from backend.routes.calendar import _in_memory_calendar_events
        _in_memory_calendar_events.append({
            'id': len(_in_memory_calendar_events) + 1,
            'title': title,
            'description': summary,
            'event_date': deadline,
            'event_time': time,
            'location': venue or 'Campus',
            'category': category,
            'created_by': user_id,
            'announcement_id': announcement_id
        })
        cal_event_created = True

    return jsonify({
        'message': 'Notice created successfully (local mode)',
        'id': announcement_id,
        'calendar_event_created': cal_event_created if data.get('add_to_calendar') else None,
        'notice': data
    }), 201
