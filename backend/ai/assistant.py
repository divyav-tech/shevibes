import json
import logging
from backend.ai.campus_ai import campus_ai
from backend.ai.prompts import CAMPUS_ASSISTANT_PROMPT

logger = logging.getLogger(__name__)

class CampusAssistant:
    def ask(self, question, user_profile, context_data):
        """
        Answers campus questions strictly using retrieved application context.
        """
        if not question or not question.strip():
            return {"answer": "Please ask a question about campus updates or deadlines."}

        # Filter relevant context using simple keyword matching
        filtered_context = self._retrieve_context(question, context_data)

        if campus_ai.is_available():
            ai_answer = self._ask_with_gemini(question, user_profile, filtered_context)
            if ai_answer:
                return ai_answer

        return self._fallback_ask(question, user_profile, filtered_context)

    def _retrieve_context(self, question, context_data):
        q_lower = question.lower()
        announcements = context_data.get('announcements', [])
        opportunities = context_data.get('opportunities', [])
        events = context_data.get('events', [])
        chat_digest = context_data.get('chat_digest', [])

        relevant_announcements = []
        for a in announcements:
            text = f"{a.get('title','')} {a.get('description','')} {a.get('category','')} {a.get('subject','')}".lower()
            if any(term in text for term in q_lower.split()) or "submit" in q_lower or "deadline" in q_lower or "all" in q_lower:
                relevant_announcements.append(a)

        relevant_opps = []
        for o in opportunities:
            text = f"{o.get('title','')} {o.get('description','')} {o.get('category','')} {o.get('org','')}".lower()
            if any(term in text for term in q_lower.split()) or "opportunity" in q_lower or "web" in q_lower:
                relevant_opps.append(o)

        relevant_events = []
        for e in events:
            text = f"{e.get('title','')} {e.get('type','')} {e.get('date','')}".lower()
            if any(term in text for term in q_lower.split()) or "calendar" in q_lower or "event" in q_lower or "when" in q_lower:
                relevant_events.append(e)

        return {
            "announcements": relevant_announcements[:5] if relevant_announcements else announcements[:3],
            "opportunities": relevant_opps[:5] if relevant_opps else opportunities[:3],
            "events": relevant_events[:5] if relevant_events else events[:3],
            "chat_digest": chat_digest
        }

    def _ask_with_gemini(self, question, user_profile, context):
        try:
            prompt = CAMPUS_ASSISTANT_PROMPT.format(
                question=question,
                profile=json.dumps(user_profile or {}),
                context=json.dumps(context)
            )
            response_text = campus_ai.generate_text(prompt)
            if response_text:
                return {
                    "answer": response_text,
                    "sources": [item.get('title') for item in context.get('announcements', []) + context.get('opportunities', []) if item.get('title')],
                    "ai_generated": True
                }
        except Exception as e:
            logger.error(f"Error in Gemini assistant ask: {e}")
        return None

    def _fallback_ask(self, question, user_profile, context):
        q_lower = question.lower()
        announcements = context.get('announcements', [])
        opportunities = context.get('opportunities', [])
        events = context.get('events', [])

        if "submit" in q_lower or "deadline" in q_lower:
            deadlines = [a for a in announcements if a.get('deadline') or a.get('category') == 'academic' or a.get('category') == 'deadline']
            if deadlines:
                item = deadlines[0]
                return {
                    "answer": f"📌 Upcoming Submission: **{item.get('title')}**\nDeadline: {item.get('deadline', 'Soon')}.\nDescription: {item.get('description', '')}",
                    "sources": [item.get('title')],
                    "ai_generated": False
                }
            return {"answer": "No urgent submissions or deadlines found in your announcements.", "sources": [], "ai_generated": False}

        if "web" in q_lower or "opportunity" in q_lower or "workshop" in q_lower:
            opps = [o for o in opportunities if "web" in o.get('title','').lower() or "workshop" in o.get('title','').lower() or "tech" in o.get('category','').lower()]
            if opps:
                item = opps[0]
                return {
                    "answer": f"🚀 Relevant Opportunity: **{item.get('title')}**\nCategory: {item.get('category', 'Tech')}.\nDescription: {item.get('description', '')}",
                    "sources": [item.get('title')],
                    "ai_generated": False
                }

        if "bee" in q_lower:
            bee_items = [a for a in announcements if "bee" in a.get('title','').lower() or "bee" in a.get('description','').lower()]
            if bee_items:
                item = bee_items[0]
                return {
                    "answer": f"📌 BEE Update: **{item.get('title')}**\nDetails: {item.get('description')}",
                    "sources": [item.get('title')],
                    "ai_generated": False
                }

        # Generic responsive fallback based on available announcements
        if announcements:
            top = announcements[0]
            return {
                "answer": f"Based on your board, here is the latest update: **{top.get('title')}** ({top.get('category', 'General')}).\nDeadline: {top.get('deadline', 'Not specified')}.",
                "sources": [top.get('title')],
                "ai_generated": False
            }

        return {
            "answer": "I couldn't find specific information matching your question. Check your announcements tab for full updates.",
            "sources": [],
            "ai_generated": False
        }

assistant = CampusAssistant()
