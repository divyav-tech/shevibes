import json
import logging
import re
from datetime import date, datetime

from backend.ai.campus_ai import campus_ai
from backend.ai.prompts import PRIORITIZE_PROMPT

logger = logging.getLogger(__name__)


def _parse_deadline_and_urgency(item, ref_date=None):
    """
    Parses structured deadline or natural-language deadline indicators in text.
    Returns:
        days_until: int (negative = past, 0 = today, 1 = tomorrow, 2..N = future) or None.
        urgency_score: float (-0.40 to +0.50).
        urgency_label: str (e.g. "Due today", "Due tomorrow", "Due in 2 days", "Deadline passed", etc.).
    """
    ref_date = ref_date or date.today()
    days_until = None

    structured_date_str = item.get('deadline') or item.get('event_date') or item.get('date')
    if structured_date_str:
        s = str(structured_date_str).strip()[:10]
        try:
            parsed_d = datetime.strptime(s, "%Y-%m-%d").date()
            days_until = (parsed_d - ref_date).days
        except Exception:
            pass

    # If structured date not found or ambiguous, inspect text fields for natural language
    title = str(item.get('title') or '')
    description = str(item.get('description') or item.get('summary') or item.get('content') or '')
    action = str(item.get('action') or '')
    subject = str(item.get('subject') or '')
    combined_text = f"{title} {description} {action} {subject}".lower()

    if days_until is None:
        if re.search(r'\b(due today|today|tonight|this evening)\b', combined_text):
            days_until = 0
        elif re.search(r'\b(due tomorrow|tomorrow|tmrw)\b', combined_text):
            days_until = 1
        elif re.search(r'\bin 2 days\b', combined_text):
            days_until = 2
        elif re.search(r'\b(in 3 days|within 3 days)\b', combined_text):
            days_until = 3
        else:
            m = re.search(r'\b(?:in|within)\s+(\d+)\s+days?\b', combined_text)
            if m:
                try:
                    days_until = int(m.group(1))
                except Exception:
                    pass

        if days_until is None:
            if re.search(r'\bthis friday\b', combined_text):
                cur_wd = ref_date.weekday()
                days_until = (4 - cur_wd) % 7
                if days_until == 0:
                    days_until = 7
            elif re.search(r'\b(in 2 weeks|within 2 weeks)\b', combined_text):
                days_until = 14
            elif re.search(r'\bnext week\b', combined_text):
                days_until = 7
            elif re.search(r'\bnext month\b', combined_text):
                days_until = 30
            elif re.search(r'\b(deadline passed|already passed|closed|ended|yesterday)\b', combined_text):
                days_until = -1

    if days_until is None:
        return None, 0.0, "No immediate deadline"

    if days_until < 0:
        return days_until, -0.40, "Deadline passed"
    elif days_until == 0:
        return days_until, 0.50, "Due today"
    elif days_until == 1:
        return days_until, 0.45, "Due tomorrow"
    elif 2 <= days_until <= 3:
        return days_until, 0.35, f"Due in {days_until} days"
    elif 4 <= days_until <= 7:
        return days_until, 0.20, "Deadline this week"
    elif 8 <= days_until <= 14:
        return days_until, 0.10, "Deadline in 2 weeks"
    elif 15 <= days_until <= 30:
        return days_until, 0.05, "Deadline next month"
    else:
        return days_until, 0.0, "Upcoming deadline"


def _compute_importance(item):
    """
    Evaluates intrinsic importance based on category, action, and keywords.
    Returns:
        importance_score: float (0.05 to 0.25)
        importance_label: str
    """
    category = (item.get('category') or '').lower()
    title = (item.get('title') or '').lower()
    desc = (item.get('description') or item.get('content') or '').lower()
    action = (item.get('action') or '').lower()
    combined = f"{category} {title} {desc} {action}"

    high_keywords = [
        "mandatory", "compulsory", "submission", "submit", "assignment",
        "practical", "quiz", "exam", "assessment", "lab file", "viva", "internal assessment"
    ]
    if category in ("academic", "important", "exam", "assignment") or any(k in combined for k in high_keywords):
        if any(k in combined for k in ("mandatory", "compulsory")):
            label = "Mandatory academic submission"
        elif any(k in combined for k in ("assignment", "practical", "submission", "submit", "lab file")):
            label = "Academic submission"
        else:
            label = "Academic notice"
        return 0.25, label

    med_categories = (
        "scholarship", "scholarships", "internship", "internships",
        "competition", "competitions", "hackathon", "hackathons", "workshop", "workshops", "tech"
    )
    if category in med_categories or any(k in combined for k in ("scholarship", "hackathon", "internship", "workshop", "contest")):
        if "scholarship" in combined:
            label = "Scholarship opportunity"
        elif "hackathon" in combined or "competition" in combined or "contest" in combined:
            label = "Competition opportunity"
        elif "workshop" in combined:
            label = "Workshop opportunity"
        else:
            label = "Campus opportunity"
        return 0.15, label

    return 0.05, "General campus update"


