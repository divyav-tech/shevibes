from flask import Blueprint, request, jsonify
from backend.database import db
from backend.security import login_required, cr_required, get_current_user
import json
import logging

logger = logging.getLogger(__name__)
timetable_bp = Blueprint('timetable', __name__)

_in_memory_timetables = []
_deleted_sample_ids = set()
_demo_timetable_deleted = False


def _ensure_table():
    """Small migration so an existing local DB can use timetable without manual SQL."""
    try:
        db.execute_query("""
            CREATE TABLE IF NOT EXISTS timetables (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                audience VARCHAR(200) NOT NULL,
                entries_json LONGTEXT NOT NULL,
                source_image_name VARCHAR(255),
                status ENUM('draft','published') DEFAULT 'draft',
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        """)
    except Exception as e:
        logger.warning("Timetable table unavailable: %s", e)


def _matches(audience, user):
    if not audience or audience in ('All Students', 'College-wide'):
        return True
    if not user:
        return False
    year, branch, section = user.get('year',''), user.get('branch',''), user.get('section','')
    return audience in (
        f"{year} · {branch} · Section {section}",
        f"{year} · {branch} · All Sections",
        f"{branch} · All Years",
        f"{year} · All Branches"
    )


@timetable_bp.route('/api/timetable', methods=['GET'])
@login_required
def get_timetable():
    _ensure_table()
    user = get_current_user()
    try:
        rows = db.fetch_all("SELECT * FROM timetables WHERE status='published' ORDER BY updated_at DESC")
        for row in rows:
            if str(row.get('id')) in _deleted_sample_ids:
                continue
            if _matches(row.get('audience'), user):
                try:
                    entries = json.loads(row.get('entries_json') or '[]')
                except Exception:
                    entries = []
                return jsonify({'success': True, 'timetable': {
                    'id': row.get('id'), 'title': row.get('title'), 'audience': row.get('audience'),
                    'entries': entries, 'status': row.get('status'),
                    'created_by': row.get('created_by'),
                    'updated_at': str(row.get('updated_at') or '')
                }, 'source': 'database'})
    except Exception as e:
        logger.warning("Timetable DB read failed: %s", e)

    for item in _in_memory_timetables:
        if str(item.get('id')) in _deleted_sample_ids:
            continue
        if item.get('status') == 'published' and _matches(item.get('audience'), user):
            return jsonify({'success': True, 'timetable': item, 'source': 'local'})

    return jsonify({
        'success': True,
        'timetable': None,
        'source': 'empty',
        'demo_hidden': _demo_timetable_deleted
    })


@timetable_bp.route('/api/timetable', methods=['POST'])
@cr_required
def publish_timetable():
    _ensure_table()
    user = get_current_user()
    data = request.get_json() or {}
    title = (data.get('title') or 'Class Timetable').strip()
    audience = (data.get('audience') or '').strip()
    entries = data.get('entries') or []
    source_image_name = data.get('source_image_name')
    status = data.get('status', 'published')
    if status not in ('draft', 'published'):
        status = 'published'
    if not audience or not isinstance(entries, list) or not entries:
        return jsonify({'error': 'Audience and timetable entries are required.'}), 400

    # A CR can publish to their own class/year/branch or campus-wide for the demo.
    try:
        cursor = db.execute_query("""
            INSERT INTO timetables (title, audience, entries_json, source_image_name, status, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (title, audience, json.dumps(entries), source_image_name, status, user['id']))
        if cursor and cursor.lastrowid:
            return jsonify({'success': True, 'id': cursor.lastrowid, 'message': 'Timetable published.'}), 201
    except Exception as e:
        logger.warning("Timetable DB publish failed: %s", e)

    record = {
        'id': 'local-' + str(len(_in_memory_timetables)+1), 'title': title, 'audience': audience,
        'entries': entries, 'source_image_name': source_image_name, 'status': status,
        'created_by': user['id']
    }
    _in_memory_timetables.insert(0, record)
    return jsonify({'success': True, 'id': record['id'], 'message': 'Timetable published in local mode.'}), 201


def _find_timetable(str_id):
    try:
        if str_id.isdigit():
            row = db.fetch_one("SELECT * FROM timetables WHERE id = %s", (int(str_id),))
            if row:
                return row, 'db'
    except Exception as e:
        logger.warning("Timetable DB lookup failed: %s", e)

    for item in _in_memory_timetables:
        if str(item.get('id')) == str_id:
            return item, 'memory'
    return None, None


def _can_delete_timetable(record, user):
    created_by = record.get('created_by')
    if created_by is not None and str(created_by) == str(user.get('id')):
        return True
    return _matches(record.get('audience'), user)


@timetable_bp.route('/api/timetable/<tt_id>', methods=['DELETE'])
@timetable_bp.route('/api/timetable', methods=['DELETE'])
@cr_required
def delete_timetable(tt_id=None):
    global _in_memory_timetables, _demo_timetable_deleted
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required', 'authenticated': False, 'message': 'Please sign in to perform this action.'}), 401

    if not tt_id:
        data = request.get_json(silent=True) or {}
        tt_id = request.args.get('id') or data.get('id')

    if not tt_id:
        return jsonify({'error': 'Timetable ID required', 'message': 'Timetable ID must be provided.'}), 400

    str_id = str(tt_id).strip()

    if str_id in ('demo', 'sample'):
        _demo_timetable_deleted = True
        _deleted_sample_ids.add(str_id)
        return jsonify({'success': True, 'message': 'Timetable deleted successfully.', 'id': str_id}), 200

    record, source_type = _find_timetable(str_id)
    if not record and str_id in _deleted_sample_ids:
        return jsonify({'error': 'Not found', 'message': 'This timetable has already been deleted.'}), 404
    if not record:
        return jsonify({'error': 'Not found', 'message': 'The timetable does not exist or has already been deleted.'}), 404

    if not _can_delete_timetable(record, user):
        return jsonify({
            'error': 'Unauthorized',
            'message': 'You are only authorized to delete timetables published for your class.'
        }), 403

    deleted_db = False
    try:
        if str_id.isdigit():
            del_cursor = db.execute_query("DELETE FROM timetables WHERE id = %s", (int(str_id),))
            if del_cursor and del_cursor.rowcount > 0:
                deleted_db = True
    except Exception as e:
        logger.error(f"DB Error deleting timetable {str_id}: {e}")
        return jsonify({
            'error': 'Database error',
            'message': 'Failed to delete timetable from database. Please try again.'
        }), 500

    _in_memory_timetables = [t for t in _in_memory_timetables if str(t.get('id')) != str_id]
    _deleted_sample_ids.add(str_id)

    return jsonify({
        'success': True,
        'message': 'Timetable deleted successfully.',
        'id': str_id,
        'deleted_from_db': deleted_db,
        'source': source_type
    }), 200
