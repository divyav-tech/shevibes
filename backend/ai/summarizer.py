import json
import logging
from backend.ai.campus_ai import campus_ai
from backend.ai.prompts import CHAT_DIGEST_PROMPT, DAILY_BRIEFING_PROMPT

logger = logging.getLogger(__name__)

class Summarizer:
    def process_chat_digest(self, chat_text):
        """
        Parses raw class chat export/pasted text into a structured, reviewable AI digest.
        Identifies conflicts, noise, and actionable academic/event/deadline notices.
        """
        if not chat_text or not chat_text.strip():
            return self._empty_digest()

        if campus_ai.is_available():
            ai_result = self._digest_with_gemini(chat_text)
            if ai_result:
                return ai_result

        return self._fallback_chat_digest(chat_text)

    def generate_daily_briefing(self, user_profile, announcements, opportunities, events):
        """
        Generates a compact daily briefing summary for the dashboard.
        """
        if campus_ai.is_available():
            ai_result = self._briefing_with_gemini(user_profile, announcements, opportunities, events)
            if ai_result:
                return ai_result

        return self._fallback_daily_briefing(user_profile, announcements, opportunities, events)

    def _digest_with_gemini(self, chat_text):
        try:
            prompt = CHAT_DIGEST_PROMPT.format(chat_text=chat_text)
            result = campus_ai.generate_json(prompt)
            if result and isinstance(result, dict):
                return {
                    "summary": result.get("summary", "Chat analysis complete."),
                    "items": result.get("items", []),
                    "conflicts": result.get("conflicts", []),
                    "total_messages": result.get("total_messages", len(chat_text.splitlines())),
                    "useful_count": result.get("useful_count", len(result.get("items", [])))
                }
        except Exception as e:
            logger.error(f"Error in Gemini chat digest: {e}")
        return None

    def _briefing_with_gemini(self, user_profile, announcements, opportunities, events):
        try:
            context_data = {
                "profile": user_profile or {},
                "announcements": announcements[:5],
                "opportunities": opportunities[:5],
                "events": events[:5]
            }
            prompt = DAILY_BRIEFING_PROMPT.format(data=json.dumps(context_data))
            result = campus_ai.generate_json(prompt)
            if result and isinstance(result, dict):
                return {
                    "headline": result.get("headline", "2 things you should not miss today"),
                    "must_know": result.get("must_know", []),
                    "might_like": result.get("might_like", []),
                    "ai_generated": True
                }
        except Exception as e:
            logger.error(f"Error in Gemini daily briefing: {e}")
        return None

    def _empty_digest(self):
        return {
            "summary": "No chat content provided.",
            "items": [],
            "conflicts": [],
            "total_messages": 0,
            "useful_count": 0
        }

    def _fallback_chat_digest(self, chat_text):
        lines = [line.strip() for line in chat_text.strip().splitlines() if line.strip()]
        useful_items = []
        conflicts = []

        # Simple conflict check demo logic (e.g. monday vs wednesday)
        lower_full = chat_text.lower()
        if "monday" in lower_full and "wednesday" in lower_full:
            conflicts.append("⚠ CONFLICT DETECTED: Earlier messages mention Monday, but later messages mention Wednesday. Please verify before publishing.")
        if "tuesday" in lower_full and "thursday" in lower_full:
            conflicts.append("⚠ CONFLICT DETECTED: Conflicting submission dates detected (Tuesday vs Thursday).")

        for line in lines:
            line_lower = line.lower()
            # Ignore noise
            if any(n in line_lower for n in ["ok", "okay", "thanks", "tq", "good morning", "gm", "hh", "haha", "lol"]):
                continue

            category = "GENERAL"
            deadline = None

            if any(w in line_lower for w in ["exp", "experiment", "submission", "submit", "lab", "file", "bee", "practical"]):
                category = "ACADEMIC"
                if "tuesday" in line_lower:
                    deadline = "2026-09-15"
                useful_items.append({
                    "category": category,
                    "title": line[:40],
                    "content": line,
                    "status": "CONFIRMED" if "compulsory" in line_lower or "submit by" in line_lower else "SPECULATION",
                    "deadline": deadline,
                    "action_required": True if category == "ACADEMIC" else False
                })
            elif any(w in line_lower for w in ["workshop", "webinar", "web dev", "register", "registration", "hackathon"]):
                category = "OPPORTUNITY"
                useful_items.append({
                    "category": category,
                    "title": line[:40],
                    "content": line,
                    "status": "CONFIRMED" if "http" in line_lower or "register" in line_lower else "DISCUSSION",
                    "deadline": None,
                    "action_required": False
                })

        return {
            "summary": f"Analyzed {len(lines)} chat messages. Extracted {len(useful_items)} key actionable items.",
            "items": useful_items if useful_items else [{
                "category": "ACADEMIC",
                "title": "Chat Discussion Summary",
                "content": lines[0] if lines else "No clear actionable updates found.",
                "status": "UNVERIFIED",
                "deadline": None,
                "action_required": False
            }],
            "conflicts": conflicts,
            "total_messages": len(lines),
            "useful_count": len(useful_items)
        }

    def _fallback_daily_briefing(self, user_profile, announcements, opportunities, events):
        must_know = []
        might_like = []

        # Find urgent items or deadlines
        for a in (announcements or []):
            if a.get('priority') == 'high' or a.get('category') == 'deadline' or a.get('deadline'):
                must_know.append({
                    "title": a.get('title'),
                    "meta": f"Due {a.get('deadline') or 'soon'} · {a.get('category', 'compulsory').upper()}",
                    "level": "red" if a.get('priority') == 'high' else "yellow"
                })
                if len(must_know) >= 2:
                    break

        # Find recommendations based on user interests
        interests = (user_profile or {}).get('interests', [])
        for o in (opportunities or []):
            cat = (o.get('category') or '').lower()
            if any(i.lower() in cat or i.lower() in (o.get('title') or '').lower() for i in interests):
                might_like.append({
                    "title": o.get('title'),
                    "reason": "Matches your interests"
                })
                if len(might_like) >= 2:
                    break

        if not must_know and announcements:
            first = announcements[0]
            must_know.append({
                "title": first.get('title'),
                "meta": f"Recent update · {first.get('category', 'General')}",
                "level": "yellow"
            })

        if not might_like and opportunities:
            first_opp = opportunities[0]
            might_like.append({
                "title": first_opp.get('title'),
                "reason": "Popular campus opportunity"
            })

        return {
            "headline": f"{len(must_know)} things you should not miss today",
            "must_know": must_know,
            "might_like": might_like,
            "ai_generated": False
        }

summarizer = Summarizer()
