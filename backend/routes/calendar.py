from flask import Blueprint, request, jsonify

calendar_bp = Blueprint('calendar', __name__)

@calendar_bp.route('/api/calendar/events', methods=['GET'])
def get_events():
    return jsonify({'events': [], 'message': 'Calendar events endpoint active'})

@calendar_bp.route('/api/calendar/events', methods=['POST'])
def create_event():
    data = request.get_json() or {}
    return jsonify({'message': 'Event created successfully', 'event': data}), 201
