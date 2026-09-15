from flask import Blueprint, request, jsonify, session
from backend.database import db
from backend.security import login_required, cr_required, get_current_user, is_cr
import logging

logger = logging.getLogger(__name__)
calendar_bp = Blueprint('calendar', __name__)

# In-memory storage for local mode
_in_memory_calendar_events = []

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
            for r in rows:
                if r.get('event_date') is not None:
                    r['event_date'] = str(r['event_date'])
                if r.get('event_time') is not None:
                    r['event_time'] = str(r['event_time'])
                if r.get('created_at') is not None:
                    r['created_at'] = str(r['created_at'])
            return jsonify({'events': rows, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_events: {e}")

    # Fallback to in-memory mode
    if user_id:
        filtered = [
            e for e in _in_memory_calendar_events 
            if e.get('category') != 'personal' or e.get('created_by') == user_id
        ]
    else:
        filtered = [
            e for e in _in_memory_calendar_events 
            if e.get('category') != 'personal'
        ]

    if filtered:
        return jsonify({'events': filtered, 'source': 'local', 'success': True})

    # Demo campus deadlines/events keep the calendar useful before DB seeding.
    demo_events = [
        {'id': 'demo-e1', 'title': 'Physics Quiz', 'description': 'Units 1–3', 'event_date': '2026-09-13', 'event_time': None, 'location': 'Classroom', 'category': 'deadline', 'created_by': None},
        {'id': 'demo-e2', 'title': 'C Programming Practical Due', 'description': 'Experiment 5', 'event_date': '2026-09-12', 'event_time': None, 'location': 'C Lab', 'category': 'deadline', 'created_by': None},
        {'id': 'demo-e3', 'title': 'Web Development Workshop', 'description': 'HTML, CSS and JS workshop', 'event_date': '2026-09-14', 'event_time': None, 'location': 'Auditorium', 'category': 'opportunity', 'created_by': None},
        {'id': 'demo-e4', 'title': 'Hackathon Registration Closes', 'description': 'Campus Hackathon 2026', 'event_date': '2026-09-16', 'event_time': None, 'location': 'Online', 'category': 'deadline', 'created_by': None},
        {'id': 'demo-e5', 'title': 'Society Recruitment Opens', 'description': 'Freshers recruitment', 'event_date': '2026-09-18', 'event_time': None, 'location': 'Campus', 'category': 'event', 'created_by': None},
        {'id': 'demo-e6', 'title': 'Scholarship Application Closes', 'description': 'Merit scholarship', 'event_date': '2026-09-20', 'event_time': None, 'location': 'Student Affairs', 'category': 'deadline', 'created_by': None}
    ]
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

@calendar_bp.route('/api/calendar/events/<int:event_id>', methods=['DELETE'])
@login_required
def delete_event(event_id):
    user = get_current_user()
    user_id = user['id']

    try:
        event = db.fetch_one("SELECT * FROM calendar_events WHERE id = %s", (event_id,))
        if event:
            # Users can delete their own events; CRs can delete events they created or class events
            if event.get('created_by') != user_id and not is_cr(user):
                return jsonify({'error': 'Unauthorized to delete this calendar event'}), 403

            db.execute_query("DELETE FROM calendar_events WHERE id = %s", (event_id,))
            return jsonify({'message': 'Event deleted successfully', 'id': event_id}), 200
    except Exception as e:
        logger.error(f"DB Error deleting calendar event: {e}")

    # Fallback in-memory mode
    global _in_memory_calendar_events
    for i, e in enumerate(_in_memory_calendar_events):
        if e.get('id') == event_id:
            if e.get('created_by') != user_id and not is_cr(user):
                return jsonify({'error': 'Unauthorized to delete this calendar event'}), 403
            _in_memory_calendar_events.pop(i)
            return jsonify({'message': 'Event deleted successfully', 'id': event_id}), 200

    return jsonify({'error': 'Event not found'}), 404
