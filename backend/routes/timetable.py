from flask import Blueprint, request, jsonify
from backend.database import db
from backend.security import login_required, cr_required, get_current_user
import json
import logging

logger = logging.getLogger(__name__)
timetable_bp = Blueprint('timetable', __name__)

_in_memory_timetables = []


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
            if _matches(row.get('audience'), user):
                try:
                    entries = json.loads(row.get('entries_json') or '[]')
                except Exception:
                    entries = []
                return jsonify({'success': True, 'timetable': {
                    'id': row.get('id'), 'title': row.get('title'), 'audience': row.get('audience'),
                    'entries': entries, 'status': row.get('status'), 'updated_at': str(row.get('updated_at') or '')
                }, 'source': 'database'})
    except Exception as e:
        logger.warning("Timetable DB read failed: %s", e)

    for item in _in_memory_timetables:
        if item.get('status') == 'published' and _matches(item.get('audience'), user):
            return jsonify({'success': True, 'timetable': item, 'source': 'local'})

    return jsonify({'success': True, 'timetable': None, 'source': 'empty'})


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
