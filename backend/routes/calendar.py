from flask import Blueprint, request, jsonify, session
from backend.database import db
from backend.security import login_required, cr_required, get_current_user, is_cr
import logging

logger = logging.getLogger(__name__)
calendar_bp = Blueprint('calendar', __name__)

# In-memory storage for local mode
_in_memory_calendar_events = []
_deleted_sample_ids = set()

DEMO_EVENTS = [
    {'id': 'demo-e1', 'title': 'Physics Quiz', 'description': 'Units 1–3', 'event_date': '2026-09-13', 'event_time': None, 'location': 'Classroom', 'category': 'deadline', 'created_by': None},
    {'id': 'demo-e2', 'title': 'C Programming Practical Due', 'description': 'Experiment 5', 'event_date': '2026-09-12', 'event_time': None, 'location': 'C Lab', 'category': 'deadline', 'created_by': None},
    {'id': 'demo-e3', 'title': 'Web Development Workshop', 'description': 'HTML, CSS and JS workshop', 'event_date': '2026-09-14', 'event_time': None, 'location': 'Auditorium', 'category': 'opportunity', 'created_by': None},
    {'id': 'demo-e4', 'title': 'Hackathon Registration Closes', 'description': 'Campus Hackathon 2026', 'event_date': '2026-09-16', 'event_time': None, 'location': 'Online', 'category': 'deadline', 'created_by': None},
    {'id': 'demo-e5', 'title': 'Society Recruitment Opens', 'description': 'Freshers recruitment', 'event_date': '2026-09-18', 'event_time': None, 'location': 'Campus', 'category': 'event', 'created_by': None},
    {'id': 'demo-e6', 'title': 'Scholarship Application Closes', 'description': 'Merit scholarship', 'event_date': '2026-09-20', 'event_time': None, 'location': 'Student Affairs', 'category': 'deadline', 'created_by': None}
]

