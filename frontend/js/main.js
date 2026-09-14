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
    notifications: "campusboard.notifications",
    calendarNotes: "campusboard.calendarNotes",
    polaroids: "campusboard.polaroids",
    customPolaroids: "campusboard.customPolaroids"
  };

  // Anchored "today" for this prototype — keeps deadlines, priorities and
  // the calendar's default month consistent with the sample data below.
  var TODAY = new Date(2026, 8, 12); // 12 September 2026

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
  }

  function clearProfile() {
    localStorage.removeItem(STORAGE_KEYS.profile);
  }

  function hasProfile() {
    return !!getProfile();
  }

  /* ---------------- storage: saved items ---------------- */
  // shape: { announcement: ["a1","a3"], opportunity: ["o2"], event: ["e1"] }

  function getSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.saved);
      return raw ? JSON.parse(raw) : { announcement: [], opportunity: [], event: [] };
    } catch (e) {
      return { announcement: [], opportunity: [], event: [] };
    }
  }

  function isSaved(type, id) {
    var saved = getSaved();
    return (saved[type] || []).indexOf(id) !== -1;
  }

  function toggleSaved(type, id) {
    var saved = getSaved();
    if (!saved[type]) saved[type] = [];
    var idx = saved[type].indexOf(id);
    var nowSaved;
    if (idx === -1) {
      saved[type].push(id);
      nowSaved = true;
    } else {
      saved[type].splice(idx, 1);
      nowSaved = false;
    }
    localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(saved));
    return nowSaved;
  }

  function savedCount() {
    var saved = getSaved();
    return (saved.announcement || []).length + (saved.opportunity || []).length + (saved.event || []).length;
  }

  /* ---------------- storage: CR-posted announcements ---------------- */

  function getCrAnnouncements() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.crAnnouncements);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addCrAnnouncement(announcement) {
    var list = getCrAnnouncements();
    list.unshift(announcement);
    localStorage.setItem(STORAGE_KEYS.crAnnouncements, JSON.stringify(list));
    return list;
  }

  /* ---------------- storage: calendar notes (student's own) ---------------- */
  // shape: [{ id, date: "YYYY-MM-DD", text, type: "Deadline"|"Exam"|"Event"|"Reminder" }]

  function getCalendarNotes() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.calendarNotes);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addCalendarNote(note) {
    var list = getCalendarNotes();
    note.id = "note-" + Date.now();
    list.push(note);
    localStorage.setItem(STORAGE_KEYS.calendarNotes, JSON.stringify(list));
    return note;
  }

  function updateCalendarNote(id, changes) {
    var list = getCalendarNotes().map(function (n) {
      return n.id === id ? Object.assign({}, n, changes) : n;
    });
    localStorage.setItem(STORAGE_KEYS.calendarNotes, JSON.stringify(list));
    return list;
  }

  function deleteCalendarNote(id) {
    var list = getCalendarNotes().filter(function (n) { return n.id !== id; });
    localStorage.setItem(STORAGE_KEYS.calendarNotes, JSON.stringify(list));
    return list;
  }

  /* ---------------- storage: polaroid photos ---------------- */
  // shape: { "<polaroid-id>": "data:image/...;base64,..." }

  function getPolaroids() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.polaroids);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function setPolaroidImage(polaroidId, dataUrl) {
    var all = getPolaroids();
    all[polaroidId] = dataUrl;
    localStorage.setItem(STORAGE_KEYS.polaroids, JSON.stringify(all));
    return all;
  }

  function removePolaroidImage(polaroidId) {
    var all = getPolaroids();
    delete all[polaroidId];
    localStorage.setItem(STORAGE_KEYS.polaroids, JSON.stringify(all));
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
      var raw = localStorage.getItem(STORAGE_KEYS.notifications);
      if (!raw) {
        localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(DEFAULT_NOTIFICATIONS));
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
    localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(list));
    return list;
  }

  function markAllNotificationsRead() {
    var list = getNotifications().map(function (n) {
      n.read = true;
      return n;
    });
    localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(list));
    return list;
  }

  function unreadNotificationCount() {
    return getNotifications().filter(function (n) { return !n.read; }).length;
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

  function getAllAnnouncements() {
    var crPosted = getCrAnnouncements();
    return crPosted.concat(SAMPLE_ANNOUNCEMENTS);
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

  function guardAuthenticatedPage() {
    // Every app page (dashboard, announcements, etc.) needs a profile.
    // If someone opens one directly without onboarding, send them back.
    if (!hasProfile()) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  }

  function initAppHeader() {
    if (!guardAuthenticatedPage()) return false;
    initAvatar();
    initSearch();
    initNotifications();
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
    body.innerHTML =
      '<span class="info-card-tag">' + item.category + '</span>' +
      '<h2 style="margin-top:10px;">' + item.title + '</h2>' +
      '<p style="margin-top:10px;color:var(--color-text-muted);">' + item.description + '</p>' +
      '<dl class="trust-fields" style="margin-top:18px;">' +
        '<div><dt>Deadline</dt><dd>' + formatDate(item.deadline) + '</dd></div>' +
        '<div><dt>' + (item.venueLabel || "Venue") + '</dt><dd class="' + (item.venue === "Not specified" || !item.venue ? "not-specified" : "") + '">' + (item.venue || "Not specified") + '</dd></div>' +
      '</dl>' +
      '<p style="margin-top:14px;font-size:0.85rem;color:var(--color-text-muted);">Source: <strong style="color:var(--color-text);">' + item.source + '</strong></p>' +
      (item.aiGenerated ? '<p class="ai-trust-line">✦ AI understood this from the CR\u2019s original message — some details may be edited by hand.</p>' : '') +
      (item.original ? '<a href="#" class="trust-original" style="margin-top:14px;display:inline-block;">Original Announcement →</a>' : '') +
      '<div style="margin-top:22px;"><button class="btn btn-ghost" type="button" id="cb-shared-save-btn">' +
        (isCurrentlySaved ? "★ Saved — click to remove" : "☆ Save this") +
      '</button></div>';

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
      card.innerHTML =
        '<div class="info-card-head">' +
          '<div>' +
            '<span class="info-card-tag">' + item.category + '</span>' +
            '<p class="info-card-title">' + item.title + '</p>' +
          '</div>' +
          '<button class="info-card-save' + (isSaved(type, item.id) ? " is-saved" : "") + '" data-save="' + type + ':' + item.id + '" aria-label="Save">' +
            (isSaved(type, item.id) ? "★" : "☆") +
          '</button>' +
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
      var raw = localStorage.getItem(STORAGE_KEYS.customPolaroids);
      var all = raw ? JSON.parse(raw) : {};
      return all[groupKey] || [];
    } catch (e) {
      return [];
    }
  }

  function addCustomPolaroidSlot(groupKey, polaroidId) {
    var raw = localStorage.getItem(STORAGE_KEYS.customPolaroids);
    var all = {};
    try { all = raw ? JSON.parse(raw) : {}; } catch (e) { all = {}; }
    all[groupKey] = (all[groupKey] || []).concat([polaroidId]);
    localStorage.setItem(STORAGE_KEYS.customPolaroids, JSON.stringify(all));
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

  var API_BASE = "";

  var api = {
    getNotices: function() {
      return fetch(API_BASE + "/api/notices")
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    postNotice: function(notice) {
      return fetch(API_BASE + "/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notice)
      })
      .then(function(r) { return r.json(); })
      .catch(function() { return null; });
    },
    getOpportunities: function() {
      return fetch(API_BASE + "/api/opportunities")
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    getCalendarEvents: function() {
      return fetch(API_BASE + "/api/calendar/events")
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    postCalendarEvent: function(evt) {
      return fetch(API_BASE + "/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evt)
      })
      .then(function(r) { return r.json(); })
      .catch(function() { return null; });
    },
    getProfile: function() {
      return fetch(API_BASE + "/api/users/profile")
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
    },
    postProfile: function(profile) {
      return fetch(API_BASE + "/api/users/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      })
      .then(function(r) { return r.json(); })
      .catch(function() { return null; });
    },
    parseAnnouncement: function (text) {
      return fetch(API_BASE + "/api/ai/parse-announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, current_date: "2026-09-12" })
      })
      .then(function (res) { return res.json(); })
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
        body: JSON.stringify({ chat_text: chatText })
      })
      .then(function (res) { return res.json(); })
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
        body: JSON.stringify({ profile: profile, announcements: announcements, opportunities: opportunities, events: events })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success && data.briefing) return data.briefing;
        throw new Error("API daily briefing error");
      })
      .catch(function (err) {
        console.warn("Backend AI briefing unavailable:", err);
        return null;
      });
    },

    ask: function (question, profile, context) {
      return fetch(API_BASE + "/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      isSaved: isSaved,
      toggleSaved: toggleSaved,
      savedCount: savedCount,
      getCrAnnouncements: getCrAnnouncements,
      addCrAnnouncement: addCrAnnouncement,
      getNotifications: getNotifications,
      markNotificationRead: markNotificationRead,
      markAllNotificationsRead: markAllNotificationsRead,
      unreadNotificationCount: unreadNotificationCount,
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
      getAllEvents: getAllEvents
    },
    util: {
      formatDate: formatDate,
      matchesInterests: matchesInterests,
      debounce: debounce,
      toast: toast,
      toneForCategory: toneForCategory,
      avatarInitial: avatarInitial
    },
    initMobileNav: initMobileNav,
    initAppHeader: initAppHeader,
    initAskCampusBoard: initAskCampusBoard,
    guardAuthenticatedPage: guardAuthenticatedPage,
    ui: {
      renderInfoCards: renderInfoCards,
      openDetailModal: openDetailModal,
      initPolaroid: initPolaroid,
      initPolaroidAdder: initPolaroidAdder
    }
  };

  document.addEventListener("DOMContentLoaded", function() {
    initMobileNav();
    initAskCampusBoard();
  });
})(window);
