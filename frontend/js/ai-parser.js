/* =========================================================
   CAMPUS BOARD — ai-parser.js

   This is Campus Board's "AI" for the CR announcement flow.
   There is no server in this project (it's a static frontend
   prototype), so this is implemented as a self-contained,
   rule-based natural-language parser that runs entirely in the
   browser — no API key, no network call. It is written to the
   exact same data contract a real backend AI service would
   return (see CORE PRODUCT IDEA in the project brief), so the
   UI, the review/edit flow, and the data pipeline all behave as
   if a real model produced the JSON. If/when a real Flask +
   LLM backend exists, this file is the only thing that needs
   to be swapped for a fetch() to POST /api/ai/parse-announcement.

   Output shape (fields are null when not present in the text —
   the parser never invents values):
   {
     title, summary, subject, action, deadline (ISO date|null),
     time (string|null), venue (string|null),
     priority: "high"|"medium"|"low",
     category: "Academic"|"Class"|"Event"|"Competition"|
               "Workshop"|"Society"|"General"|"Important",
     add_to_calendar: boolean,
     tags: string[],
     confidence: number (0–1)
   }
   ========================================================= */

(function (global) {
  "use strict";

  var MONTHS = ["january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"];

  var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  var SUBJECT_DICTIONARY = {
    "bee": "Basic Electrical Engineering",
    "bce": "Basic Civil Engineering",
    "bme": "Basic Mechanical Engineering",
    "cp": "C Programming",
    "c programming": "C Programming",
    "oop": "Object Oriented Programming",
    "dsa": "Data Structures & Algorithms",
    "ds": "Data Structures",
    "os": "Operating Systems",
    "dbms": "Database Management Systems",
    "cn": "Computer Networks",
    "evs": "Environmental Science",
    "maths": "Engineering Mathematics",
    "mathematics": "Engineering Mathematics",
    "physics": "Engineering Physics",
    "chemistry": "Engineering Chemistry",
    "toc": "Theory of Computation",
    "coa": "Computer Organization & Architecture",
    "se": "Software Engineering",
    "ai": "Artificial Intelligence",
    "ml": "Machine Learning"
  };

  var CATEGORY_KEYWORDS = [
    { category: "Academic", words: ["practical", "experiment", "assignment", "file", "submission", "submit", "quiz", "exam", "lab", "record", "viva", "internal assessment", "class test", "syllabus"] },
    { category: "Workshop", words: ["workshop", "bootcamp", "training session"] },
    { category: "Competition", words: ["competition", "contest", "hackathon", "register for", "registration"] },
    { category: "Society", words: ["society", "recruitment", "club", "chapter"] },
    { category: "Event", words: ["orientation", "fest", "freshers", "seminar", "guest lecture", "celebration", "ceremony"] }
  ];

  var URGENCY_WORDS = ["urgent", "compulsory", "mandatory", "important", "last date", "final submission", "immediately", "asap", "don't miss", "strictly"];

  /* ---------------- date helpers ---------------- */

  function pad2(n) { return String(n).padStart(2, "0"); }
  function toIso(y, m, d) { return y + "-" + pad2(m + 1) + "-" + pad2(d); }

  function findExplicitDate(text, refDate) {
    // "15 September", "15th September", "September 15", "15/09", "15-09-2026"
    var lower = text.toLowerCase();

    // "15 September" or "15th September" (+ optional year)
    var m = lower.match(/\b(\d{1,2})(st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/);
    if (m) {
      var day1 = parseInt(m[1], 10);
      var mon1 = MONTHS.indexOf(m[3]);
      var year1 = m[4] ? parseInt(m[4], 10) : inferYear(mon1, day1, refDate);
      return toIso(year1, mon1, day1);
    }

    // "September 15" (+ optional year)
    m = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
    if (m) {
      var mon2 = MONTHS.indexOf(m[1]);
      var day2 = parseInt(m[2], 10);
      var year2 = m[4] ? parseInt(m[4], 10) : inferYear(mon2, day2, refDate);
      return toIso(year2, mon2, day2);
    }

    // "15/09" or "15/09/2026" or "15-09-2026"
    m = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (m) {
      var day3 = parseInt(m[1], 10);
      var mon3 = parseInt(m[2], 10) - 1;
      if (mon3 >= 0 && mon3 <= 11 && day3 >= 1 && day3 <= 31) {
        var year3 = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : inferYear(mon3, day3, refDate);
        return toIso(year3, mon3, day3);
      }
    }

    return null;
  }

  function inferYear(month, day, refDate) {
    // If the date already passed this year, assume next year — but for
    // this campus prototype we anchor everything to refDate's year first.
    var candidate = new Date(refDate.getFullYear(), month, day);
    if (candidate < refDate) return refDate.getFullYear() + 1;
    return refDate.getFullYear();
  }

  function findRelativeDate(text, refDate) {
    var lower = text.toLowerCase();

    if (/\btomorrow\b/.test(lower)) {
      var t = new Date(refDate); t.setDate(t.getDate() + 1);
      return toIso(t.getFullYear(), t.getMonth(), t.getDate());
    }
    if (/\btoday\b/.test(lower)) {
      return toIso(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    }
    if (/\bday after tomorrow\b/.test(lower)) {
      var d2 = new Date(refDate); d2.setDate(d2.getDate() + 2);
      return toIso(d2.getFullYear(), d2.getMonth(), d2.getDate());
    }

    // "in 5 days"
    var inDays = lower.match(/\bin (\d{1,2}) days?\b/);
    if (inDays) {
      var n = parseInt(inDays[1], 10);
      var d3 = new Date(refDate); d3.setDate(d3.getDate() + n);
      return toIso(d3.getFullYear(), d3.getMonth(), d3.getDate());
    }

    // "this/next <weekday>"
    var wd = lower.match(/\b(this|next|coming)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (wd) {
      return nextWeekday(refDate, WEEKDAYS.indexOf(wd[2]), wd[1] === "next");
    }
    // bare weekday, e.g. "by Friday" / "on Monday"
    var wd2 = lower.match(/\b(?:by|on|before)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (wd2) {
      return nextWeekday(refDate, WEEKDAYS.indexOf(wd2[1]), false);
    }

    return null;
  }

  function nextWeekday(refDate, targetDow, forceNextWeek) {
    var d = new Date(refDate);
    var diff = (targetDow - d.getDay() + 7) % 7;
    if (diff === 0) diff = forceNextWeek ? 7 : 0;
    if (forceNextWeek && diff < 7) diff += 7;
    d.setDate(d.getDate() + diff);
    return toIso(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function findDeadline(text, refDate) {
    return findExplicitDate(text, refDate) || findRelativeDate(text, refDate);
  }

  function findTime(text) {
    // "2 PM", "2:00 PM", "10am", "at 14:00"
    var m = text.match(/\b(\d{1,2})(:\d{2})?\s?(am|pm|AM|PM)\b/);
    if (m) {
      var hour = m[1];
      var min = m[2] ? m[2] : ":00";
      return hour + min + " " + m[3].toUpperCase();
    }
    var m2 = text.match(/\bat\s+(\d{1,2}):(\d{2})\b/i);
    if (m2) return m2[1] + ":" + m2[2];
    return null;
  }

  function findVenue(text) {
    // "in the lab", "at Seminar Hall", "in Room 108", "at the auditorium"
    var patterns = [
      /\b(?:in|at)\s+(the\s+)?([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\s?(?:Hall|Lab|Laboratory|Room|Auditorium|Ground|Block|Campus|Centre|Center))\b/,
      /\b(?:in|at)\s+(the\s+)?(lab|laboratory|auditorium|seminar hall|classroom|library|ground|canteen)\b/i,
      /\broom\s+(\w+)\b/i
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m) {
        var venue = (m[2] || m[1] || m[0]).trim();
        // normalize capitalization for lowercase generic matches
        venue = venue.replace(/^the\s+/i, "");
        venue = venue.charAt(0).toUpperCase() + venue.slice(1);
        return venue;
      }
    }
    return null;
  }

  function findSubject(text) {
    var lower = text.toLowerCase();
    var keys = Object.keys(SUBJECT_DICTIONARY).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      var re = new RegExp("\\b" + keys[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      if (re.test(lower)) return SUBJECT_DICTIONARY[keys[i]];
    }
    // fall back: "<Capitalized Word(s)> practical/assignment/quiz/exam"
    var m = text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(practical|assignment|quiz|exam|file|experiment)\b/);
    if (m) return m[1];
    return null;
  }

  function findAction(text, subject) {
    var verbs = ["submit", "complete", "bring", "attend", "register", "apply", "prepare", "fill", "collect", "pay", "report"];
    var lower = text.toLowerCase();
    for (var i = 0; i < verbs.length; i++) {
      var idx = lower.indexOf(verbs[i]);
      if (idx !== -1) {
        // grab the clause starting at the verb up to sentence end / comma
        var rest = text.slice(idx);
        var m = rest.match(/^([A-Za-z][^.!?\n]*?)(?:[.!?]|$)/);
        var clause = m ? m[1] : rest;
        clause = clause.trim();
        clause = clause.charAt(0).toUpperCase() + clause.slice(1);
        if (clause.length > 90) clause = clause.slice(0, 87) + "…";
        return clause;
      }
    }
    return null;
  }

  function detectCategory(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < CATEGORY_KEYWORDS.length; i++) {
      var group = CATEGORY_KEYWORDS[i];
      for (var j = 0; j < group.words.length; j++) {
        if (lower.indexOf(group.words[j]) !== -1) return group.category;
      }
    }
    if (/timetable|schedule|class will|lecture/.test(lower)) return "Class";
    return "General";
  }

  function detectPriority(text, deadlineIso, refDate) {
    var lower = text.toLowerCase();
    for (var i = 0; i < URGENCY_WORDS.length; i++) {
      if (lower.indexOf(URGENCY_WORDS[i]) !== -1) return "high";
    }
    if (!deadlineIso) return "low";
    var deadline = new Date(deadlineIso + "T00:00:00");
    var daysUntil = Math.round((deadline - refDate) / 86400000);
    if (daysUntil <= 1) return "high";
    if (daysUntil <= 5) return "medium";
    return "low";
  }

  function truncateAtWord(str, maxLen) {
    if (str.length <= maxLen) return str;
    var cut = str.slice(0, maxLen);
    var lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 10) cut = cut.slice(0, lastSpace);
    return cut + "…";
  }

  function buildTitle(subject, action, category, rawText) {
    if (subject && /practical|experiment|file/i.test(rawText)) return subject + " Practical File";
    if (subject && /quiz/i.test(rawText)) return subject + " Quiz";
    if (subject && /exam/i.test(rawText)) return subject + " Exam";
    if (subject && /assignment/i.test(rawText)) return subject + " Assignment";
    if (subject) return subject + " Update";
    if (action) return truncateAtWord(action, 42);
    // fallback: first ~7 words of the raw text, titled
    var words = rawText.trim().split(/\s+/).slice(0, 7).join(" ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function buildSummary(rawText) {
    var firstSentence = rawText.match(/^[^.!?\n]*[.!?]?/);
    var sentence = firstSentence ? firstSentence[0].trim() : rawText.trim();
    if (sentence.length < 12 && rawText.length > sentence.length) sentence = rawText.trim();
    return sentence.length > 140 ? sentence.slice(0, 137) + "…" : sentence;
  }

  function buildTags(rawText, subject, category) {
    var tags = [];
    if (subject) {
      var abbrev = Object.keys(SUBJECT_DICTIONARY).find(function (k) { return SUBJECT_DICTIONARY[k] === subject; });
      tags.push(abbrev ? abbrev.toUpperCase() : subject);
    }
    var lower = rawText.toLowerCase();
    ["practical", "assignment", "quiz", "exam", "workshop", "hackathon", "scholarship", "registration"].forEach(function (w) {
      if (lower.indexOf(w) !== -1 && tags.indexOf(w) === -1) tags.push(w.charAt(0).toUpperCase() + w.slice(1));
    });
    if (category && tags.indexOf(category) === -1 && tags.length < 4) tags.push(category);
    return tags.slice(0, 4);
  }

  /**
   * Parse a CR's free-text announcement into structured data.
   * @param {string} rawText
   * @param {{today?: Date}} [opts]
   */
  function parseAnnouncement(rawText, opts) {
    opts = opts || {};
    var refDate = opts.today || new Date();
    var text = (rawText || "").trim();

    var deadline = findDeadline(text, refDate);
    var time = findTime(text);
    var venue = findVenue(text);
    var subject = findSubject(text);
    var action = findAction(text, subject);
    var category = detectCategory(text);
    var priority = detectPriority(text, deadline, refDate);
    var title = buildTitle(subject, action, category, text);
    var summary = buildSummary(text);
    var tags = buildTags(text, subject, category);

    var fieldsFound = [subject, action, deadline, venue].filter(Boolean).length;
    var confidence = Math.min(0.96, 0.55 + fieldsFound * 0.1 + (deadline ? 0.05 : 0));

    return {
      raw: text,
      title: title,
      summary: summary,
      subject: subject || null,
      action: action || null,
      deadline: deadline || null,
      time: time || null,
      venue: venue || null,
      priority: priority,
      category: category,
      add_to_calendar: !!deadline,
      tags: tags,
      confidence: Math.round(confidence * 100) / 100
    };
  }

  global.CB = global.CB || {};
  global.CB.ai = {
    parseAnnouncement: parseAnnouncement
  };
})(window);
