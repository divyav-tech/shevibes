import json as _json
import logging as _logging

from flask import Blueprint, request, jsonify
from backend.ai import parser, prioritizer, summarizer, assistant, campus_ai
from backend.security import login_required, cr_required, get_current_user
from backend.routes.auth import format_user_profile
from backend.database import db

_logger = _logging.getLogger(__name__)

ai_bp = Blueprint('ai', __name__)


def _get_timetable_for_user(user: dict) -> dict:
    """
    Fetch the most-recently-updated published timetable that matches this
    user's year / branch / section.  Uses only the existing DB connection
    and the same audience-matching logic already present in timetable.py.
    Returns an empty dict if nothing is found or DB is unavailable.
    Does NOT touch any auth / user-management code.
    """
    if not user:
        return {}

    year = user.get('year', '')
    branch = user.get('branch', '')
    section = user.get('section', '')

    def _matches(audience: str) -> bool:
        if not audience or audience in ('All Students', 'College-wide'):
            return True
        return audience in (
            f"{year} · {branch} · Section {section}",
            f"{year} · {branch} · All Sections",
            f"{branch} · All Years",
            f"{year} · All Branches",
        )

    try:
        rows = db.fetch_all(
            "SELECT * FROM timetables WHERE status='published' ORDER BY updated_at DESC"
        )
        for row in (rows or []):
            if _matches(row.get('audience', '')):
                try:
                    entries = _json.loads(row.get('entries_json') or '[]')
                except Exception:
                    entries = []
                return {
                    'id': row.get('id'),
                    'title': row.get('title', 'Class Timetable'),
                    'audience': row.get('audience', ''),
                    'entries': entries,
                    'updated_at': str(row.get('updated_at') or ''),
                }
    except Exception as exc:
        _logger.debug("Timetable DB read in ask route skipped: %s", exc)

    # In-memory fallback: import lazily to avoid circular imports
    try:
        from backend.routes.timetable import _in_memory_timetables
        for item in _in_memory_timetables:
            if item.get('status') == 'published' and _matches(item.get('audience', '')):
                return item
    except Exception:
        pass

    return {}

@ai_bp.route('/api/ai/status', methods=['GET'])
def ai_status():
    return jsonify({
        "status": "ok",
        "ai_available": campus_ai.is_available()
    })

@ai_bp.route('/api/ai/parse-announcement', methods=['POST'])
@cr_required
def parse_announcement():
    data = request.get_json() or {}
    text = data.get('text', '')
    current_date = data.get('current_date', '2026-09-12')
    result = parser.parse_announcement(text, current_date)
    ai_used = result.pop('_ai_used', campus_ai.is_available())
    return jsonify({
        "success": True,
        "parsed": result,
        "ai_used": ai_used
    })

@ai_bp.route('/api/ai/prioritize', methods=['POST'])
@login_required
def prioritize():
    user = get_current_user()
    profile = format_user_profile(user) if user else {}
    data = request.get_json() or {}
    # If client passed interests/profile overrides, merge safely with authoritative user
    client_profile = data.get('profile', {})
    if isinstance(client_profile, dict) and client_profile.get('interests'):
        profile['interests'] = client_profile['interests']

    items = data.get('items', [])
    results = prioritizer.prioritize_items(profile, items)
    return jsonify({
        "success": True,
        "priorities": results,
        "ai_used": campus_ai.is_available()
    })

@ai_bp.route('/api/ai/chat-digest', methods=['POST'])
@login_required
def chat_digest():
    data = request.get_json() or {}
    chat_text = data.get('chat_text', '')
    result = summarizer.process_chat_digest(chat_text)
    return jsonify({
        "success": True,
        "digest": result,
        "ai_used": campus_ai.is_available()
    })

@ai_bp.route('/api/ai/briefing', methods=['POST'])
@login_required
def briefing():
    user = get_current_user()
    profile = format_user_profile(user) if user else {}
    data = request.get_json() or {}
    announcements = data.get('announcements', [])
    opportunities = data.get('opportunities', [])
    events = data.get('events', [])
    result = summarizer.generate_daily_briefing(profile, announcements, opportunities, events)
    return jsonify({
        "success": True,
        "briefing": result,
        "ai_used": campus_ai.is_available()
    })

@ai_bp.route('/api/ai/ask', methods=['POST'])
@login_required
def ask():
    user = get_current_user()
    profile = format_user_profile(user) if user else {}
    data = request.get_json() or {}
    question = data.get('question', '')
    context = dict(data.get('context', {}))  # copy so we don't mutate caller's dict

    # Enrich context with the user's published timetable, if available.
    # This allows fallback (and Gemini) to answer schedule questions.
    # No auth changes — we reuse the user already fetched above.
    if not context.get('timetable'):
        context['timetable'] = _get_timetable_for_user(user)
    result = assistant.ask(question, profile, context)
    return jsonify({
        "success": True,
        "result": result,
        "ai_used": campus_ai.is_available()
    })


@ai_bp.route('/api/ai/parse-timetable', methods=['POST'])
@cr_required
def parse_timetable():
    image = request.files.get('image')
    if not image:
        return jsonify({'success': False, 'error': 'Please upload a timetable image.'}), 400
    raw = image.read()
    if not raw:
        return jsonify({'success': False, 'error': 'The uploaded image is empty.'}), 400
    mime = image.mimetype or 'image/png'
    if not mime.startswith('image/'):
        return jsonify({'success': False, 'error': 'Please upload an image file.'}), 400
    if len(raw) > 8 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'Please keep the timetable image under 8 MB.'}), 400
    prompt = """
You are extracting a college timetable from a timetable image. Return ONLY valid JSON with this exact shape:
{"entries":[{"day":"Monday","start":"09:00","end":"10:00","subject":"BEE","faculty":"","room":""}]}
Rules: identify every class cell you can read; use Monday-Friday when shown; preserve times; do not invent faculty/room; if a value is unreadable use an empty string; keep subjects concise; sort entries by weekday then start time. This will be reviewed and edited by a Class Representative before publishing.
"""
    result = campus_ai.generate_json_with_image(prompt, raw, mime_type=mime)
    if result and isinstance(result.get('entries'), list):
        return jsonify({'success': True, 'parsed': result, 'ai_used': True})
    # Graceful demo fallback: the frontend supplies a polished sample table if AI is unavailable.
    return jsonify({'success': True, 'parsed': {'entries': []}, 'ai_used': False, 'message': 'AI is unavailable right now. You can enter the timetable manually.'})
