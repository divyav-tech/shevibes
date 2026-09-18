/* =========================================================
   CAMPUS BOARD — main.js
   Shared across every page: localStorage helpers, sample data,
   mobile nav toggle, toast helper.

   Everything lives on the global `CB` object so pages can call
   CB.storage.getProfile(), CB.data.announcements, etc. without a
   build step or module bundler (plain <script> tags only).

   // TODO(backend): every "SAMPLE_*" array below is a stand-in for
   // a future GET /api/... call. Shapes are kept close to what the
   // Flask + AI pipeline would return so swapping them out later is
   // mostly a find/replace of the data source, not the UI code.
   ========================================================= */

(function (global) {
  "use strict";

  var STORAGE_KEYS = {
    profile: "campusboard.profile",
    saved: "campusboard.saved",
    crAnnouncements: "campusboard.crAnnouncements",
    deletedAnnouncements: "campusboard.deletedAnnouncements",
    notifications: "campusboard.notifications",
    calendarNotes: "campusboard.calendarNotes",
    polaroids: "campusboard.polaroids",
    customPolaroids: "campusboard.customPolaroids",
    taskStates: "campusboard.taskStates"
  };

  // Anchored "today" for this prototype — keeps deadlines, priorities and
  // the calendar's default month consistent with the sample data below.
  var TODAY = new Date();

  /* ---------------- storage: profile ---------------- */

  function getProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.profile);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
    if (profile && profile.id) localStorage.setItem("campusboard.activeUserId", String(profile.id));
  }

  function clearProfile() {
    localStorage.removeItem(STORAGE_KEYS.profile);
    localStorage.removeItem("campusboard.activeUserId");
  }

  function hasProfile() {
    return !!getProfile();
  }

  /* ---------------- per-user local storage ---------------- */
  // Personal UI state must NEVER be shared between accounts on the same browser.
  // Community content (announcements/timetable) is intentionally shared through
  // the backend; saved/completed/profile decorations are scoped to active user.
  function activeUserStorageId() {
    var id = localStorage.getItem("campusboard.activeUserId");
    if (id) return String(id);
    var profile = getProfile();
    return profile && profile.id ? String(profile.id) : "guest";
  }

  function userKey(base) {
    return base + ".user." + activeUserStorageId();
  }

  /* ---------------- storage: saved items ---------------- */
  // shape: { announcement: ["a1","a3"], opportunity: ["o2"], event: ["e1"] }

  function getSaved() {
    var empty = { announcement: [], opportunity: [], event: [] };
    try {
      var raw = localStorage.getItem(userKey(STORAGE_KEYS.saved));
      var parsed = raw ? JSON.parse(raw) : empty;
      ["announcement", "opportunity", "event"].forEach(function (type) {
        parsed[type] = Array.isArray(parsed[type]) ? parsed[type].map(String) : [];
      });
      return parsed;
    } catch (e) {
      return empty;
    }
  }

  function isSaved(type, id) {
    var saved = getSaved();
    return (saved[type] || []).indexOf(String(id)) !== -1;
  }

  function toggleSaved(type, id) {
    var saved = getSaved();
    if (!saved[type]) saved[type] = [];
    id = String(id);
    var idx = saved[type].indexOf(id);
    var nowSaved;
    if (idx === -1) {
      saved[type].push(id);
      nowSaved = true;
    } else {
      saved[type].splice(idx, 1);
      nowSaved = false;
    }
    localStorage.setItem(userKey(STORAGE_KEYS.saved), JSON.stringify(saved));
    return nowSaved;
  }

  function savedCount() {
    var saved = getSaved();
    return (saved.announcement || []).length + (saved.opportunity || []).length + (saved.event || []).length;
  }

  /* ---------------- storage: task completion / priority / reminders ---------------- */
  // Per-user local state for actionable items. Shape:
  // { "announcement:a1": { completed:false, priority:"high", reminder:"1-day", completedAt:null } }
  function taskStorageKey() {
    var uid = localStorage.getItem("campusboard.activeUserId") || "guest";
    return STORAGE_KEYS.taskStates + "." + uid;
  }

  function getTaskStates() {
    try {
      var raw = localStorage.getItem(taskStorageKey());
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function getTaskState(type, id) {
    var all = getTaskStates();
    return all[String(type) + ":" + String(id)] || { completed: false, priority: null, reminder: "none", completedAt: null };
  }

  function setTaskState(type, id, changes) {
    var all = getTaskStates();
    var key = String(type) + ":" + String(id);
    var current = all[key] || { completed: false, priority: null, reminder: "none", completedAt: null };
    all[key] = Object.assign({}, current, changes);
    localStorage.setItem(taskStorageKey(), JSON.stringify(all));
    document.dispatchEvent(new CustomEvent("cb:task-changed", { detail: { type: type, id: String(id), state: all[key] } }));
    return all[key];
  }

  function toggleTaskComplete(type, id) {
    var current = getTaskState(type, id);
    return setTaskState(type, id, {
      completed: !current.completed,
      completedAt: !current.completed ? new Date().toISOString() : null
    });
  }

  function taskIsActionable(item) {
    return !!(item && item.deadline);
  }

  /* ---------------- storage: CR-posted announcements ---------------- */

  function getCrAnnouncements() {
    try {
      var raw = localStorage.getItem(userKey(STORAGE_KEYS.crAnnouncements));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addCrAnnouncement(announcement) {
    var list = getCrAnnouncements();
    list.unshift(announcement);
    localStorage.setItem(userKey(STORAGE_KEYS.crAnnouncements), JSON.stringify(list));
    return list;
  }

  function removeCrAnnouncement(id) {
    var target = String(id);
    var list = getCrAnnouncements().filter(function (item) {
      return String(item.id) !== target;
    });
    localStorage.setItem(userKey(STORAGE_KEYS.crAnnouncements), JSON.stringify(list));
    return list;
  }

  function getDeletedAnnouncements() {
    try {
      var uid = localStorage.getItem("campusboard.activeUserId") || "guest";
      var raw = localStorage.getItem(STORAGE_KEYS.deletedAnnouncements + "." + uid);
      return raw ? JSON.parse(raw).map(String) : [];
    } catch (e) { return []; }
  }

  function hideAnnouncement(id) {
    var uid = localStorage.getItem("campusboard.activeUserId") || "guest";
    var key = STORAGE_KEYS.deletedAnnouncements + "." + uid;
    var list = getDeletedAnnouncements();
    id = String(id);
    if (list.indexOf(id) === -1) list.push(id);
    localStorage.setItem(key, JSON.stringify(list));
    // Also remove it from saved items so Profile never shows a deleted card.
    var saved = getSaved();
    Object.keys(saved).forEach(function (type) {
      saved[type] = (saved[type] || []).filter(function (savedId) { return String(savedId) !== id; });
    });
    localStorage.setItem(userKey(STORAGE_KEYS.saved), JSON.stringify(saved));
  }

  function isAnnouncementHidden(id) {
    return getDeletedAnnouncements().indexOf(String(id)) !== -1;
  }

  /* ---------------- storage: calendar notes (student's own) ---------------- */
  // shape: [{ id, date: "YYYY-MM-DD", text, type: "Deadline"|"Exam"|"Event"|"Reminder" }]

  function getCalendarNotes() {
    try {
      var raw = localStorage.getItem(userKey(STORAGE_KEYS.calendarNotes));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addCalendarNote(note) {
    var list = getCalendarNotes();
    note.id = "note-" + Date.now();
    list.push(note);
    localStorage.setItem(userKey(STORAGE_KEYS.calendarNotes), JSON.stringify(list));
    return note;
  }

  function updateCalendarNote(id, changes) {
    var list = getCalendarNotes().map(function (n) {
      return n.id === id ? Object.assign({}, n, changes) : n;
    });
    localStorage.setItem(userKey(STORAGE_KEYS.calendarNotes), JSON.stringify(list));
    return list;
  }

  function deleteCalendarNote(id) {
    var list = getCalendarNotes().filter(function (n) { return n.id !== id; });
    localStorage.setItem(userKey(STORAGE_KEYS.calendarNotes), JSON.stringify(list));
    return list;
  }

  /* ---------------- storage: polaroid photos ---------------- */
  // shape: { "<polaroid-id>": "data:image/...;base64,..." }

  function getPolaroids() {
    try {
      var raw = localStorage.getItem(userKey(STORAGE_KEYS.polaroids));
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function setPolaroidImage(polaroidId, dataUrl) {
    var all = getPolaroids();
    all[polaroidId] = dataUrl;
    localStorage.setItem(userKey(STORAGE_KEYS.polaroids), JSON.stringify(all));
    return all;
  }

  function removePolaroidImage(polaroidId) {
    var all = getPolaroids();
    delete all[polaroidId];
    localStorage.setItem(userKey(STORAGE_KEYS.polaroids), JSON.stringify(all));
    return all;
  }

  /* ---------------- storage: notifications ---------------- */

  var DEFAULT_NOTIFICATIONS = [
    { id: "n1", text: "Assignment deadline tomorrow — C Programming, Experiment 5", read: false },
    { id: "n2", text: "New Tech Workshop added: Web Development Workshop, 14 Sept", read: false },
    { id: "n3", text: "Scholarship deadline approaching — closes 20 Sept", read: false },
    { id: "n4", text: "New announcement for CSE Section A", read: true }
  ];

  function getNotifications() {
    try {
      var raw = localStorage.getItem(userKey(STORAGE_KEYS.notifications));
      if (!raw) {
        localStorage.setItem(userKey(STORAGE_KEYS.notifications), JSON.stringify(DEFAULT_NOTIFICATIONS));
        return DEFAULT_NOTIFICATIONS.slice();
      }
      return JSON.parse(raw);
    } catch (e) {
      return DEFAULT_NOTIFICATIONS.slice();
    }
  }

  function markNotificationRead(id) {
    var list = getNotifications().map(function (n) {
      if (n.id === id) n.read = true;
      return n;
    });
    localStorage.setItem(userKey(STORAGE_KEYS.notifications), JSON.stringify(list));
    return list;
  }

  function markAllNotificationsRead() {
    var list = getNotifications().map(function (n) {
      n.read = true;
      return n;
    });
    localStorage.setItem(userKey(STORAGE_KEYS.notifications), JSON.stringify(list));
    return list;
  }

  function unreadNotificationCount() {
    return getNotifications().filter(function (n) { return !n.read; }).length;
  }

  function syncTaskReminders(items, type) {
    if (!Array.isArray(items)) return;
    var today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    var notifications = getNotifications();
    var changed = false;
    items.forEach(function (item) {
      if (!item || !item.deadline) return;
      var task = getTaskState(type, item.id);
      if (!task.reminder || task.reminder === "none" || task.completed) return;
      var offsets = { "1-day": 1, "2-days": 2, "1-week": 7 };
      var offset = offsets[task.reminder];
      if (!offset) return;
      var deadline = new Date(String(item.deadline).slice(0, 10) + "T00:00:00");
      var reminderDate = new Date(deadline.getTime() - offset * 86400000);
      if (reminderDate.getTime() !== today.getTime()) return;
      var nid = "task-reminder:" + type + ":" + item.id + ":" + task.reminder;
      if (notifications.some(function (n) { return n.id === nid; })) return;
      notifications.unshift({ id: nid, text: "Reminder — " + item.title + " is due " + (offset === 1 ? "tomorrow" : "soon") + ".", read: false });
      changed = true;
    });
    if (changed) localStorage.setItem(userKey(STORAGE_KEYS.notifications), JSON.stringify(notifications));
    return notifications;
  }

  /* ---------------- sample data ---------------- */
  // TODO(backend): replace with GET /api/announcements
  var SAMPLE_ANNOUNCEMENTS = [
    { id: "a1", title: "C Programming — Experiment 5", description: "Complete Experiment 5 and submit the practical file.", category: "Academic", date: "2026-09-10", deadline: "2026-09-12", source: "CSE Section A CR", priority: "high", forClass: "1st Year · CSE · Section A", venue: "Not specified" },
    { id: "a2", title: "Physics Quiz — Units 1–3", description: "Quiz covering Units 1 through 3, held during the regular lecture slot.", category: "Academic", date: "2026-09-11", deadline: "2026-09-13", source: "Physics Dept.", priority: "high", forClass: "1st Year · CSE · Section A", venue: "Room 204" },
    { id: "a3", title: "Timetable Change — Section A", description: "Thursday's Data Structures lecture moves to 2:00 PM, Room 108.", category: "Class", date: "2026-09-12", deadline: null, source: "CSE Section A CR", priority: "medium", forClass: "1st Year · CSE · Section A", venue: "Room 108" },
    { id: "a4", title: "Tech Society Orientation", description: "Meet the Tech Society core team and see what the semester's projects look like.", category: "Society", date: "2026-09-09", deadline: null, source: "Tech Society", priority: "low", forClass: "All Students", venue: "Auditorium" },
    { id: "a5", title: "Library Extends Study Hours", description: "The central library will stay open until 10 PM through exam season.", category: "General", date: "2026-09-08", deadline: null, source: "Library Admin", priority: "low", forClass: "All Students", venue: "Central Library" },
    { id: "a6", title: "Internal Assessment Registration", description: "Register for the first internal assessment slot before seats fill up.", category: "Important", date: "2026-09-07", deadline: "2026-09-15", source: "Examination Cell", priority: "high", forClass: "All Students", venue: "Not specified" }
  ];

  // TODO(backend): replace with GET /api/opportunities
  var SAMPLE_OPPORTUNITIES = [
    { id: "o1", title: "Hackathon 2026", org: "Campus Tech Council", category: "Tech", deadline: "2026-09-16", eligibility: "All years, teams of 2–4", description: "36-hour build sprint. Build, create, innovate — open theme.", tags: ["Hackathon", "Tech", "Teams"] },
    { id: "o2", title: "Scholarship Application", org: "Dean of Students Office", category: "Scholarships", deadline: "2026-09-20", eligibility: "1st & 2nd year, merit-based", description: "Merit scholarship covering partial tuition for the coming semester.", tags: ["Scholarship", "Financial Aid"] },
    { id: "o3", title: "Web Development Workshop", org: "Tech Society", category: "Workshops", deadline: "2026-09-14", eligibility: "Open to all", description: "Hands-on intro to HTML, CSS and JS — bring a laptop.", tags: ["Workshop", "Web Dev"] },
    { id: "o4", title: "Freshers Society Recruitment", org: "Multiple Societies", category: "Societies", deadline: "2026-09-18", eligibility: "1st years only", description: "Open recruitment across Drama, Music, Design and Debate societies.", tags: ["Society", "Freshers"] },
    { id: "o5", title: "Inter-College Coding Contest", org: "ACM Student Chapter", category: "Competitions", deadline: "2026-09-22", eligibility: "All years", description: "Competitive programming contest, individual participation.", tags: ["Competition", "Coding"] },
    { id: "o6", title: "Volunteer Teaching Drive", org: "NGO Outreach Cell", category: "Volunteering", deadline: "2026-09-25", eligibility: "All years", description: "Weekend teaching drive at a nearby government school.", tags: ["Volunteering", "Community"] },
    { id: "o7", title: "Photography Contest", org: "Design Society", category: "Events", deadline: "2026-09-20", eligibility: "Open to all", description: "Submit up to 3 campus-life photographs for the semester showcase.", tags: ["Contest", "Creative"] },
    { id: "o8", title: "Python Workshop", org: "Tech Society", category: "Workshops", deadline: "2026-09-19", eligibility: "Open to all", description: "Beginner-friendly Python fundamentals, 2-hour session.", tags: ["Workshop", "Tech"] }
  ];

  // TODO(backend): replace with GET /api/calendar
  var SAMPLE_EVENTS = [
    { id: "e1", title: "Physics Quiz", date: "2026-09-13", type: "exam", forClass: "1st Year · CSE · Section A" },
    { id: "e2", title: "C Programming Practical Due", date: "2026-09-12", type: "deadline", forClass: "1st Year · CSE · Section A" },
    { id: "e3", title: "Web Development Workshop", date: "2026-09-14", type: "workshop", forClass: "All Students" },
    { id: "e4", title: "Hackathon Registration Closes", date: "2026-09-16", type: "deadline", forClass: "All Students" },
    { id: "e5", title: "Society Recruitment Opens", date: "2026-09-18", type: "society", forClass: "All Students" },
    { id: "e6", title: "Scholarship Application Closes", date: "2026-09-20", type: "deadline", forClass: "All Students" },
    { id: "e7", title: "Photography Contest Submission", date: "2026-09-20", type: "event", forClass: "All Students" },
    { id: "e8", title: "Inter-College Coding Contest", date: "2026-09-22", type: "competition", forClass: "All Students" },
    { id: "e9", title: "Volunteer Teaching Drive", date: "2026-09-25", type: "event", forClass: "All Students" }
  ];

  // Server-owned community announcements loaded for the current authenticated
  // user. This is shared campus/class content, not personal account state.
  var COMMUNITY_ANNOUNCEMENTS = [];

  function setCommunityAnnouncements(rows) {
    COMMUNITY_ANNOUNCEMENTS = Array.isArray(rows) ? rows.map(function (row) {
      return {
        id: String(row.id),
        title: row.title || "Untitled announcement",
        description: row.description || row.summary || row.content || "",
        category: String(row.category || "General").replace(/^./, function(c){ return c.toUpperCase(); }),
        date: String(row.created_at || row.date || "").slice(0,10),
        deadline: row.deadline ? String(row.deadline).slice(0,10) : null,
        source: row.source || "Class Representative",
        forClass: row.forClass || row.class_name || "All Students",
        priority: row.priority || "medium",
        postedBy: row.posted_by || row.postedBy || null,
        venue: row.venue || "Not specified",
        aiGenerated: Boolean(row.aiGenerated || row.ai_generated),
        subject: row.subject || null, action: row.action || null, time: row.time || null,
        tags: row.tags || []
      };
    }) : [];
    return COMMUNITY_ANNOUNCEMENTS;
  }

  function getAllAnnouncements() {
    var crPosted = getCrAnnouncements();
    var hidden = getDeletedAnnouncements();
    var combined = COMMUNITY_ANNOUNCEMENTS.concat(crPosted).concat(SAMPLE_ANNOUNCEMENTS);
    var seen = {};
    return combined.filter(function (item) {
      if (hidden.indexOf(String(item.id)) !== -1) return false;
      var key = String(item.title || "").trim().toLowerCase() + "|" + String(item.deadline || "");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  // Category → event "type" used by the calendar's tone/icon system.
  var CATEGORY_TO_EVENT_TYPE = {
    Academic: "deadline",
    Class: "event",
    Workshop: "workshop",
    Competition: "competition",
    Society: "society",
    Event: "event",
    Important: "deadline",
    General: "event"
  };

  // AI-posted CR announcements that resolved a deadline automatically
  // flow onto the calendar — this is what "posting updates everything"
  // means in the AI pipeline (see project brief, item 6 & 23).
  function deriveEventsFromCrAnnouncements() {
    return getCrAnnouncements()
      .filter(function (a) { return a.add_to_calendar && a.deadline; })
      .map(function (a) {
        return {
          id: "cr-evt-" + a.id,
          title: a.title,
          date: a.deadline,
          time: a.time || null,
          venue: a.venue || null,
          type: CATEGORY_TO_EVENT_TYPE[a.category] || "event",
          priority: a.priority,
          forClass: a.forClass,
          aiGenerated: true
        };
      });
  }

  function getAllEvents() {
    return SAMPLE_EVENTS.concat(deriveEventsFromCrAnnouncements());
  }

  /* ---------------- community targeting ---------------- */
  // Shared announcements can target an exact class, a whole year/branch,
  // an entire branch, or the whole campus. Personal task state never lives here.
  function classLabelForProfile(profile) {
    profile = profile || getProfile() || {};
    return (profile.year || "") + " · " + (profile.branch || "") + " · Section " + (profile.section || "");
  }

  function audienceMatches(audience, profile) {
    if (!audience) return true;
    var a = String(audience).trim();
    if (!a || a === "All Students" || a === "College-wide") return true;
    profile = profile || getProfile() || {};
    var year = profile.year || "";
    var branch = profile.branch || "";
    var section = profile.section || "";
    var exact = classLabelForProfile(profile);
    if (a === exact) return true;
    if (a === year + " · " + branch + " · All Sections") return true;
    if (a === branch + " · All Years") return true;
    if (a === year + " · All Branches") return true;
    return false;
  }

  /* ---------------- timetable demo data ---------------- */
  var SAMPLE_TIMETABLE = {
    id: "demo-timetable-a",
    title: "1st Year · CSE · Section A",
    audience: "1st Year · CSE · Section A",
    status: "published",
    updated_at: "2026-09-15",
    entries: [
      { day: "Monday", start: "09:00", end: "10:00", subject: "BEE", faculty: "Dr. Mehta", room: "Room 204" },
      { day: "Monday", start: "10:00", end: "11:00", subject: "Mathematics", faculty: "Ms. Sharma", room: "Room 204" },
      { day: "Monday", start: "11:30", end: "12:30", subject: "C Programming", faculty: "Mr. Verma", room: "Lab 2" },
      { day: "Tuesday", start: "09:00", end: "10:00", subject: "Physics", faculty: "Dr. Rao", room: "Room 105" },
      { day: "Tuesday", start: "10:00", end: "11:00", subject: "Communication Skills", faculty: "Ms. Kapoor", room: "Room 105" },
      { day: "Tuesday", start: "11:30", end: "13:00", subject: "C Programming Lab", faculty: "Mr. Verma", room: "C Lab" },
      { day: "Wednesday", start: "09:00", end: "10:00", subject: "Mathematics", faculty: "Ms. Sharma", room: "Room 204" },
      { day: "Wednesday", start: "10:00", end: "11:00", subject: "Web Development", faculty: "Ms. Nair", room: "Lab 1" },
      { day: "Wednesday", start: "11:30", end: "12:30", subject: "Physics", faculty: "Dr. Rao", room: "Room 105" },
      { day: "Thursday", start: "09:00", end: "10:00", subject: "BEE", faculty: "Dr. Mehta", room: "Room 204" },
      { day: "Thursday", start: "10:00", end: "11:00", subject: "Web Development", faculty: "Ms. Nair", room: "Lab 1" },
      { day: "Thursday", start: "11:30", end: "12:30", subject: "Mathematics", faculty: "Ms. Sharma", room: "Room 204" },
      { day: "Friday", start: "09:00", end: "10:00", subject: "Communication Skills", faculty: "Ms. Kapoor", room: "Room 105" },
      { day: "Friday", start: "10:00", end: "11:00", subject: "C Programming", faculty: "Mr. Verma", room: "Room 204" },
      { day: "Friday", start: "11:30", end: "12:30", subject: "Physics", faculty: "Dr. Rao", room: "Room 105" }
    ]
  };

  /* ---------------- category → paper tone ---------------- */

  var TONE_MAP = {
    Academic: "tone-academic",
    Important: "tone-important",
    Opportunity: "tone-opportunity",
    Scholarships: "tone-opportunity",
    Tech: "tone-opportunity",
    Competitions: "tone-opportunity",
    Workshops: "tone-opportunity",
    Workshop: "tone-opportunity",
    Competition: "tone-opportunity",
    Event: "tone-event",
    Events: "tone-event",
    Class: "tone-rose",
    Society: "tone-society",
    Societies: "tone-society",
    Volunteering: "tone-opportunity",
    Personal: "tone-personal",
    General: "tone-cream"
  };

  function toneForCategory(category) {
    return TONE_MAP[category] || "tone-cream";
  }

  /* ---------------- small utilities ---------------- */

  function formatDate(iso) {
    if (!iso) return "Not specified";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    var opts = { day: "numeric", month: "short" };
    return d.toLocaleDateString("en-GB", opts);
  }

  function matchesInterests(category, interests) {
    if (!interests || !interests.length) return false;
    return interests.indexOf(category) !== -1;
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay || 200);
    };
  }

  var toastTimer = null;
  function toast(message) {
    var el = document.getElementById("cb-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "cb-toast";
      el.className = "cb-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2400);
  }

  /* ---------------- shared app-shell header (search, notifications, avatar) ---------------- */
  // Used by dashboard.html, announcements.html, opportunities.html,
  // calendar.html and profile.html — each of those pages calls
  // CB.initAppHeader() once on DOMContentLoaded.

  function buildSearchIndex() {
    var index = [];
    getAllAnnouncements().forEach(function (a) {
      index.push({ type: "Announcement", id: a.id, title: a.title, meta: a.category, href: "announcements.html?q=" + encodeURIComponent(a.title) });
    });
    SAMPLE_OPPORTUNITIES.forEach(function (o) {
      index.push({ type: "Opportunity", id: o.id, title: o.title, meta: o.category, href: "opportunities.html?q=" + encodeURIComponent(o.title) });
    });
    SAMPLE_EVENTS.forEach(function (e) {
      index.push({ type: "Event", id: e.id, title: e.title, meta: formatDate(e.date), href: "calendar.html?q=" + encodeURIComponent(e.title) });
    });
    index.push({ type: "Timetable", id: "timetable", title: "Class Timetable", meta: "Your weekly schedule", href: "timetable.html" });
    return index;
  }

  function initSearch() {
    var input = document.getElementById("global-search");
    var resultsBox = document.getElementById("search-results");
    if (!input || !resultsBox) return;

    var index = buildSearchIndex();

    function render(query) {
      var q = query.trim().toLowerCase();
      if (!q) { resultsBox.hidden = true; resultsBox.innerHTML = ""; return; }

      var matches = index.filter(function (item) {
        return item.title.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 7);

      resultsBox.innerHTML = "";
      if (!matches.length) {
        var empty = document.createElement("div");
        empty.className = "search-empty";
        empty.textContent = "No results found for \u201c" + query + "\u201d";
        resultsBox.appendChild(empty);
      } else {
        matches.forEach(function (item) {
          var a = document.createElement("a");
          a.className = "search-result";
          a.href = item.href;
          a.innerHTML = '<span class="search-result-type">' + item.type + '</span>' +
            '<span class="search-result-title">' + item.title + '</span>' +
            '<span class="search-result-meta">' + item.meta + '</span>';
          resultsBox.appendChild(a);
        });
      }
      resultsBox.hidden = false;
    }

    input.addEventListener("input", debounce(function () { render(input.value); }, 150));
    input.addEventListener("focus", function () { if (input.value.trim()) render(input.value); });
    document.addEventListener("click", function (e) {
      if (!resultsBox.contains(e.target) && e.target !== input) resultsBox.hidden = true;
    });

    // If arriving from a search result link with ?q=, pre-fill and show it was matched.
    var params = new URLSearchParams(window.location.search);
    if (params.get("q")) input.value = params.get("q");
  }

  function renderNotifDropdown() {
    var list = document.getElementById("notif-list");
    var dot = document.getElementById("notif-dot");
    if (!list) return;

    var notifications = getNotifications();
    list.innerHTML = "";
    notifications.forEach(function (n) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "notif-item" + (n.read ? " is-read" : "");
      item.textContent = n.text;
      item.addEventListener("click", function () {
        markNotificationRead(n.id);
        renderNotifDropdown();
      });
      list.appendChild(item);
    });

    if (dot) dot.hidden = unreadNotificationCount() === 0;
  }

  function initNotifications() {
    var btn = document.getElementById("notif-btn");
    var dropdown = document.getElementById("notif-dropdown");
    var markAll = document.getElementById("notif-mark-all");
    if (!btn || !dropdown) return;

    renderNotifDropdown();

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = dropdown.hidden === false;
      dropdown.hidden = isOpen;
      btn.setAttribute("aria-expanded", (!isOpen).toString());
    });

    document.addEventListener("click", function (e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });

    if (markAll) {
      markAll.addEventListener("click", function () {
        markAllNotificationsRead();
        renderNotifDropdown();
      });
    }
  }

  // Avatar always shows the first letter of the user's saved name —
  // falls back to a neutral "S" (Student) if no name was given.
  function avatarInitial(profile) {
    var name = (profile && profile.name || "").trim();
    return name ? name.charAt(0).toUpperCase() : "S";
  }

  function initAvatar() {
    var avatar = document.getElementById("app-avatar");
    if (!avatar) return;
    var profile = getProfile();
    if (!profile) return;
    avatar.textContent = avatarInitial(profile);
    avatar.title = (profile.name ? profile.name + " · " : "") + profile.role + " · " + profile.year + " · " + profile.branch + " · Section " + profile.section;
  }

  function initProtectedPage(callback) {
    document.documentElement.classList.add("auth-checking");
    if (!api || !api.me) {
      clearProfile();
      window.location.replace("index.html");
      return;
    }

    api.me().then(function (res) {
      if (!res || !res.authenticated || !res.user) {
        clearProfile();
        window.location.replace("index.html");
        return;
      }

      // Server is authoritative source of truth
      saveProfile(res.user);
      document.documentElement.classList.remove("auth-checking");

      initAvatar();
      initSearch();
      initNotifications();

      // Load community data before page-specific rendering so a CR post made
      // by one account is visible to the correct audience for other accounts.
      // Personal data is still isolated by active user id in localStorage.
      api.getNotices().then(function (noticeRes) {
        if (noticeRes && Array.isArray(noticeRes.notices)) setCommunityAnnouncements(noticeRes.notices);
      }).catch(function () {}).then(function () {
        if (typeof callback === "function") callback(res.user);
      });
    }).catch(function () {
      clearProfile();
      window.location.replace("index.html");
    });
  }

  function guardAuthenticatedPage(callback) {
    initProtectedPage(callback);
    return true;
  }

  function initSignInModal() {
    var modal = document.getElementById("signin-modal");
    if (!modal) return;

    var openBtns = document.querySelectorAll(".js-open-signin");
    var closeBtns = document.querySelectorAll("[data-close-signin]");
    var form = document.getElementById("signin-form");
    var emailInput = document.getElementById("signin-email");
    var passwordInput = document.getElementById("signin-password");
    var errorMsgEl = document.getElementById("signin-error");

    function openModal(e) {
      if (e) e.preventDefault();
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      if (emailInput) emailInput.focus();
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (errorMsgEl) errorMsgEl.style.display = "none";
    }

    openBtns.forEach(function (btn) { btn.addEventListener("click", openModal); });
    closeBtns.forEach(function (btn) { btn.addEventListener("click", closeModal); });

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = emailInput ? emailInput.value.trim() : "";
        var password = passwordInput ? passwordInput.value.trim() : "";

        if (!email || !password) {
          if (errorMsgEl) {
            errorMsgEl.textContent = "Please fill in all fields.";
            errorMsgEl.style.display = "block";
          }
          return;
        }

        api.login({ college_email: email, password: password })
          .then(function (res) {
            if (res && res.user) {
              saveProfile(res.user);
              closeModal();
              window.location.href = "dashboard.html";
            } else {
              if (errorMsgEl) {
                errorMsgEl.textContent = (res && res.error) || "Incorrect college email or password.";
                errorMsgEl.style.display = "block";
              }
            }
          })
          .catch(function () {
            if (errorMsgEl) {
              errorMsgEl.textContent = "Incorrect college email or password.";
              errorMsgEl.style.display = "block";
            }
          });
      });
    }
  }

  function initAppHeader(callback) {
    initProtectedPage(callback);
    return true;
  }

  /* ---------------- shared UI: info cards + detail modal ---------------- */
  // Used by dashboard.js, announcements.js, opportunities.js, calendar.js
  // so each page doesn't reimplement the same card/modal markup.

  function ensureDetailModal() {
    var modal = document.getElementById("cb-shared-detail-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "cb-modal";
    modal.id = "cb-shared-detail-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="cb-modal-backdrop" data-close-shared-modal></div>' +
      '<div class="cb-modal-panel" role="dialog" aria-modal="true">' +
        '<button class="cb-modal-close" type="button" aria-label="Close" data-close-shared-modal>×</button>' +
        '<div id="cb-shared-detail-body"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close-shared-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        modal.classList.remove("is-open");
        document.body.classList.remove("modal-open");
      });
    });
    return modal;
  }

  function openDetailModal(item) {
    var modal = ensureDetailModal();
    var body = document.getElementById("cb-shared-detail-body");
    var savedType = item.savedType || "announcement";
    var isCurrentlySaved = isSaved(savedType, item.id);
    var actionable = taskIsActionable(item);
    var taskType = savedType || "announcement";
    var task = actionable ? getTaskState(taskType, item.id) : null;
    var priority = (task && task.priority) || item.priority || "medium";
    var reminder = (task && task.reminder) || "none";

    body.innerHTML =
      '<span class="info-card-tag">' + item.category + '</span>' +
      '<h2 style="margin-top:10px;">' + item.title + '</h2>' +
      '<p style="margin-top:10px;color:var(--color-text-muted);">' + item.description + '</p>' +
      '<dl class="trust-fields" style="margin-top:18px;">' +
        '<div><dt>Deadline</dt><dd>' + formatDate(item.deadline) + '</dd></div>' +
        '<div><dt>' + (item.venueLabel || "Venue") + '</dt><dd class="' + (item.venue === "Not specified" || !item.venue ? "not-specified" : "") + '">' + (item.venue || "Not specified") + '</dd></div>' +
      '</dl>' +
      '<p style="margin-top:14px;font-size:0.85rem;color:var(--color-text-muted);">Source: <strong style="color:var(--color-text);">' + item.source + '</strong></p>' +
      (item.forClass ? '<p style="margin-top:7px;font-size:0.78rem;color:var(--color-text-muted);">Visible to: <strong style="color:var(--color-text);">' + item.forClass + '</strong></p>' : '') +
      (item.aiGenerated ? '<p class="ai-trust-line">✦ AI understood this from the CR\'s original message — some details may be edited by hand.</p>' : '') +
      (item.original ? '<a href="#" class="trust-original" style="margin-top:14px;display:inline-block;">Original Announcement →</a>' : '') +
      '<div class="detail-actions" style="margin-top:22px;">' +
        '<button class="btn btn-ghost" type="button" id="cb-shared-save-btn">' +
          (isCurrentlySaved ? "★ Saved — click to remove" : "☆ Save this") +
        '</button>' +
        (actionable ?
          '<button class="task-complete-btn' + (task.completed ? ' is-completed' : '') + '" type="button" id="cb-detail-complete-btn" aria-pressed="' + (task.completed ? 'true' : 'false') + '">' +
            (task.completed ? '✓ Completed' : '○ Mark complete') +
          '</button>' :
          '') +
      '</div>';

    if (actionable) {
      var settings = document.createElement("div");
      settings.className = "task-settings";
      settings.innerHTML =
        '<label>Priority <select id="cb-detail-priority">' +
          '<option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>' +
        '</select></label>' +
        '<label>Reminder <select id="cb-detail-reminder">' +
          '<option value="none">No reminder</option><option value="1-day">1 day before</option><option value="2-days">2 days before</option><option value="1-week">1 week before</option>' +
        '</select></label>';
      body.appendChild(settings);
      document.getElementById("cb-detail-priority").value = priority;
      document.getElementById("cb-detail-reminder").value = reminder;

      document.getElementById("cb-detail-priority").addEventListener("change", function () {
        setTaskState(taskType, item.id, { priority: this.value });
        toast("Priority updated");
      });
      document.getElementById("cb-detail-reminder").addEventListener("change", function () {
        setTaskState(taskType, item.id, { reminder: this.value });
        toast(this.value === "none" ? "Reminder removed" : "Reminder saved ✦");
      });

      document.getElementById("cb-detail-complete-btn").addEventListener("click", function () {
        var next = toggleTaskComplete(taskType, item.id);
        this.classList.toggle("is-completed", next.completed);
        this.setAttribute("aria-pressed", next.completed ? "true" : "false");
        this.textContent = next.completed ? "✓ Completed" : "○ Mark complete";
        toast(next.completed ? "Marked complete ✓" : "Marked as incomplete");
        document.dispatchEvent(new CustomEvent("cb:task-changed"));
      });
    }

    var saveBtn = document.getElementById("cb-shared-save-btn");
    saveBtn.addEventListener("click", function () {
      var nowSaved = toggleSaved(savedType, item.id);
      saveBtn.textContent = nowSaved ? "★ Saved — click to remove" : "☆ Save this";
      toast(nowSaved ? "Saved" : "Removed from saved");
      document.dispatchEvent(new CustomEvent("cb:saved-changed"));
    });

    modal.classList.add("is-open");
    document.body.classList.add("modal-open");
  }

  function renderInfoCards(containerId, items, type, toneClass, emptyMessage) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = '<p class="search-empty">' + (emptyMessage || "Nothing here right now — check back soon.") + '</p>';
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement("div");
      var tone = toneClass || toneForCategory(item.category);
      card.className = "info-card " + tone;
      var task = taskIsActionable(item) ? getTaskState(type, item.id) : null;
      if (task && task.completed) card.classList.add("is-completed");
      var priorityBadge = taskIsActionable(item) && ((task && task.priority) || item.priority)
        ? '<span class="task-priority-badge priority-' + ((task && task.priority) || item.priority) + '">' + ((task && task.priority) || item.priority) + '</span>' : '';
      var completeButton = taskIsActionable(item)
        ? '<button class="task-complete-btn card-task-complete' + (task && task.completed ? ' is-completed' : '') + '" data-complete="' + type + ':' + item.id + '" aria-label="' + (task && task.completed ? 'Mark incomplete' : 'Mark complete') + '" title="' + (task && task.completed ? 'Mark incomplete' : 'Mark complete') + '">' + (task && task.completed ? '✓' : '○') + '</button>'
        : '';
      card.innerHTML =
        '<div class="info-card-head">' +
          '<div>' +
            '<span class="info-card-tag">' + item.category + '</span>' + priorityBadge +
            '<p class="info-card-title">' + item.title + '</p>' +
          '</div>' +
          '<div class="info-card-actions">' + completeButton +
          '<button class="info-card-save' + (isSaved(type, item.id) ? " is-saved" : "") + '" data-save="' + type + ':' + item.id + '" aria-label="Save">' +
            (isSaved(type, item.id) ? "★" : "☆") +
          '</button></div>' +
        '</div>' +
        '<p class="info-card-desc">' + item.description + '</p>' +
        '<div class="info-card-meta">' +
          '<span>' + (item.deadlineLabel || "Deadline") + ': <strong>' + formatDate(item.deadline) + '</strong></span>' +
          '<span>' + (item.sourceLabel || "Source") + ': <strong>' + item.source + '</strong></span>' +
        '</div>' +
        (item.tags && item.tags.length
          ? '<div class="info-card-meta">' + item.tags.map(function (t) { return '<span class="info-card-tag">' + t + '</span>'; }).join("") + '</div>'
          : '') +
        (item.aiGenerated ? '<span class="ai-badge">AI sorted this</span>' : '');
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-save]")) return;
        item.savedType = type;
        openDetailModal(item);
      });
      container.appendChild(card);
    });

    container.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.dataset.save.split(":");
        var nowSaved = toggleSaved(parts[0], parts[1]);
        btn.textContent = nowSaved ? "★" : "☆";
        btn.classList.toggle("is-saved", nowSaved);
        toast(nowSaved ? "Saved" : "Removed from saved");
        document.dispatchEvent(new CustomEvent("cb:saved-changed"));
      });
    });

    container.querySelectorAll("[data-complete]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var parts = btn.dataset.complete.split(":");
        var next = toggleTaskComplete(parts[0], parts[1]);
        btn.textContent = next.completed ? "✓" : "○";
        btn.classList.toggle("is-completed", next.completed);
        btn.setAttribute("aria-label", next.completed ? "Mark incomplete" : "Mark complete");
        var card = btn.closest(".info-card");
        if (card) card.classList.toggle("is-completed", next.completed);
        toast(next.completed ? "Marked complete ✓" : "Marked as incomplete");
      });
    });
  }

  /* ---------------- shared UI: functional polaroids ---------------- */
  // Any element like:
  //   <button class="polaroid polaroid-upload" data-polaroid-id="dashboard-campus">
  //     <div class="photo-block"></div>
  //     <span class="polaroid-caption">campus life</span>
  //   </button>
  // becomes clickable, lets the user pick/replace/remove a photo, and the
  // photo (as a data URL) persists across refreshes via localStorage.

  function renderPolaroidState(photoBlock, dataUrl) {
    if (dataUrl) {
      photoBlock.innerHTML = '<img src="' + dataUrl + '" alt="">';
    } else {
      photoBlock.innerHTML = '<span class="photo-block-empty-label">stick a little<br>picture here ✦</span>';
    }
  }

  function ensurePolaroidModal() {
    var modal = document.getElementById("cb-polaroid-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "cb-modal";
    modal.id = "cb-polaroid-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="cb-modal-backdrop" data-close-polaroid-modal></div>' +
      '<div class="cb-modal-panel polaroid-modal-panel" role="dialog" aria-modal="true">' +
        '<button class="cb-modal-close" type="button" aria-label="Close" data-close-polaroid-modal>×</button>' +
        '<div id="cb-polaroid-modal-body"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close-polaroid-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        modal.classList.remove("is-open");
        document.body.classList.remove("modal-open");
      });
    });
    return modal;
  }

  function openPolaroidModal(polaroidId, photoBlock) {
    var modal = ensurePolaroidModal();
    var body = document.getElementById("cb-polaroid-modal-body");
    var current = getPolaroids()[polaroidId];

    body.innerHTML =
      '<h2>Add a little memory ✦</h2>' +
      '<p class="hand-note">a little picture for your corner</p>' +
      '<div class="polaroid-modal-preview" id="cb-polaroid-preview">' +
        (current ? '<img src="' + current + '" alt="">' : 'no photo yet') +
      '</div>' +
      '<input type="file" accept="image/*" id="cb-polaroid-file" hidden>' +
      '<div class="polaroid-modal-actions">' +
        '<button class="btn btn-primary" type="button" id="cb-polaroid-choose">' + (current ? "Change photo" : "Choose an image") + '</button>' +
        (current ? '<button class="btn btn-ghost" type="button" id="cb-polaroid-remove">Remove photo</button>' : '') +
      '</div>';

    var fileInput = document.getElementById("cb-polaroid-file");
    document.getElementById("cb-polaroid-choose").addEventListener("click", function () { fileInput.click(); });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        setPolaroidImage(polaroidId, dataUrl);
        renderPolaroidState(photoBlock, dataUrl);
        modal.classList.remove("is-open");
        document.body.classList.remove("modal-open");
        toast("Saved ✦");
      };
      reader.readAsDataURL(file);
    });

    var removeBtn = document.getElementById("cb-polaroid-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        removePolaroidImage(polaroidId);
        renderPolaroidState(photoBlock, null);
        modal.classList.remove("is-open");
        document.body.classList.remove("modal-open");
        toast("Removed");
      });
    }

    modal.classList.add("is-open");
    document.body.classList.add("modal-open");
  }

  function wirePolaroidElement(widget) {
    var id = widget.dataset.polaroidId;
    var photoBlock = widget.querySelector(".photo-block");
    if (!photoBlock) return;
    renderPolaroidState(photoBlock, getPolaroids()[id]);
    widget.addEventListener("click", function () { openPolaroidModal(id, photoBlock); });
  }

  function initPolaroid() {
    document.querySelectorAll(".polaroid-upload[data-polaroid-id]").forEach(wirePolaroidElement);
  }

  /* ---------------- storage: extra user-added polaroid slots ---------------- */
  // Lets a page offer an "add a polaroid" button. Slots are grouped by an
  // arbitrary group key (e.g. "dashboard") so different pages keep their
  // own lists. shape: { "<groupKey>": ["dashboard-1699999999999", ...] }

  function getCustomPolaroidSlots(groupKey) {
    try {
      var raw = localStorage.getItem(userKey(STORAGE_KEYS.customPolaroids));
      var all = raw ? JSON.parse(raw) : {};
      return all[groupKey] || [];
    } catch (e) {
      return [];
    }
  }

  function addCustomPolaroidSlot(groupKey, polaroidId) {
    var raw = localStorage.getItem(userKey(STORAGE_KEYS.customPolaroids));
    var all = {};
    try { all = raw ? JSON.parse(raw) : {}; } catch (e) { all = {}; }
    all[groupKey] = (all[groupKey] || []).concat([polaroidId]);
    localStorage.setItem(userKey(STORAGE_KEYS.customPolaroids), JSON.stringify(all));
  }

  function buildPolaroidElement(polaroidId, caption, rotDeg) {
    var widget = document.createElement("button");
    widget.className = "polaroid polaroid-upload";
    widget.type = "button";
    widget.dataset.polaroidId = polaroidId;
    widget.style.position = "relative";
    widget.style.setProperty("--rot", rotDeg + "deg");
    widget.innerHTML = '<div class="photo-block"></div><span class="polaroid-caption">' + caption + '</span>';
    return widget;
  }

  // Renders any previously-added custom slots for a group, then wires up
  // the "add" button (if present) to create new slots on click, persist
  // them, and open the picker immediately.
  function initPolaroidAdder(containerEl, groupKey, addBtnEl) {
    if (!containerEl) return;
    var captions = ["a little memory", "campus moment", "worth remembering"];
    getCustomPolaroidSlots(groupKey).forEach(function (id, i) {
      var widget = buildPolaroidElement(id, captions[i % captions.length], (i % 2 === 0 ? -1 : 1) * (2 + (i % 3)));
      if (addBtnEl) containerEl.insertBefore(widget, addBtnEl);
      else containerEl.appendChild(widget);
      wirePolaroidElement(widget);
    });

    if (addBtnEl) {
      addBtnEl.addEventListener("click", function () {
        var id = groupKey + "-" + Date.now();
        addCustomPolaroidSlot(groupKey, id);
        var rot = (Math.random() * 6 - 3).toFixed(1);
        var widget = buildPolaroidElement(id, "a little memory", rot);
        containerEl.insertBefore(widget, addBtnEl);
        wirePolaroidElement(widget);
        widget.click(); // open the picker right away
      });
    }
  }

  /* ---------------- mobile nav toggle (shared markup/pattern) ---------------- */

  function initMobileNav() {
    var navToggle = document.getElementById("nav-toggle");
    var mainNav = document.getElementById("main-nav") || document.getElementById("app-nav");
    if (!navToggle || !mainNav) return;

    navToggle.addEventListener("click", function () {
      var isOpen = mainNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    mainNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mainNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------------- Backend API Layer ---------------- */

  var API_BASE = (global.CB_API_BASE || "").replace(/\/$/, "");

  var api = {
    register: function(data) {
      return fetch(API_BASE + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "include",
        body: JSON.stringify(data)
      }).then(function(r) {
        return r.text().then(function(raw) {
          var body = {};
          try { body = raw ? JSON.parse(raw) : {}; } catch (e) { body = {}; }
          if (!r.ok) {
            return Object.assign({}, body, { error: body.error || ("Registration failed (" + r.status + ")") , status: r.status });
          }
          return body;
        });
      }).catch(function() {
        return { error: "Could not connect to the Campus Board server. Start Flask or check the deployed backend URL." };
      });
    },
    login: function(credentials) {
      return fetch(API_BASE + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials)
      }).then(function(r) { return r.json(); });
    },
    logout: function() {
      return fetch(API_BASE + "/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      }).then(function(r) { return r.json(); });
    },
    me: function() {
      return fetch(API_BASE + "/api/auth/me", {
        credentials: "include"
      }).then(function(r) {
        if (!r.ok) return { authenticated: false };
        return r.json();
      }).catch(function() { return { authenticated: false }; });
    },
    getNotices: function() {
      return fetch(API_BASE + "/api/notices", { credentials: "include" })
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    postNotice: function(notice) {
      return fetch(API_BASE + "/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(notice)
      })
      .then(function(r) {
        if (r.status === 403) {
          toast("Access denied: Class Representative authorization required.");
          return { error: "CR access required", status: 403 };
        }
        if (r.status === 401) {
          clearProfile();
          window.location.replace("index.html");
          return { error: "Authentication required", status: 401 };
        }
        return r.json();
      })
      .catch(function() { return null; });
    },
    deleteNotice: function(id) {
      return fetch(API_BASE + "/api/notices/" + encodeURIComponent(id), {
        method: "DELETE",
        credentials: "include"
      }).then(function(r) {
        if (r.status === 403) {
          toast("Only the Class Representative who posted it can delete it.");
          return { error: "CR access required", status: 403 };
        }
        if (r.status === 401) {
          clearProfile();
          window.location.replace("index.html");
          return { error: "Authentication required", status: 401 };
        }
        return r.text().then(function(raw) {
          var body = {};
          try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}
          return Object.assign({}, body, { status: r.status });
        });
      }).catch(function() { return null; });
    },
    getOpportunities: function() {
      return fetch(API_BASE + "/api/opportunities", { credentials: "include" })
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    getTimetable: function() {
      return fetch(API_BASE + "/api/timetable", { credentials: "include" })
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    parseTimetable: function(file) {
      var form = new FormData();
      form.append("image", file);
      return fetch(API_BASE + "/api/ai/parse-timetable", {
        method: "POST",
        credentials: "include",
        body: form
      }).then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    publishTimetable: function(timetable) {
      return fetch(API_BASE + "/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(timetable)
      }).then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    getCalendarEvents: function() {
      return fetch(API_BASE + "/api/calendar/events", { credentials: "include" })
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    postCalendarEvent: function(evt) {
      return fetch(API_BASE + "/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(evt)
      })
      .then(function(r) {
        if (r.status === 403) {
          toast("Access denied: Class Representative authorization required.");
          return { error: "CR access required", status: 403 };
        }
        if (r.status === 401) {
          clearProfile();
          window.location.replace("index.html");
          return { error: "Authentication required", status: 401 };
        }
        return r.json();
      })
      .catch(function() { return null; });
    },
    getProfile: function() {
      return fetch(API_BASE + "/api/users/profile", { credentials: "include" })
        .then(function(r) {
          if (r.status === 401) {
            clearProfile();
            window.location.replace("index.html");
            return null;
          }
          return r.json();
        })
        .catch(function() { return null; });
    },
    postProfile: function(profile) {
      return fetch(API_BASE + "/api/users/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profile)
      })
      .then(function(r) {
        if (r.status === 401) {
          clearProfile();
          window.location.replace("index.html");
          return null;
        }
        return r.json();
      })
      .catch(function() { return null; });
    },
    parseAnnouncement: function (text) {
      return fetch(API_BASE + "/api/ai/parse-announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: text, current_date: TODAY.toISOString().slice(0, 10) })
      })
      .then(function (res) {
        if (res.status === 403) {
          toast("Access denied: CR permissions required for AI parsing.");
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (data && data.success && data.parsed) return data.parsed;
        throw new Error("API parsing returned invalid payload");
      })
      .catch(function (err) {
        console.warn("Backend AI parse unavailable, using local fallback:", err);
        if (global.CB && global.CB.ai && global.CB.ai.parseAnnouncement) {
          return global.CB.ai.parseAnnouncement(text, { today: TODAY });
        }
        return null;
      });
    },

    prioritize: function (profile, items) {
      return fetch(API_BASE + "/api/ai/prioritize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profile: profile, items: items })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success && data.priorities) return data.priorities;
        throw new Error("API prioritize error");
      })
      .catch(function (err) {
        console.warn("Backend AI prioritize unavailable, using fallback:", err);
        return null;
      });
    },

    chatDigest: function (chatText) {
      return fetch(API_BASE + "/api/ai/chat-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ chat_text: chatText })
      })
      .then(function (res) {
        if (res.status === 403) {
          toast("Access denied: CR permissions required for Chat Digest.");
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (data && data.success && data.digest) return data.digest;
        throw new Error("API chat digest error");
      })
      .catch(function (err) {
        console.warn("Backend AI chat digest unavailable:", err);
        return null;
      });
    },

    dailyBriefing: function (profile, announcements, opportunities, events) {
      return fetch(API_BASE + "/api/ai/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profile: profile, announcements: announcements, opportunities: opportunities, events: events })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success && data.briefing) return data.briefing;
        throw new Error("API daily briefing error");
      })
      .catch(function (err) {
        console.warn("Backend AI briefing unavailable; using local briefing fallback:", err);
        var urgent = (announcements || []).filter(function (a) { return a.priority === "high" || a.deadline; }).slice(0, 2);
        var liked = (opportunities || []).filter(function (o) {
          return (profile.interests || []).some(function (i) { return String(o.category || "").toLowerCase().indexOf(String(i).toLowerCase()) !== -1; });
        }).slice(0, 2);
        return {
          headline: urgent.length ? urgent.length + " things you should not miss today" : "Your campus board for today",
          must_know: urgent.map(function (a) { return { title: a.title, meta: "Due " + (a.deadline || "soon") + " · " + (a.category || "UPDATE"), level: a.priority === "high" ? "red" : "yellow" }; }),
          might_like: liked.map(function (o) { return { title: o.title, reason: "Matches your interests" }; }),
          ai_generated: false
        };
      });
    },

    ask: function (question, profile, context) {
      return fetch(API_BASE + "/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: question, profile: profile, context: context })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success && data.result) return data.result;
        throw new Error("API ask error");
      })
      .catch(function (err) {
        console.warn("Backend AI ask error:", err);
        return null;
      });
    }
  };

  /* ---------------- Ask Campus Board Widget ---------------- */

  function initAskCampusBoard() {
    var fab = document.getElementById("ask-cb-fab");
    var panel = document.getElementById("ask-cb-panel");
    var closeBtn = document.getElementById("ask-cb-close");
    var sendBtn = document.getElementById("ask-cb-send");
    var input = document.getElementById("ask-cb-input");
    var msgContainer = document.getElementById("ask-cb-messages");

    if (!fab || !panel) return;

    fab.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && input) input.focus();
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        panel.hidden = true;
      });
    }

    function appendMessage(text, isUser) {
      var msgDiv = document.createElement("div");
      msgDiv.className = "ask-msg " + (isUser ? "user-msg" : "bot-msg");
      msgDiv.innerText = text;
      msgContainer.appendChild(msgDiv);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    function handleSend() {
      var q = input.value.trim();
      if (!q) return;

      appendMessage(q, true);
      input.value = "";

      var profile = getProfile();
      var context = {
        announcements: getAllAnnouncements(),
        opportunities: SAMPLE_OPPORTUNITIES,
        events: getAllEvents()
      };

      appendMessage("Thinking…", false);
      var thinkingMsg = msgContainer.lastChild;

      api.ask(q, profile, context).then(function (res) {
        if (thinkingMsg && thinkingMsg.parentNode) msgContainer.removeChild(thinkingMsg);
        if (res && res.answer) {
          appendMessage(res.answer, false);
        } else {
          appendMessage("Sorry, I couldn't reach the AI backend right now.", false);
        }
      });
    }

    if (sendBtn) sendBtn.addEventListener("click", handleSend);
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleSend();
      });
    }
  }

  /* ---------------- expose ---------------- */

  global.CB = {
    TODAY: TODAY,
    api: api,
    storage: {
      getProfile: getProfile,
      saveProfile: saveProfile,
      clearProfile: clearProfile,
      hasProfile: hasProfile,
      getSaved: getSaved,
      activeUserStorageId: activeUserStorageId,
      isSaved: isSaved,
      toggleSaved: toggleSaved,
      savedCount: savedCount,
      getTaskStates: getTaskStates,
      getTaskState: getTaskState,
      setTaskState: setTaskState,
      toggleTaskComplete: toggleTaskComplete,
      taskIsActionable: taskIsActionable,
      getCrAnnouncements: getCrAnnouncements,
      addCrAnnouncement: addCrAnnouncement,
      removeCrAnnouncement: removeCrAnnouncement,
      hideAnnouncement: hideAnnouncement,
      isAnnouncementHidden: isAnnouncementHidden,
      getNotifications: getNotifications,
      markNotificationRead: markNotificationRead,
      markAllNotificationsRead: markAllNotificationsRead,
      unreadNotificationCount: unreadNotificationCount,
      syncTaskReminders: syncTaskReminders,
      getCalendarNotes: getCalendarNotes,
      addCalendarNote: addCalendarNote,
      updateCalendarNote: updateCalendarNote,
      deleteCalendarNote: deleteCalendarNote,
      getPolaroids: getPolaroids,
      setPolaroidImage: setPolaroidImage,
      removePolaroidImage: removePolaroidImage
    },
    data: {
      announcements: SAMPLE_ANNOUNCEMENTS,
      opportunities: SAMPLE_OPPORTUNITIES,
      events: SAMPLE_EVENTS,
      getAllAnnouncements: getAllAnnouncements,
      setCommunityAnnouncements: setCommunityAnnouncements,
      getAllEvents: getAllEvents,
      timetable: SAMPLE_TIMETABLE
    },
    util: {
      formatDate: formatDate,
      matchesInterests: matchesInterests,
      debounce: debounce,
      toast: toast,
      toneForCategory: toneForCategory,
      avatarInitial: avatarInitial,
      audienceMatches: audienceMatches,
      classLabelForProfile: classLabelForProfile
    },
    initMobileNav: initMobileNav,
    initAppHeader: initAppHeader,
    initAskCampusBoard: initAskCampusBoard,
    guardAuthenticatedPage: guardAuthenticatedPage,
    initProtectedPage: initProtectedPage,
    ui: {
      renderInfoCards: renderInfoCards,
      openDetailModal: openDetailModal,
      initPolaroid: initPolaroid,
      initPolaroidAdder: initPolaroidAdder
    }
  };

  function initSignOutButtons() {
    document.querySelectorAll(".js-sign-out, [data-action='logout'], #sign-out-btn").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.preventDefault();
        api.logout().then(function() {
          clearProfile();
          window.location.replace("index.html");
        }).catch(function() {
          clearProfile();
          window.location.replace("index.html");
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function() {
    initMobileNav();
    initAskCampusBoard();
    initSignInModal();
    initSignOutButtons();
  });
})(window);