def _compute_relevance(user_profile, item):
    """
    Computes relevance to user profile based on branch, year, section, and interests.
    Returns:
        relevance_score: float (0.0 to 0.35)
        reasons: list of str
    """
    profile = user_profile or {}
    interests = [i.strip().lower() for i in profile.get('interests', []) if i]
    user_branch = (profile.get('branch') or '').strip().lower()
    user_year = (profile.get('year') or '').strip().lower()
    user_section = (profile.get('section') or '').strip().lower()

    score = 0.0
    reasons = []

    for_class = (item.get('forClass') or item.get('class_name') or '').lower()
    title = (item.get('title') or '').lower()
    desc = (item.get('description') or item.get('content') or '').lower()
    cat = (item.get('category') or '').lower()
    tags = [str(t).lower() for t in item.get('tags', [])] if isinstance(item.get('tags'), list) else []

    if for_class:
        if user_branch and user_section and user_branch in for_class and (
            f"section {user_section}" in for_class or f"sec {user_section}" in for_class or user_section in for_class
        ):
            score += 0.20
            reasons.append(f"Relevant to your {user_branch.upper()} Section {user_section.upper()}")
        elif user_branch and user_branch in for_class:
            score += 0.15
            reasons.append(f"Relevant to your branch ({user_branch.upper()})")
        elif for_class in ("all students", "college-wide"):
            score += 0.05

    matched = []
    for intr in interests:
        if intr in cat or intr in title or intr in desc or any(intr in t for t in tags):
            matched.append(intr)

    if matched:
        score += 0.15
        reasons.append(f"Matches your interest in {matched[0].title()}")

    return score, reasons


