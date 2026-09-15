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
