from flask import Blueprint, request, jsonify, session
from backend.database import db
from backend.security import cr_required, get_current_user
import json
import logging

logger = logging.getLogger(__name__)
notices_bp = Blueprint('notices', __name__)

# In-memory storage for local mode
_in_memory_notices = []

def _audience_matches(audience, user):
    if not audience or audience in ('All Students', 'College-wide'):
        return True
    if not user:
        return False
    year = user.get('year', '')
    branch = user.get('branch', '')
    section = user.get('section', '')
    exact = f"{year} · {branch} · Section {section}"
    return audience in (
        exact,
        f"{year} · {branch} · All Sections",
        f"{branch} · All Years",
        f"{year} · All Branches"
    )

@notices_bp.route('/api/notices', methods=['GET'])
def get_notices():
    user = get_current_user()
    combined = []
    try:
        rows = db.fetch_all("SELECT * FROM announcements ORDER BY created_at DESC")
        for r in rows or []:
            if isinstance(r.get('tags'), str):
                try:
                    r['tags'] = json.loads(r['tags'])
                except Exception:
                    r['tags'] = []
            if _audience_matches(r.get('class_name'), user):
                combined.append(r)
    except Exception as e:
        logger.error(f"DB Error in get_notices: {e}")

    # Demo/sample content intentionally remains available so a fresh deployment
    # still looks populated. Real DB announcements are shown alongside it.
    try:
        import os
        sample_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'sample_notices.json')
        with open(sample_path, 'r', encoding='utf-8') as fh:
            sample_notices = json.load(fh)
        if isinstance(sample_notices, list):
            combined.extend([n for n in sample_notices if _audience_matches(n.get('class_name') or n.get('forClass'), user)])
    except Exception as e:
        logger.warning(f'Could not load sample notices: {e}')

    combined.extend([n for n in _in_memory_notices if _audience_matches(n.get('class_name') or n.get('forClass'), user)])
    # De-duplicate by title + deadline so local/demo and DB records don't create
    # an awkward duplicate card during development.
    seen = set()
    unique = []
    for item in combined:
        key = (str(item.get('title','')).strip().lower(), str(item.get('deadline') or ''))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return jsonify({'notices': unique, 'source': 'database+demo' if unique else 'empty', 'success': True})

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

@notices_bp.route('/api/notices/<int:notice_id>', methods=['DELETE'])
@cr_required
def delete_notice(notice_id):
    try:
        notice = db.fetch_one("SELECT * FROM announcements WHERE id = %s", (notice_id,))
        if not notice:
            # Check in-memory store
            global _in_memory_notices
            for i, n in enumerate(_in_memory_notices):
                if n.get('id') == notice_id:
                    _in_memory_notices.pop(i)
                    return jsonify({'message': 'Notice deleted successfully (local mode)'}), 200
            return jsonify({'error': 'Notice not found'}), 404

        # Delete dependent records first to avoid foreign key constraint errors
        db.execute_query("DELETE FROM calendar_events WHERE announcement_id = %s", (notice_id,))
        db.execute_query("DELETE FROM saved_items WHERE item_type = 'announcement' AND item_id = %s", (notice_id,))
        
        # Delete the announcement
        db.execute_query("DELETE FROM announcements WHERE id = %s", (notice_id,))
        
        return jsonify({'message': 'Notice deleted successfully'}), 200
    except Exception as e:
        logger.error(f"DB Error deleting notice: {e}")
        return jsonify({'error': 'Failed to delete notice'}), 500