@calendar_bp.route('/api/calendar/events', methods=['GET'])
def get_events():
    user = get_current_user()
    user_id = user['id'] if user else None

    try:
        if user_id:
            query = """
            SELECT * FROM calendar_events 
            WHERE category != 'personal' OR created_by = %s 
            ORDER BY event_date ASC
            """
            rows = db.fetch_all(query, (user_id,))
        else:
            query = """
            SELECT * FROM calendar_events 
            WHERE category != 'personal' 
            ORDER BY event_date ASC
            """
            rows = db.fetch_all(query)

        if rows is not None and len(rows) > 0:
            visible = []
            for r in rows:
                if str(r.get('id')) in _deleted_sample_ids:
                    continue
                if r.get('event_date') is not None:
                    r['event_date'] = str(r['event_date'])
                if r.get('event_time') is not None:
                    r['event_time'] = str(r['event_time'])
                if r.get('created_at') is not None:
                    r['created_at'] = str(r['created_at'])
                visible.append(r)
            if visible:
                return jsonify({'events': visible, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_events: {e}")

    # Fallback to in-memory mode
    if user_id:
        filtered = [
            e for e in _in_memory_calendar_events 
            if str(e.get('id')) not in _deleted_sample_ids and (e.get('category') != 'personal' or e.get('created_by') == user_id)
        ]
    else:
        filtered = [
            e for e in _in_memory_calendar_events 
            if str(e.get('id')) not in _deleted_sample_ids and e.get('category') != 'personal'
        ]

    if filtered:
        return jsonify({'events': filtered, 'source': 'local', 'success': True})

    demo_events = [e for e in DEMO_EVENTS if str(e.get('id')) not in _deleted_sample_ids]
    return jsonify({'events': demo_events, 'source': 'demo', 'success': True})

@calendar_bp.route('/api/calendar/events', methods=['POST'])
@login_required
def create_event():
    user = get_current_user()
    user_id = user['id']

    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    event_date = data.get('event_date') or data.get('date')
    if not title or not event_date:
        return jsonify({'error': 'Title and event_date are required'}), 400

    description = data.get('description', '')
    event_time = data.get('event_time') or data.get('time')
    location = data.get('location') or data.get('venue') or 'Campus'
    raw_cat = (data.get('category') or 'personal').lower()

    # Category normalization
    if raw_cat in ('academic', 'exam', 'class', 'event', 'society', 'competition', 'workshop', 'opportunity'):
        # Academic / class-wide events must be created by a Class Representative
        if not is_cr(user):
            return jsonify({
                'error': 'CR access required',
                'message': 'Only Class Representatives can create academic or campus-wide calendar events.'
            }), 403
        category = 'academic' if raw_cat in ('academic', 'exam', 'class') else raw_cat
    else:
        category = 'personal'

    try:
        query = """
        INSERT INTO calendar_events (title, description, event_date, event_time, location, category, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        cursor = db.execute_query(query, (title, description, str(event_date), event_time, location, category, user_id))
        event_id = cursor.lastrowid if cursor else None

        if event_id:
            data['id'] = event_id
            data['created_by'] = user_id
            data['category'] = category
            return jsonify({'message': 'Event created successfully', 'id': event_id, 'event': data}), 201
    except Exception as e:
        logger.error(f"DB Error creating calendar event: {e}")

    # Fallback in-memory mode
    event_id = len(_in_memory_calendar_events) + 1
    event_record = {
        'id': event_id,
        'title': title,
        'description': description,
        'event_date': str(event_date),
        'event_time': event_time,
        'location': location,
        'category': category,
        'created_by': user_id
    }
    _in_memory_calendar_events.append(event_record)

    return jsonify({'message': 'Event created successfully (local mode)', 'id': event_id, 'event': event_record}), 201

def _can_delete_event(event, user):
    """Owner can remove personal events; only the posting CR can remove campus events.
    Demo/sample campus events with no creator may be removed by any authenticated CR."""
    user_id = user.get('id')
    created_by = event.get('created_by')
    category = str(event.get('category') or '').lower()
    owner_match = created_by is not None and str(created_by) == str(user_id)

    if category == 'personal':
        return owner_match

    if not is_cr(user):
        return False
    if created_by is None or created_by == '':
        return True
    return owner_match


@calendar_bp.route('/api/calendar/events/<event_id>', methods=['DELETE'])
@login_required
def delete_event(event_id):
    global _in_memory_calendar_events
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required', 'authenticated': False, 'message': 'Please sign in to perform this action.'}), 401

    str_id = str(event_id).strip()
    event = None

    try:
        if str_id.isdigit():
            event = db.fetch_one("SELECT * FROM calendar_events WHERE id = %s", (int(str_id),))
    except Exception as e:
        logger.error(f"DB Error fetching calendar event {str_id}: {e}")

    if not event:
        for e in _in_memory_calendar_events:
            if str(e.get('id')) == str_id:
                event = e
                break

    if not event:
        for e in DEMO_EVENTS:
            if str(e.get('id')) == str_id:
                event = e
                break

    if not event and str_id in _deleted_sample_ids:
        return jsonify({'error': 'Not found', 'message': 'This event has already been deleted.'}), 404
    if not event:
        return jsonify({'error': 'Not found', 'message': 'The event does not exist or has already been deleted.'}), 404

    if not _can_delete_event(event, user):
        return jsonify({
            'error': 'Unauthorized',
            'message': 'You are not authorized to delete this calendar event.'
        }), 403

    deleted_db = False
    try:
        if str_id.isdigit():
            int_id = int(str_id)
            db.execute_query("DELETE FROM saved_items WHERE item_type = 'event' AND item_id = %s", (int_id,))
            del_cursor = db.execute_query("DELETE FROM calendar_events WHERE id = %s", (int_id,))
            if del_cursor and del_cursor.rowcount > 0:
                deleted_db = True
    except Exception as e:
        logger.error(f"DB Error deleting calendar event {str_id}: {e}")
        return jsonify({
            'error': 'Database error',
            'message': 'Failed to delete event from database. Please try again.'
        }), 500

    _in_memory_calendar_events = [e for e in _in_memory_calendar_events if str(e.get('id')) != str_id]
    _deleted_sample_ids.add(str_id)

    return jsonify({
        'success': True,
        'message': 'Event deleted successfully.',
        'id': str_id,
        'deleted_from_db': deleted_db
    }), 200
