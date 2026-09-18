from flask import Blueprint, request, jsonify
from backend.ai import parser, prioritizer, summarizer, assistant, campus_ai
from backend.security import login_required, cr_required, get_current_user
from backend.routes.auth import format_user_profile

ai_bp = Blueprint('ai', __name__)

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
    context = data.get('context', {})
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
You are a timetable OCR specialist. Read the uploaded college timetable image carefully and convert the visible schedule into individual class rows.

Return ONLY JSON in this exact shape:
{"entries":[{"day":"Monday","start":"09:00","end":"10:00","subject":"BEE","faculty":"","room":""}]}

IMPORTANT EXTRACTION RULES:
1. First identify the table's DAY columns and TIME rows/slots.
2. Read every non-empty class cell, including cells that span multiple time slots.
3. If a class spans two adjacent slots, combine them into one row with the full start/end time.
4. If the timetable uses a time range such as 9-10 or 09:00-10:00, normalize to HH:MM 24-hour format.
5. Map each class to the correct weekday from the column header.
6. Preserve subject names exactly as readable; do not invent missing text.
7. If faculty or room is not present, use an empty string.
8. Ignore lunch/break/free-period cells unless they clearly contain a real class.
9. Do not invent classes. If a cell is genuinely unreadable, skip it rather than guessing.
10. Sort by Monday through Saturday, then by start time.
11. Return at least one row only when a real class is visible.

This output is a draft for a Class Representative, so accuracy is more important than filling every field.
"""
    schema = {
        "type": "OBJECT",
        "properties": {
            "entries": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "day": {"type": "STRING"},
                        "start": {"type": "STRING"},
                        "end": {"type": "STRING"},
                        "subject": {"type": "STRING"},
                        "faculty": {"type": "STRING"},
                        "room": {"type": "STRING"}
                    },
                    "required": ["day", "start", "end", "subject", "faculty", "room"]
                }
            }
        },
        "required": ["entries"]
    }
    result = campus_ai.generate_json_with_image(prompt, raw, mime_type=mime, schema=schema)
    if result and isinstance(result.get('entries'), list) and result.get('entries'):
        # Normalize and discard malformed rows before showing the CR the draft.
        clean = []
        valid_days = {'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'}
        for row in result.get('entries', []):
            if not isinstance(row, dict):
                continue
            day = str(row.get('day') or '').strip().title()
            subject = str(row.get('subject') or '').strip()
            start = str(row.get('start') or '').strip()
            end = str(row.get('end') or '').strip()
            if day not in valid_days or not subject or not start or not end:
                continue
            clean.append({
                'day': day, 'start': start[:5], 'end': end[:5],
                'subject': subject, 'faculty': str(row.get('faculty') or '').strip(),
                'room': str(row.get('room') or '').strip()
            })
        clean.sort(key=lambda x: (['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].index(x['day']), x['start']))
        if clean:
            return jsonify({'success': True, 'parsed': {'entries': clean}, 'ai_used': True})
    return jsonify({
        'success': False,
        'parsed': {'entries': []},
        'ai_used': False,
        'error': 'I could not reliably read this timetable. Try a clear, straight-on image where the day and time headers are visible.'
    }), 422
