import json
import re
import logging
from datetime import date, datetime

from backend.ai.campus_ai import campus_ai
from backend.ai.prompts import CAMPUS_ASSISTANT_PROMPT

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Synonym / intent map  ← lightweight, no external libraries needed
# ---------------------------------------------------------------------------

# Maps a normalised user token → list of additional terms to search for.
# Token matching is bidirectional: if the user says any synonym, we also
# treat it as if they wrote all the others in the group.
_SYNONYM_GROUPS = [
    {"deadline", "due", "submission", "submit", "last date", "cutoff"},
    {"workshop", "workshops", "training", "bootcamp", "hands-on", "session", "webinar"},
    {"hackathon", "hackathons", "hack", "sprint", "build"},
    {"competition", "competitions", "contest", "challenge"},
    {"scholarship", "scholarships", "financial aid", "award", "grant"},
    {"event", "events", "function", "fest", "ceremony", "orientation", "celebration"},
    {"society", "societies", "club", "clubs", "chapter", "recruitment"},
    {"internship", "internships", "intern", "placement"},
    {"opportunity", "opportunities", "openings"},
    {"lecture", "lectures", "class", "classes", "timetable", "schedule", "period", "slot"},
    {"exam", "exams", "test", "tests", "quiz", "quizzes", "assessment", "viva"},
    {"assignment", "assignments", "practical", "experiment", "lab", "file", "record"},
    {"bee", "basic electrical engineering", "electrical"},
    {"bce", "basic civil engineering", "civil"},
    {"bme", "basic mechanical engineering", "mechanical"},
    {"cp", "c programming", "c lang"},
    {"dsa", "data structures", "algorithms"},
    {"os", "operating systems"},
    {"dbms", "database", "databases"},
    {"cn", "computer networks", "networks"},
    {"maths", "mathematics", "math"},
    {"physics", "phy"},
    {"chemistry", "chem"},
    {"evs", "environmental science"},
    {"ai", "artificial intelligence"},
    {"ml", "machine learning"},
    {"upcoming", "next", "coming", "soon"},
    {"today", "now"},
    {"tomorrow", "tmrw"},
    {"week", "weekly"},
]

# Build lookup: token → frozenset of all synonyms in that group
_SYNONYM_LOOKUP: dict[str, frozenset] = {}
for _group in _SYNONYM_GROUPS:
    _frozen = frozenset(_group)
    for _word in _group:
        _SYNONYM_LOOKUP[_word] = _frozen


def _expand_terms(tokens: list[str]) -> set[str]:
    """Given raw question tokens return an expanded set including synonyms."""
    expanded: set[str] = set(tokens)
    for tok in tokens:
        synonyms = _SYNONYM_LOOKUP.get(tok)
        if synonyms:
            expanded |= synonyms
    return expanded


# ---------------------------------------------------------------------------
# Stop-words (ignore in scoring so common words don't inflate scores)
# ---------------------------------------------------------------------------
_STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "can", "could", "i", "me", "my", "we", "our",
    "you", "your", "he", "she", "it", "they", "their", "this", "that",
    "these", "those", "of", "in", "on", "at", "to", "for", "with", "by",
    "from", "up", "about", "as", "into", "through", "what", "when", "where",
    "how", "why", "who", "which", "any", "all", "there", "here", "and",
    "or", "but", "so", "if", "not", "no", "yes", "get", "give", "tell",
    "show", "find", "list", "please",
}


