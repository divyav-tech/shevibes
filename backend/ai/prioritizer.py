import json
import logging
from backend.ai.campus_ai import campus_ai
from backend.ai.prompts import PRIORITIZE_PROMPT

logger = logging.getLogger(__name__)

class Prioritizer:
    def prioritize_items(self, user_profile, items):
        """
        Calculates personal relevance scores and reasons for a list of items based on user profile.
        """
        if not items:
            return []

        if campus_ai.is_available():
            ai_result = self._prioritize_with_gemini(user_profile, items)
            if ai_result:
                return ai_result

        return self._fallback_prioritize(user_profile, items)

    def _prioritize_with_gemini(self, user_profile, items):
        try:
            prompt = PRIORITIZE_PROMPT.format(
                profile=json.dumps(user_profile or {}),
                items=json.dumps(items)
            )
            result = campus_ai.generate_json(prompt)
            if result and isinstance(result, list) and len(result) == len(items):
                return result
        except Exception as e:
            logger.error(f"Error in Gemini prioritize: {e}")
        return None

    def _fallback_prioritize(self, user_profile, items):
        profile = user_profile or {}
        interests = [i.lower() for i in profile.get('interests', [])]
        user_branch = profile.get('branch', '').lower()
        user_year = profile.get('year', '').lower()
        user_class = f"{user_year} · {user_branch}".strip(' ·').lower()

        results = []
        for item in items:
            category = (item.get('category') or '').lower()
            title = (item.get('title') or '').lower()
            description = (item.get('description') or item.get('content') or '').lower()
            for_class = (item.get('forClass') or item.get('class_name') or '').lower()
            item_priority = (item.get('priority') or 'medium').lower()

            score = 0.5
            reasons = []

            # Interest match check
            matched_interests = [i for i in interests if i in category or i in title or i in description]
            if matched_interests:
                score += 0.3
                reasons.append(f"Matches your interest in {matched_interests[0].title()}")

            # Class relevance check
            if for_class and (for_class == "all students" or user_branch in for_class or user_class in for_class):
                score += 0.2
                reasons.append("Relevant to your class section")

            # Urgency check
            if item_priority == "high" or item.get('deadline'):
                score += 0.15
                if item.get('deadline'):
                    reasons.append("Approaching deadline")

            score = min(1.0, round(score, 2))
            priority = "high" if score >= 0.8 else ("medium" if score >= 0.5 else "low")
            
            reason_str = " · ".join(reasons) if reasons else "General campus update relevant to your department."

            results.append({
                "id": item.get('id'),
                "relevance_score": score,
                "priority": priority,
                "reason": f"✦ Why you're seeing this: {reason_str}"
            })

        return results

prioritizer = Prioritizer()
