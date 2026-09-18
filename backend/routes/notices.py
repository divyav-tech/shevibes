from flask import Blueprint, request, jsonify, session
from backend.database import db
from backend.security import cr_required, get_current_user
import json
import logging

logger = logging.getLogger(__name__)
notices_bp = Blueprint('notices', __name__)

# In-memory storage for local mode
_in_memory_notices = []
_deleted_sample_ids = set()

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
            if str(r.get('id')) in _deleted_sample_ids:
                continue
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
            combined.extend([n for n in sample_notices if str(n.get('id')) not in _deleted_sample_ids and _audience_matches(n.get('class_name') or n.get('forClass'), user)])
    except Exception as e:
        logger.warning(f'Could not load sample notices: {e}')

    combined.extend([n for n in _in_memory_notices if str(n.get('id')) not in _deleted_sample_ids and _audience_matches(n.get('class_name') or n.get('forClass'), user)])
    # De-duplicate by title + deadline so local/demo and DB records don't create
    # an awkward duplicate card during development.
    seen = set()
    unique = []
    for item in combined:
        if str(item.get('id')) in _deleted_sample_ids:
            continue
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

@notices_bp.route('/api/notices/<notice_id>', methods=['DELETE'])
@notices_bp.route('/api/notices', methods=['DELETE'])
@cr_required
def delete_notice(notice_id=None):
    global _in_memory_notices
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required', 'authenticated': False, 'message': 'Please sign in to perform this action.'}), 401

    if not notice_id:
        data = request.get_json(silent=True) or {}
        notice_id = request.args.get('id') or data.get('id')

    if not notice_id:
        return jsonify({'error': 'Notice ID required', 'message': 'Announcement ID must be provided.'}), 400

    str_id = str(notice_id).strip()
    user_id = user.get('id')

    # Step 1: Find the target announcement to inspect its class/author
    announcement = None
    source_type = None

    # Try DB lookup first
    try:
        if str_id.isdigit():
            announcement = db.fetch_one("SELECT * FROM announcements WHERE id = %s", (int(str_id),))
            if announcement:
                source_type = 'db'
    except Exception as e:
        logger.error(f"DB Error fetching notice {str_id} for deletion: {e}")

    # Check in-memory notices
    if not announcement:
        for item in _in_memory_notices:
            if str(item.get('id')) == str_id:
                announcement = item
                source_type = 'memory'
                break

    # Check sample notices from file
    if not announcement:
        try:
            import os
            sample_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'sample_notices.json')
            if os.path.exists(sample_path) and os.path.getsize(sample_path) > 0:
                with open(sample_path, 'r', encoding='utf-8') as fh:
                    sample_notices = json.load(fh)
                if isinstance(sample_notices, list):
                    for item in sample_notices:
                        if str(item.get('id')) == str_id:
                            announcement = item
                            source_type = 'sample'
                            break
        except Exception as e:
            logger.warning(f"Error checking sample notices during delete: {e}")

    # Support client sample IDs like a1..a6
    if not announcement and str_id.startswith('a'):
        source_type = 'sample'
        announcement = {'id': str_id, 'class_name': 'All Students'}

    # If already deleted or not found
    if not announcement and str_id in _deleted_sample_ids:
        return jsonify({'error': 'Not found', 'message': 'This announcement has already been deleted.'}), 404

    if not announcement:
        return jsonify({'error': 'Not found', 'message': 'The announcement does not exist or has already been deleted.'}), 404

    # Step 2: Validate CR authorization for this specific announcement
    posted_by = announcement.get('posted_by')
    ann_class = announcement.get('class_name') or announcement.get('forClass')
    is_author = (posted_by is not None and str(posted_by) == str(user_id))
    matches_class = _audience_matches(ann_class, user)

    if posted_by is not None:
        if not is_author and not matches_class:
            return jsonify({
                'error': 'Unauthorized',
                'message': 'You are only authorized to delete announcements posted for your class.'
            }), 403
    else:
        if not matches_class and ann_class not in (None, '', 'All Students', 'College-wide'):
            return jsonify({
                'error': 'Unauthorized',
                'message': 'You are only authorized to delete announcements posted for your class.'
            }), 403

    # Step 3: Perform actual deletion from storage
    deleted_db = False
    try:
        if str_id.isdigit():
            int_id = int(str_id)
            # Remove linked calendar events referencing this announcement to maintain FK integrity
            db.execute_query("DELETE FROM calendar_events WHERE announcement_id = %s", (int_id,))
            # Remove linked saved items
            db.execute_query("DELETE FROM saved_items WHERE item_type = 'announcement' AND item_id = %s", (int_id,))
            # Delete announcement record
            del_cursor = db.execute_query("DELETE FROM announcements WHERE id = %s", (int_id,))
            if del_cursor and del_cursor.rowcount > 0:
                deleted_db = True
    except Exception as e:
        logger.error(f"DB Error deleting announcement {str_id}: {e}")
        return jsonify({
            'error': 'Database error',
            'message': 'Failed to delete announcement from database. Please try again.'
        }), 500

    # In-memory storage cleanup
    
    _in_memory_notices = [n for n in _in_memory_notices if str(n.get('id')) != str_id]

    # Clean in-memory calendar events
    try:
        import backend.routes.calendar as cal_mod
        cal_mod._in_memory_calendar_events = [
            e for e in getattr(cal_mod, '_in_memory_calendar_events', [])
            if str(e.get('announcement_id')) != str_id
        ]
    except Exception as e:
        logger.warning(f"Could not clean in-memory calendar events: {e}")

    # Record in deleted sample/local set so it remains deleted across requests
    _deleted_sample_ids.add(str_id)

    return jsonify({
        'success': True,
        'message': 'Announcement deleted successfully.',
        'id': str_id,
        'deleted_from_db': deleted_db
    }), 200

