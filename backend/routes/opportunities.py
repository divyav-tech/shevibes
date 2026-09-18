from flask import Blueprint, request, jsonify
from backend.database import db
from backend.security import cr_required, get_current_user
import json
import logging

logger = logging.getLogger(__name__)
opportunities_bp = Blueprint('opportunities', __name__)

_in_memory_opportunities = []
_deleted_sample_ids = set()

DEMO_OPPORTUNITIES = [
    {'id': 'demo-o1', 'title': 'Hackathon 2026', 'description': '36-hour build sprint. Build, create, innovate — open theme.', 'category': 'hackathon', 'deadline': '2026-09-16', 'org': 'Campus Tech Council', 'eligibility': 'All years, teams of 2–4', 'tags': ['Hackathon', 'Tech', 'Teams']},
    {'id': 'demo-o2', 'title': 'Scholarship Application', 'description': 'Merit scholarship covering partial tuition for the coming semester.', 'category': 'scholarship', 'deadline': '2026-09-20', 'org': 'Dean of Students Office', 'eligibility': '1st & 2nd year, merit-based', 'tags': ['Scholarship', 'Financial Aid']},
    {'id': 'demo-o3', 'title': 'Web Development Workshop', 'description': 'Hands-on intro to HTML, CSS and JS — bring a laptop.', 'category': 'workshop', 'deadline': '2026-09-14', 'org': 'Tech Society', 'eligibility': 'Open to all', 'tags': ['Workshop', 'Web Dev']},
    {'id': 'demo-o4', 'title': 'Freshers Society Recruitment', 'description': 'Open recruitment across Drama, Music, Design and Debate societies.', 'category': 'societies', 'deadline': '2026-09-18', 'org': 'Multiple Societies', 'eligibility': '1st years only', 'tags': ['Society', 'Freshers']},
    {'id': 'demo-o5', 'title': 'Inter-College Coding Contest', 'description': 'Competitive programming contest, individual participation.', 'category': 'competition', 'deadline': '2026-09-22', 'org': 'ACM Student Chapter', 'eligibility': 'All years', 'tags': ['Competition', 'Coding']}
]


def _normalize_tags(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return [value] if value else []
    return []


def _find_opportunity(str_id):
    opportunity = None
    source_type = None

    try:
        if str_id.isdigit():
            opportunity = db.fetch_one("SELECT * FROM opportunities WHERE id = %s", (int(str_id),))
            if opportunity:
                source_type = 'db'
    except Exception as e:
        logger.error(f"DB Error fetching opportunity {str_id}: {e}")

    if not opportunity:
        for item in _in_memory_opportunities:
            if str(item.get('id')) == str_id:
                opportunity = item
                source_type = 'memory'
                break

    if not opportunity:
        for item in DEMO_OPPORTUNITIES:
            if str(item.get('id')) == str_id:
                opportunity = item
                source_type = 'demo'
                break

    return opportunity, source_type


def _can_delete_opportunity(opportunity, user):
    posted_by = opportunity.get('posted_by')
    user_id = user.get('id')
    if posted_by is None or posted_by == '':
        return True
    return str(posted_by) == str(user_id)


@opportunities_bp.route('/api/opportunities', methods=['GET'])
def get_opportunities():
    combined = []
    try:
        rows = db.fetch_all("SELECT * FROM opportunities ORDER BY created_at DESC")
        for r in rows or []:
            if str(r.get('id')) in _deleted_sample_ids:
                continue
            r['tags'] = _normalize_tags(r.get('tags'))
            combined.append(r)
    except Exception as e:
        logger.error(f"DB Error in get_opportunities: {e}")

    for item in _in_memory_opportunities:
        if str(item.get('id')) not in _deleted_sample_ids:
            combined.append(item)

    if not combined:
        combined = [o for o in DEMO_OPPORTUNITIES if str(o.get('id')) not in _deleted_sample_ids]

    unique = []
    seen = set()
    for item in combined:
        key = str(item.get('id'))
        if key in seen or key in _deleted_sample_ids:
            continue
        seen.add(key)
        unique.append(item)

    source = 'database' if unique and str(unique[0].get('id', '')).isdigit() else ('demo' if unique else 'empty')
    return jsonify({'opportunities': unique, 'source': source, 'success': True})


@opportunities_bp.route('/api/opportunities/<opp_id>', methods=['DELETE'])
@opportunities_bp.route('/api/opportunities', methods=['DELETE'])
@cr_required
def delete_opportunity(opp_id=None):
    global _in_memory_opportunities
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required', 'authenticated': False, 'message': 'Please sign in to perform this action.'}), 401

    if not opp_id:
        data = request.get_json(silent=True) or {}
        opp_id = request.args.get('id') or data.get('id')

    if not opp_id:
        return jsonify({'error': 'Opportunity ID required', 'message': 'Opportunity ID must be provided.'}), 400

    str_id = str(opp_id).strip()
    opportunity, source_type = _find_opportunity(str_id)

    if not opportunity and str_id in _deleted_sample_ids:
        return jsonify({'error': 'Not found', 'message': 'This opportunity has already been deleted.'}), 404

    if not opportunity:
        return jsonify({'error': 'Not found', 'message': 'The opportunity does not exist or has already been deleted.'}), 404

    if not _can_delete_opportunity(opportunity, user):
        return jsonify({
            'error': 'Unauthorized',
            'message': 'You are only authorized to delete opportunities you posted.'
        }), 403

    deleted_db = False
    try:
        if str_id.isdigit():
            int_id = int(str_id)
            db.execute_query("DELETE FROM saved_items WHERE item_type = 'opportunity' AND item_id = %s", (int_id,))
            del_cursor = db.execute_query("DELETE FROM opportunities WHERE id = %s", (int_id,))
            if del_cursor and del_cursor.rowcount > 0:
                deleted_db = True
    except Exception as e:
        logger.error(f"DB Error deleting opportunity {str_id}: {e}")
        return jsonify({
            'error': 'Database error',
            'message': 'Failed to delete opportunity from database. Please try again.'
        }), 500

    _in_memory_opportunities = [o for o in _in_memory_opportunities if str(o.get('id')) != str_id]
    _deleted_sample_ids.add(str_id)

    return jsonify({
        'success': True,
        'message': 'Opportunity deleted successfully.',
        'id': str_id,
        'deleted_from_db': deleted_db,
        'source': source_type
    }), 200
