from flask import Blueprint, request, jsonify
from backend.database import db
import logging

logger = logging.getLogger(__name__)
opportunities_bp = Blueprint('opportunities', __name__)

@opportunities_bp.route('/api/opportunities', methods=['GET'])
def get_opportunities():
    try:
        rows = db.fetch_all("SELECT * FROM opportunities ORDER BY created_at DESC")
        if rows:
            return jsonify({'opportunities': rows, 'source': 'database', 'success': True})
    except Exception as e:
        logger.error(f"DB Error in get_opportunities: {e}")
    return jsonify({'opportunities': [
        {'id': 'demo-o1', 'title': 'Hackathon 2026', 'description': '36-hour build sprint. Build, create, innovate — open theme.', 'category': 'hackathon', 'deadline': '2026-09-16', 'org': 'Campus Tech Council', 'eligibility': 'All years, teams of 2–4', 'tags': ['Hackathon', 'Tech', 'Teams']},
        {'id': 'demo-o2', 'title': 'Scholarship Application', 'description': 'Merit scholarship covering partial tuition for the coming semester.', 'category': 'scholarship', 'deadline': '2026-09-20', 'org': 'Dean of Students Office', 'eligibility': '1st & 2nd year, merit-based', 'tags': ['Scholarship', 'Financial Aid']},
        {'id': 'demo-o3', 'title': 'Web Development Workshop', 'description': 'Hands-on intro to HTML, CSS and JS — bring a laptop.', 'category': 'workshop', 'deadline': '2026-09-14', 'org': 'Tech Society', 'eligibility': 'Open to all', 'tags': ['Workshop', 'Web Dev']},
        {'id': 'demo-o4', 'title': 'Freshers Society Recruitment', 'description': 'Open recruitment across Drama, Music, Design and Debate societies.', 'category': 'societies', 'deadline': '2026-09-18', 'org': 'Multiple Societies', 'eligibility': '1st years only', 'tags': ['Society', 'Freshers']},
        {'id': 'demo-o5', 'title': 'Inter-College Coding Contest', 'description': 'Competitive programming contest, individual participation.', 'category': 'competition', 'deadline': '2026-09-22', 'org': 'ACM Student Chapter', 'eligibility': 'All years', 'tags': ['Competition', 'Coding']}
    ], 'source': 'demo', 'success': True})
