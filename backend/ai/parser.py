import json
import re
from datetime import datetime
from backend.ai.campus_ai import campus_ai
from backend.ai.prompts import ANNOUNCEMENT_PARSE_PROMPT

class AnnouncementParser:
    def parse_announcement(self, text, current_date="2026-09-12"):
        """
        Parses raw announcement text using Gemini AI.
        Falls back to rule-based parser if AI is unavailable.
        """
        if not text or not text.strip():
            return self._empty_result()

        if campus_ai.is_available():
            ai_result = self._parse_with_gemini(text, current_date)
            if ai_result:
                return ai_result

        return self._fallback_parse(text, current_date)

    def _parse_with_gemini(self, text, current_date):
        prompt = ANNOUNCEMENT_PARSE_PROMPT.format(text=text, current_date=current_date)
        result = campus_ai.generate_json(prompt)
        if result and isinstance(result, dict):
            # Normalize fields to ensure required keys exist and missing fields are null
            return {
                "title": result.get("title") or self._extract_quick_title(text),
                "summary": result.get("summary") or text[:120],
                "subject": result.get("subject"),
                "action": result.get("action"),
                "deadline": result.get("deadline"),
                "time": result.get("time"),
                "venue": result.get("venue"),
                "category": result.get("category") or "general",
                "priority": (result.get("priority") or "medium").lower(),
                "class_name": result.get("class_name"),
                "add_to_calendar": bool(result.get("add_to_calendar") or result.get("deadline")),
                "tags": result.get("tags") if isinstance(result.get("tags"), list) else [],
                "confidence": float(result.get("confidence", 0.9))
            }
        return None

    def _extract_quick_title(self, text):
        words = text.strip().split()
        return " ".join(words[:7]) if len(words) > 7 else text.strip()

    def _empty_result(self):
        return {
            "title": "",
            "summary": "",
            "subject": None,
            "action": None,
            "deadline": None,
            "time": None,
            "venue": None,
            "category": "general",
            "priority": "medium",
            "class_name": None,
            "add_to_calendar": False,
            "tags": [],
            "confidence": 0.0
        }

    def _fallback_parse(self, text, current_date):
        """Rule-based fallback if AI API is unavailable"""
        text_lower = text.lower()
        category = "general"
        priority = "medium"
        add_to_calendar = False
        deadline = None
        subject = None

        # Detect category & priority
        if any(w in text_lower for w in ['submit', 'assignment', 'exam', 'test', 'practical', 'lab', 'experiment', 'bee']):
            category = "academic"
            priority = "high"
        elif any(w in text_lower for w in ['workshop', 'seminar', 'webinar', 'event', 'fest']):
            category = "event"
        elif any(w in text_lower for w in ['opportunity', 'internship', 'hackathon', 'competition']):
            category = "opportunity"

        if any(w in text_lower for w in ['compulsory', 'mandatory', 'urgent', 'strictly']):
            priority = "high"

        # Basic subject extraction
        subjects = {'bee': 'Basic Electrical Engineering', 'dsa': 'Data Structures', 'maths': 'Mathematics', 'physics': 'Physics'}
        for code, full_name in subjects.items():
            if code in text_lower:
                subject = full_name
                break

        # Date extraction fallback (e.g. 15th September)
        date_match = re.search(r'(\d{1,2})(?:st|nd|rd|th)?\s+(september|sept|october|oct|november|nov|december|dec|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug)', text_lower)
        if date_match:
            day = int(date_match.group(1))
            month_str = date_match.group(2)
            months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
            m_idx = 9 # default september
            for i, m in enumerate(months):
                if month_str.startswith(m):
                    m_idx = i + 1
                    break
            deadline = f"2026-{m_idx:02d}-{day:02d}"
            add_to_calendar = True

        return {
            "title": self._extract_quick_title(text),
            "summary": text[:140],
            "subject": subject,
            "action": "Submission" if "submit" in text_lower else "Review",
            "deadline": deadline,
            "time": None,
            "venue": None,
            "category": category,
            "priority": priority,
            "class_name": None,
            "add_to_calendar": add_to_calendar,
            "tags": [t for t in [category, subject] if t],
            "confidence": 0.6
        }

parser = AnnouncementParser()