def _tokenize(text: str) -> list[str]:
    """Lower-case, strip punctuation, split, drop stop-words."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return [t for t in text.split() if t and t not in _STOP_WORDS]


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _text_of_announcement(item: dict) -> str:
    parts = [
        item.get("title", ""),
        item.get("description", "") or item.get("summary", "") or item.get("content", ""),
        item.get("category", ""),
        item.get("subject", "") or "",
        item.get("action", "") or "",
        item.get("venue", "") or "",
        item.get("source", "") or "",
        item.get("class_name", "") or item.get("forClass", "") or "",
    ]
    tags = item.get("tags", [])
    if isinstance(tags, list):
        parts += tags
    elif isinstance(tags, str):
        parts.append(tags)
    return " ".join(str(p) for p in parts if p).lower()


def _text_of_opportunity(item: dict) -> str:
    parts = [
        item.get("title", ""),
        item.get("description", "") or "",
        item.get("category", ""),
        item.get("org", "") or "",
        item.get("eligibility", "") or "",
    ]
    tags = item.get("tags", [])
    if isinstance(tags, list):
        parts += tags
    return " ".join(str(p) for p in parts if p).lower()


def _text_of_event(item: dict) -> str:
    parts = [
        item.get("title", ""),
        item.get("description", "") or "",
        item.get("type", "") or item.get("category", "") or "",
        item.get("location", "") or item.get("venue", "") or "",
        item.get("event_date", "") or item.get("date", "") or "",
    ]
    return " ".join(str(p) for p in parts if p).lower()


def _text_of_timetable_entry(entry: dict) -> str:
    parts = [
        entry.get("subject", "") or entry.get("title", "") or "",
        entry.get("day", "") or "",
        entry.get("faculty", "") or "",
        entry.get("room", "") or "",
        entry.get("start", "") or "",
        entry.get("end", "") or "",
    ]
    return " ".join(str(p) for p in parts if p).lower()


def _score_item(expanded_terms: set[str], item_text: str) -> float:
    """
    Score = number of expanded question terms that appear anywhere in the
    item text, normalised by total terms (0.0–1.0).
    Slightly boosts title matches (worth 2 × vs body).
    """
    if not expanded_terms:
        return 0.0

    # Split item text for word-level matching
    item_words = set(item_text.split())

    hits = 0
    for term in expanded_terms:
        # Sub-string match (catches "workshop" inside "workshops", etc.)
        if term in item_text:
            # Title bonus: if term appears in just the first 60 chars (title area)
            hits += 2 if term in item_text[:60] else 1

    # Normalise to 0.0–1.0 range
    max_possible = len(expanded_terms) * 2
    return min(1.0, hits / max_possible) if max_possible else 0.0


def _is_deadline_question(tokens: list[str], expanded: set[str]) -> bool:
    deadline_signals = {"deadline", "due", "submission", "submit", "last date",
                        "cutoff", "when", "date", "upcoming"}
    return bool(deadline_signals & expanded) or bool(deadline_signals & set(tokens))


def _is_timetable_question(expanded: set[str]) -> bool:
    timetable_signals = {"timetable", "schedule", "class", "lecture",
                         "period", "slot", "today", "tomorrow", "when"}
    return bool(timetable_signals & expanded)


def _days_until(date_str: str) -> int | None:
    """Return number of days from today until date_str (YYYY-MM-DD). None on parse error."""
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
        return (d - date.today()).days
    except Exception:
        return None


def _format_deadline(deadline_str: str | None) -> str:
    if not deadline_str:
        return "No deadline specified"
    days = _days_until(deadline_str)
    if days is None:
        return str(deadline_str)
    if days < 0:
        return f"{deadline_str} (passed)"
    if days == 0:
        return f"{deadline_str} (**today!**)"
    if days == 1:
        return f"{deadline_str} (**tomorrow!**)"
    return f"{deadline_str} (in {days} day{'s' if days != 1 else ''})"


# ---------------------------------------------------------------------------
# Response formatters  — one per context type
# ---------------------------------------------------------------------------

def _format_announcement(item: dict) -> str:
    title = item.get("title", "Untitled")
    desc = item.get("description") or item.get("summary") or item.get("content") or ""
    deadline = _format_deadline(item.get("deadline"))
    category = (item.get("category") or "General").title()
    venue = item.get("venue") or ""
    subject = item.get("subject") or ""

    lines = [f"📌 **{title}**"]
    if subject:
        lines.append(f"Subject: {subject}")
    lines.append(f"Category: {category}")
    if desc:
        lines.append(f"Details: {desc[:200].rstrip()}")
    lines.append(f"Deadline: {deadline}")
    if venue:
        lines.append(f"Venue: {venue}")
    return "\n".join(lines)


def _format_opportunity(item: dict) -> str:
    title = item.get("title", "Untitled")
    desc = item.get("description") or ""
    deadline = _format_deadline(item.get("deadline"))
    category = (item.get("category") or "Opportunity").title()
    org = item.get("org") or item.get("organization") or ""
    eligibility = item.get("eligibility") or ""

    lines = [f"🚀 **{title}**"]
    lines.append(f"Type: {category}")
    if org:
        lines.append(f"Organiser: {org}")
    if desc:
        lines.append(f"About: {desc[:200].rstrip()}")
    if eligibility:
        lines.append(f"Eligibility: {eligibility}")
    lines.append(f"Deadline: {deadline}")
    return "\n".join(lines)


def _format_event(item: dict) -> str:
    title = item.get("title", "Untitled")
    desc = item.get("description") or ""
    event_date = item.get("event_date") or item.get("date") or ""
    location = item.get("location") or item.get("venue") or ""
    category = (item.get("category") or "Event").title()

    deadline_str = _format_deadline(event_date) if event_date else "Date TBD"
    lines = [f"📅 **{title}**"]
    lines.append(f"Type: {category}")
    lines.append(f"Date: {deadline_str}")
    if location:
        lines.append(f"Location: {location}")
    if desc:
        lines.append(f"About: {desc[:200].rstrip()}")
    return "\n".join(lines)


def _format_timetable_entries(entries: list[dict], day_filter: str | None = None) -> str:
    if not entries:
        return "No timetable entries available."
    if day_filter:
        entries = [e for e in entries if e.get("day", "").lower() == day_filter.lower()]
    if not entries:
        return f"No classes found for {day_filter.title()}."

    entries = sorted(entries, key=lambda e: (e.get("day", ""), e.get("start", "")))
    lines = []
    for e in entries[:10]:  # cap at 10 rows for readability
        day = e.get("day", "")
        start = e.get("start", "")
        end = e.get("end", "")
        subject = e.get("subject", "Unknown")
        room = e.get("room", "")
        parts = [f"• {day} {start}–{end}: **{subject}**"]
        if room:
            parts.append(f"(Room {room})")
        lines.append(" ".join(parts))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CampusAssistant
# ---------------------------------------------------------------------------

class CampusAssistant:
    def ask(self, question: str, user_profile: dict, context_data: dict) -> dict:
        """
        Main entry point. Tries Gemini first; falls through to the local
        contextual fallback if Gemini is unavailable or fails.
        """
        if not question or not question.strip():
            return {"answer": "Please ask a question about campus updates or deadlines."}

        # Pre-filter context so Gemini prompt is focused; also used by fallback
        filtered_context = self._retrieve_context(question, context_data)

        if campus_ai.is_available():
            ai_answer = self._ask_with_gemini(question, user_profile, filtered_context)
            if ai_answer:
                return ai_answer
            # Gemini call failed or returned empty → fall through gracefully

        return self._fallback_ask(question, user_profile, filtered_context)

    # ------------------------------------------------------------------
    # Context retrieval  (unchanged from original logic structure)
    # ------------------------------------------------------------------

    def _retrieve_context(self, question: str, context_data: dict) -> dict:
        q_lower = question.lower()
        announcements = context_data.get("announcements", [])
        opportunities = context_data.get("opportunities", [])
        events = context_data.get("events", [])
        timetable = context_data.get("timetable", {})
        chat_digest = context_data.get("chat_digest", [])

        tokens = _tokenize(q_lower)
        expanded = _expand_terms(tokens)

        def _filter(items, text_fn):
            matched = [i for i in items if any(t in text_fn(i) for t in expanded)]
            return matched[:5] if matched else items[:3]

        return {
            "announcements": _filter(announcements, _text_of_announcement),
            "opportunities": _filter(opportunities, _text_of_opportunity),
            "events": _filter(events, _text_of_event),
            "timetable": timetable,
            "chat_digest": chat_digest,
        }

    # ------------------------------------------------------------------
    # Gemini path  (identical to original — do NOT change)
    # ------------------------------------------------------------------

    def _ask_with_gemini(self, question: str, user_profile: dict, context: dict) -> dict | None:
        try:
            prompt = CAMPUS_ASSISTANT_PROMPT.format(
                question=question,
                profile=json.dumps(user_profile or {}),
                context=json.dumps(context),
            )
            response_text = campus_ai.generate_text(prompt)
            if response_text:
                sources = [
                    item.get("title")
                    for item in context.get("announcements", []) + context.get("opportunities", [])
                    if item.get("title")
                ]
                return {"answer": response_text, "sources": sources, "ai_generated": True}
        except Exception as e:
            logger.error(f"Error in Gemini assistant ask: {e}")
        return None

    # ------------------------------------------------------------------
    # Improved local fallback  ← this is what was replaced
    # ------------------------------------------------------------------

    def _fallback_ask(self, question: str, user_profile: dict, context: dict) -> dict:
        """
        Context-aware, scored local fallback.

        Strategy:
        1.  Detect broad intent (timetable, deadline, opportunity, event, general).
        2.  Score every item in each context bucket against the expanded question terms.
        3.  Pick the highest-scoring item across all buckets.
        4.  Format a type-specific response.
        5.  If nothing scores above the threshold, return a honest no-match message.
        """
        announcements: list[dict] = context.get("announcements", [])
        opportunities: list[dict] = context.get("opportunities", [])
        events: list[dict] = context.get("events", [])
        timetable: dict = context.get("timetable", {}) or {}

        tokens = _tokenize(question)
        expanded = _expand_terms(tokens)

        # ── 1. Timetable questions ───────────────────────────────────────
        if _is_timetable_question(expanded) and timetable:
            entries = timetable.get("entries", [])
            if entries:
                # Try to detect a day-filter ("today", "tomorrow", "monday", etc.)
                day_filter = self._detect_day_filter(tokens, expanded)
                formatted = _format_timetable_entries(entries, day_filter)
                audience = timetable.get("audience", "your class")
                header = f"📚 **Timetable for {audience}**\n"
                return {
                    "answer": header + formatted,
                    "sources": [timetable.get("title", "Class Timetable")],
                    "ai_generated": False,
                }

        # ── 2. Score everything ──────────────────────────────────────────
        THRESHOLD = 0.05  # minimum score to be considered a match

        scored: list[tuple[float, str, dict]] = []  # (score, type, item)

        for ann in announcements:
            s = _score_item(expanded, _text_of_announcement(ann))
            if s >= THRESHOLD:
                scored.append((s, "announcement", ann))

        for opp in opportunities:
            s = _score_item(expanded, _text_of_opportunity(opp))
            if s >= THRESHOLD:
                scored.append((s, "opportunity", opp))

        for evt in events:
            s = _score_item(expanded, _text_of_event(evt))
            if s >= THRESHOLD:
                scored.append((s, "event", evt))

        # ── 3. Return best match ─────────────────────────────────────────
        if scored:
            scored.sort(key=lambda x: x[0], reverse=True)
            best_score, best_type, best_item = scored[0]

            if best_type == "announcement":
                body = _format_announcement(best_item)
            elif best_type == "opportunity":
                body = _format_opportunity(best_item)
            else:
                body = _format_event(best_item)

            # If multiple results match well, show a compact list below the best
            runner_ups = [x for x in scored[1:4] if x[0] >= THRESHOLD * 3]
            extra = ""
            if runner_ups:
                extras = [f"• {x[2].get('title', 'Untitled')}" for x in runner_ups]
                extra = "\n\n**Also relevant:**\n" + "\n".join(extras)

            return {
                "answer": body + extra,
                "sources": [best_item.get("title")],
                "ai_generated": False,
            }

        # ── 4. Broad-category list  (e.g. "any opportunities?", "list events") ──
        # If the question is a pure category intent with nothing else specific,
        # return a short list of items from that bucket rather than no-match.
        OPP_SIGNALS = {"opportunity", "opportunities", "openings", "workshop", "workshops",
                       "hackathon", "hackathons", "competition", "competitions",
                       "internship", "internships", "scholarship", "scholarships"}
        EVT_SIGNALS = {"event", "events", "function", "fest", "ceremony"}

        if expanded & OPP_SIGNALS and opportunities:
            items_to_show = opportunities[:3]
            lines = [_format_opportunity(o) for o in items_to_show]
            return {
                "answer": "🚀 **Opportunities on your board:**\n\n" + "\n\n".join(lines),
                "sources": [o.get("title") for o in items_to_show],
                "ai_generated": False,
            }

        if expanded & EVT_SIGNALS and events:
            items_to_show = events[:3]
            lines = [_format_event(e) for e in items_to_show]
            return {
                "answer": "📅 **Events on your board:**\n\n" + "\n\n".join(lines),
                "sources": [e.get("title") for e in items_to_show],
                "ai_generated": False,
            }

        # ── 5. Deadline sweep  (if question was about deadlines but nothing scored) ─
        if _is_deadline_question(tokens, expanded):
            upcoming = []
            # Check announcements
            for ann in announcements:
                dl = ann.get("deadline")
                if dl:
                    days = _days_until(str(dl))
                    if days is not None and days >= 0:
                        upcoming.append((days, "announcement", ann))
            # Check opportunities too — they have deadlines
            for opp in opportunities:
                dl = opp.get("deadline")
                if dl:
                    days = _days_until(str(dl))
                    if days is not None and days >= 0:
                        upcoming.append((days, "opportunity", opp))
            # Check events
            for evt in events:
                dl = evt.get("event_date") or evt.get("date")
                if dl:
                    days = _days_until(str(dl))
                    if days is not None and days >= 0:
                        upcoming.append((days, "event", evt))

            if upcoming:
                upcoming.sort(key=lambda x: x[0])
                lines = []
                for days, kind, item in upcoming[:5]:
                    title = item.get("title", "Untitled")
                    dl = item.get("deadline") or item.get("event_date") or item.get("date")
                    lines.append(f"• **{title}** — {_format_deadline(dl)}")
                return {
                    "answer": "📋 **Upcoming deadlines on your board:**\n" + "\n".join(lines),
                    "sources": [item.get("title") for _, __, item in upcoming[:5]],
                    "ai_generated": False,
                }
            return {
                "answer": "No upcoming deadlines found in your current announcements.",
                "sources": [],
                "ai_generated": False,
            }

        # ── 5. No match ──────────────────────────────────────────────────
        tabs_hint = "Try browsing the **Announcements**, **Opportunities**, or **Calendar** tabs for more."
        return {
            "answer": (
                "I couldn't find anything on your board related to that question.\n\n"
                + tabs_hint
            ),
            "sources": [],
            "ai_generated": False,
        }

    # ------------------------------------------------------------------
    # Day-of-week detection helper
    # ------------------------------------------------------------------

    _WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    def _detect_day_filter(self, tokens: list[str], expanded: set[str]) -> str | None:
        """
        Returns a day-of-week string (e.g. 'Monday') if the question is asking
        about a specific day, otherwise None.
        """
        for tok in tokens:
            if tok in self._WEEKDAYS:
                return tok.title()
        if "today" in expanded or "today" in tokens:
            return datetime.now().strftime("%A")
        if "tomorrow" in expanded or "tomorrow" in tokens or "tmrw" in tokens:
            tomorrow = datetime.now().toordinal() + 1
            return datetime.fromordinal(tomorrow).strftime("%A")
        return None


assistant = CampusAssistant()