class Prioritizer:
    def prioritize_items(self, user_profile, items, ref_date=None):
        """
        Calculates personal relevance scores, priority (high/medium/low), and reasons
        for a list of items using Gemini when available, verified through a deterministic
        urgency layer, with full offline fallback.
        """
        if not items:
            return []

        ref_date = ref_date or date.today()

        if campus_ai.is_available():
            try:
                ai_result = self._prioritize_with_gemini(user_profile, items, ref_date)
                if ai_result:
                    return self._apply_urgency_layer(items, ai_result, user_profile, ref_date)
            except Exception as e:
                logger.error(f"Error in Gemini prioritisation: {e}")

        return self._fallback_prioritize(user_profile, items, ref_date)

    def _prioritize_with_gemini(self, user_profile, items, ref_date=None):
        try:
            ref_date = ref_date or date.today()
            current_date_str = ref_date.isoformat()
            prompt = PRIORITIZE_PROMPT.format(
                current_date=current_date_str,
                profile=json.dumps(user_profile or {}),
                items=json.dumps(items)
            )
            result = campus_ai.generate_json(prompt)
            if result and isinstance(result, list) and len(result) == len(items):
                return result
        except Exception as e:
            logger.error(f"Error in Gemini prioritize: {e}")
        return None

    def _apply_urgency_layer(self, items, gemini_results, user_profile, ref_date=None):
        """
        Deterministic Urgency Layer:
        Applies hard time and importance boundaries over Gemini's output to ensure:
        1. Imminent academic/submission deadlines (today/tomorrow) are never marked low.
        2. Expired/past deadlines are demoted and never marked high.
        3. Far-future/no-deadline optional workshops cannot be marked high merely due to user interest.
        """
        ref_date = ref_date or date.today()
        item_map = {str(item.get('id')): item for item in items}
        final_results = []

        for res in gemini_results:
            item_id = str(res.get('id'))
            raw_item = item_map.get(item_id, {})
            days_until, urgency_score, urgency_label = _parse_deadline_and_urgency(raw_item, ref_date)
            importance_score, importance_label = _compute_importance(raw_item)
            relevance_score, relevance_reasons = _compute_relevance(user_profile, raw_item)

            priority = str(res.get('priority') or 'medium').lower()
            if priority not in ('high', 'medium', 'low'):
                priority = 'medium'

            score = res.get('relevance_score', 0.5)
            try:
                score = float(score)
            except Exception:
                score = 0.5

            reason = str(res.get('reason') or '')

            # Override Rule 1: Past deadline -> CANNOT be high
            if days_until is not None and days_until < 0:
                if priority == 'high':
                    priority = 'low'
                    reason = "✦ Deadline passed"
            # Override Rule 2: Imminent deadline (today / tomorrow) with academic or medium+ importance -> MUST be high
            elif days_until == 0 or (days_until == 1 and importance_score >= 0.15):
                if priority != 'high':
                    priority = 'high'
                    reason = f"✦ {urgency_label} · {importance_label}"
            # Override Rule 3: Far future (>= 21 days) or No Deadline for optional/workshop/general items -> CANNOT be high
            elif (days_until is not None and days_until >= 21) or days_until is None:
                if importance_score <= 0.15 and priority == 'high':
                    priority = 'medium'
                    if days_until is not None:
                        reason = f"✦ {urgency_label} · Optional campus activity"
                    else:
                        reason = "✦ No immediate deadline · Relevant to your interests"

            clean_reason = reason if reason.startswith("✦") else f"✦ {reason}"

            final_results.append({
                "id": res.get('id'),
                "relevance_score": score,
                "priority": priority,
                "reason": clean_reason
            })

        return final_results

    def _fallback_prioritize(self, user_profile, items, ref_date=None):
        """
        Deterministic local fallback prioritisation.
        Combines Urgency, Importance, and Student Relevance.
        """
        ref_date = ref_date or date.today()
        results = []

        for item in items:
            days_until, urgency_score, urgency_label = _parse_deadline_and_urgency(item, ref_date)
            importance_score, importance_label = _compute_importance(item)
            relevance_score, relevance_reasons = _compute_relevance(user_profile, item)

            base_score = 0.20
            total_score = base_score + urgency_score + importance_score + relevance_score
            total_score = min(1.0, max(0.0, round(total_score, 2)))

            # Priority determination:
            # 1. Past deadline -> always low
            if days_until is not None and days_until < 0:
                priority = "low"
                primary_reason = "Deadline passed"
            # 2. Imminent deadline (today or tomorrow)
            elif days_until in (0, 1):
                if importance_score >= 0.15 or days_until == 0:
                    priority = "high"
                else:
                    priority = "high" if total_score >= 0.65 else "medium"
                primary_reason = urgency_label
            # 3. Far future (>= 21 days) or no deadline for optional items
            elif (days_until is not None and days_until >= 21) or days_until is None:
                if importance_score <= 0.15:
                    priority = "medium" if total_score >= 0.40 else "low"
                else:
                    priority = "high" if total_score >= 0.70 else ("medium" if total_score >= 0.40 else "low")
                primary_reason = urgency_label if days_until is not None else (
                    relevance_reasons[0] if relevance_reasons else importance_label
                )
            # 4. Standard score-based threshold for mid-range deadlines (2 to 20 days)
            else:
                if total_score >= 0.70:
                    priority = "high"
                elif total_score >= 0.40:
                    priority = "medium"
                else:
                    priority = "low"
                primary_reason = urgency_label

            parts = [primary_reason]
            if days_until is not None and days_until >= 0:
                if relevance_reasons:
                    parts.append(relevance_reasons[0])
                elif importance_label not in primary_reason:
                    parts.append(importance_label)
            elif days_until is None:
                if relevance_reasons and relevance_reasons[0] not in primary_reason:
                    parts.append(relevance_reasons[0])
                elif "General" not in importance_label and importance_label not in primary_reason:
                    parts.append(importance_label)

            reason_text = " · ".join(parts)

            results.append({
                "id": item.get('id'),
                "relevance_score": total_score,
                "priority": priority,
                "reason": f"✦ {reason_text}"
            })

        return results


prioritizer = Prioritizer()
