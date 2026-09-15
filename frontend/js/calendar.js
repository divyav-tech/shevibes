/* =========================================================
   CAMPUS BOARD — calendar.js
   Month navigation (arrows only, full year), sticky-note
   events, click-a-day to add a personal note.
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return;

  var profile = CB.storage.getProfile();
  var classLabel = profile.year + " · " + profile.branch + " · Section " + profile.section;

  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  var typeMeta = {
    exam: { label: "Exam", big: true },
    deadline: { label: "Deadline", big: true },
    workshop: { label: "Workshop", big: false },
    society: { label: "Society", big: false },
    event: { label: "Event", big: false },
    competition: { label: "Competition", big: false }
  };

  function relevantToClass(e) {
    return e.forClass === "All Students" || e.forClass === classLabel;
  }

  function toDetailItem(e) {
    var meta = typeMeta[e.type] || { label: "Event" };
    return {
      id: e.id,
      title: e.title,
      description: meta.label + " on your Campus Board calendar." + (e.time ? " · " + e.time : ""),
      category: meta.label,
      deadline: e.date,
      source: e.aiGenerated ? classLabel + " CR" : "Campus Calendar",
      venue: e.venue || e.forClass || "Not specified",
      venueLabel: e.venue ? "Venue" : "For",
      aiGenerated: !!e.aiGenerated,
      savedType: "event"
    };
  }

  function noteToDetailItem(n) {
    return {
      id: n.id,
      title: n.text,
      description: "A note you added for yourself.",
      category: n.type,
      deadline: n.date,
      source: "My note",
      venue: "Personal",
      savedType: null
    };
  }

  /* ---------------- state: which month is showing ---------------- */

  var todayParts = CB.TODAY;
  var currentYear = todayParts.getFullYear();
  var currentMonth = todayParts.getMonth(); // 0-indexed, anchored to Sept 2026

  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoOf(y, m, d) { return y + "-" + pad2(m + 1) + "-" + pad2(d); }
  function todayIso() { return isoOf(todayParts.getFullYear(), todayParts.getMonth(), todayParts.getDate()); }

  var campusEvents = [];

  function mapCalendarCategory(category) {
    var key = String(category || "").toLowerCase();
    if (key === "deadline") return "deadline";
    if (key === "academic") return "exam";
    if (key === "opportunity") return "competition";
    if (key === "event" || key === "personal") return "event";
    return "event";
  }

  function mapCalendarEvent(row) {
    return {
      id: String(row.id),
      title: row.title,
      date: row.event_date ? String(row.event_date).slice(0, 10) : "",
      time: row.event_time || null,
      venue: row.location || null,
      type: mapCalendarCategory(row.category),
      forClass: "All Students",
      aiGenerated: Boolean(row.announcement_id)
    };
  }

  function getCampusEvents() {
    return campusEvents.filter(relevantToClass);
  }

  /* ---------------- month grid ---------------- */

  function eventsAndNotesByDate() {
    var events = getCampusEvents();
    var notes = CB.storage.getCalendarNotes();
    var byDate = {};
    events.forEach(function (e) {
      (byDate[e.date] = byDate[e.date] || []).push({ kind: "event", data: e });
    });
    notes.forEach(function (n) {
      (byDate[n.date] = byDate[n.date] || []).push({ kind: "note", data: n });
    });
    return byDate;
  }

  function toneClassFor(kind, data) {
    if (kind === "note") return "tone-mynote";
    return "tone-" + data.type; // tone-deadline / tone-exam / tone-event / tone-workshop / tone-society / tone-competition
  }

  function renderMonth() {
    document.getElementById("cal-month-label").textContent = MONTH_NAMES[currentMonth] + " " + currentYear;

    var grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";

    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) {
      var el = document.createElement("div");
      el.className = "calendar-weekday";
      el.textContent = d;
      grid.appendChild(el);
    });

    var firstDay = new Date(currentYear, currentMonth, 1).getDay();
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    var byDate = eventsAndNotesByDate();

    for (var i = 0; i < firstDay; i++) {
      var empty = document.createElement("div");
      empty.className = "calendar-cell is-empty";
      grid.appendChild(empty);
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var iso = isoOf(currentYear, currentMonth, day);
      var cell = document.createElement("div");
      cell.className = "calendar-cell" + (iso === todayIso() ? " is-today" : "");
      cell.innerHTML = '<span class="cell-date">' + day + '</span><span class="calendar-cell-add-hint">+ add</span>';

      (byDate[iso] || []).slice(0, 4).forEach(function (entry) {
        var pill = document.createElement("span");
        pill.className = "cal-note cal-note-pill " + toneClassFor(entry.kind, entry.data);
        pill.textContent = entry.kind === "event" ? entry.data.title : "📌 " + entry.data.text;
        pill.addEventListener("click", function (ev) {
          ev.stopPropagation();
          CB.ui.openDetailModal(entry.kind === "event" ? toDetailItem(entry.data) : noteToDetailItem(entry.data));
        });
        cell.appendChild(pill);
      });

      cell.addEventListener("click", function () {
        var d = this.querySelector(".cell-date").textContent;
        openAddDayModal(isoOf(currentYear, currentMonth, parseInt(d, 10)));
      });

      grid.appendChild(cell);
    }

    renderStickyWall(byDate);
  }

  /* ---------------- sticky wall (large, readable notes) ---------------- */

  function renderStickyWall(byDate) {
    var wall = document.getElementById("cal-sticky-wall");
    wall.innerHTML = "";

    var items = [];
    Object.keys(byDate).forEach(function (iso) {
      var d = new Date(iso + "T00:00:00");
      if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) return;
      byDate[iso].forEach(function (entry) {
        var isImportant = entry.kind === "note" || (entry.data.priority === "high") || (typeMeta[entry.data.type] || {}).big;
        if (isImportant) items.push(entry);
      });
    });

    if (!items.length) {
      wall.innerHTML = '<p class="search-empty">Nothing pinned for ' + MONTH_NAMES[currentMonth] + ' yet — click any date to add one.</p>';
      return;
    }

    items.sort(function (a, b) { return (a.data.date || "").localeCompare(b.data.date || ""); });

    items.forEach(function (entry, i) {
      var note = document.createElement("div");
      var rot = (i % 2 === 0 ? -1 : 1) * (2 + (i % 3));
      var deco = i % 3 === 0 ? "clip" : (i % 3 === 1 ? "tape tape-center" : "pin");

      if (entry.kind === "note") {
        var n = entry.data;
        note.className = "cal-sticky-big tone-mynote";
        note.style.setProperty("--rot", rot + "deg");
        note.innerHTML =
          '<span class="' + deco + '"></span>' +
          '<span class="cal-sticky-big-mynote-label">📌 MY NOTE</span>' +
          '<p class="cal-sticky-big-title">' + n.text + '</p>' +
          '<p class="cal-sticky-big-meta">' + n.type + ' · ' + CB.util.formatDate(n.date) + '</p>';
        note.addEventListener("click", function () { CB.ui.openDetailModal(noteToDetailItem(n)); });
      } else {
        var e = entry.data;
        var meta = typeMeta[e.type] || { label: "Event" };
        note.className = "cal-sticky-big " + toneClassFor("event", e);
        note.style.setProperty("--rot", rot + "deg");
        note.innerHTML =
          '<span class="' + deco + '"></span>' +
          '<span class="cal-sticky-big-tag">' + (e.priority === "high" ? "🔴 " : "") + meta.label + '</span>' +
          '<p class="cal-sticky-big-title">' + e.title + '</p>' +
          '<p class="cal-sticky-big-meta">Due: ' + CB.util.formatDate(e.date) + (e.time ? " · " + e.time : "") + '</p>';
        note.addEventListener("click", function () { CB.ui.openDetailModal(toDetailItem(e)); });
      }
      wall.appendChild(note);
    });
  }

  /* ---------------- month nav ---------------- */

  document.getElementById("cal-prev").addEventListener("click", function () {
    currentMonth -= 1;
    if (currentMonth < 0) { currentMonth = 11; currentYear -= 1; }
    renderMonth();
  });
  document.getElementById("cal-next").addEventListener("click", function () {
    currentMonth += 1;
    if (currentMonth > 11) { currentMonth = 0; currentYear += 1; }
    renderMonth();
  });

  /* ---------------- upcoming list ---------------- */

  function renderUpcoming() {
    var list = document.getElementById("upcoming-list");
    list.innerHTML = "";
    var upcoming = getCampusEvents().slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    if (!upcoming.length) {
      list.innerHTML = '<p class="search-empty">Nothing scheduled right now.</p>';
      return;
    }

    upcoming.forEach(function (e) {
      var meta = typeMeta[e.type] || { label: "Event" };
      var card = document.createElement("div");
      card.className = "info-card " + toneClassFor("event", e);
      card.innerHTML =
        '<div class="info-card-head">' +
          '<div><span class="info-card-tag">' + meta.label + '</span><p class="info-card-title">' + e.title + '</p></div>' +
        '</div>' +
        '<div class="info-card-meta"><span>' + CB.util.formatDate(e.date) + (e.time ? " · " + e.time : "") + '</span><span>' + (e.venue || e.forClass) + '</span></div>' +
        (e.aiGenerated ? '<span class="ai-badge">AI sorted this</span>' : '');
      card.addEventListener("click", function () { CB.ui.openDetailModal(toDetailItem(e)); });
      list.appendChild(card);
    });
  }

  /* ---------------- tabs ---------------- */

  var tabMonth = document.getElementById("tab-month");
  var tabUpcoming = document.getElementById("tab-upcoming");
  var monthView = document.getElementById("month-view");
  var upcomingView = document.getElementById("upcoming-view");

  tabMonth.addEventListener("click", function () {
    tabMonth.classList.add("is-active");
    tabUpcoming.classList.remove("is-active");
    monthView.hidden = false;
    upcomingView.hidden = true;
  });
  tabUpcoming.addEventListener("click", function () {
    tabUpcoming.classList.add("is-active");
    tabMonth.classList.remove("is-active");
    upcomingView.hidden = false;
    monthView.hidden = true;
    renderUpcoming();
  });

  /* ---------------- add-to-day modal ---------------- */

  var dayModal = document.getElementById("add-day-modal");
  var dayModalDate = null; // ISO string of the day currently open
  var selectedNoteType = "Deadline";

  function openAddDayModal(iso) {
    dayModalDate = iso;
    var d = new Date(iso + "T00:00:00");
    document.getElementById("add-day-date-label").textContent = MONTH_NAMES[d.getMonth()] + " " + d.getDate();
    document.getElementById("add-day-text").value = "";
    selectedNoteType = "Deadline";
    document.querySelectorAll(".add-day-type-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.noteType === selectedNoteType);
    });
    renderExistingDayNotes();
    dayModal.classList.add("is-open");
    document.body.classList.add("modal-open");
  }
  function closeAddDayModal() {
    dayModal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
  }
  dayModal.querySelectorAll("[data-close-day-modal]").forEach(function (btn) {
    btn.addEventListener("click", closeAddDayModal);
  });

  document.querySelectorAll(".add-day-type-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedNoteType = btn.dataset.noteType;
      document.querySelectorAll(".add-day-type-btn").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
    });
  });

  function renderExistingDayNotes() {
    var container = document.getElementById("day-notes-existing");
    var notes = CB.storage.getCalendarNotes().filter(function (n) { return n.date === dayModalDate; });
    container.innerHTML = "";
    notes.forEach(function (n) {
      var row = document.createElement("div");
      row.className = "day-notes-existing-item";
      row.innerHTML = '<span>📌 ' + n.text + ' <em style="opacity:.6;">(' + n.type + ')</em></span><button type="button">Delete</button>';
      row.querySelector("button").addEventListener("click", function () {
        CB.storage.deleteCalendarNote(n.id);
        renderExistingDayNotes();
        renderMonth();
      });
      container.appendChild(row);
    });
  }

  document.getElementById("add-day-save").addEventListener("click", function () {
    var text = document.getElementById("add-day-text").value.trim();
    if (!text) { CB.util.toast("Write something first"); return; }
    CB.storage.addCalendarNote({ date: dayModalDate, text: text, type: selectedNoteType });
    CB.util.toast("Pinned for later ✦");
    closeAddDayModal();
    renderMonth();
  });

  var request = CB.api && CB.api.getCalendarEvents
    ? CB.api.getCalendarEvents()
    : Promise.resolve(null);

  Promise.resolve(request).then(function (res) {
    if (res && Array.isArray(res.events) && res.events.length) {
      campusEvents = res.events.map(mapCalendarEvent);
    } else {
      // Keep demo deadlines/events visible when DB has no seeded calendar rows.
      campusEvents = (CB.data.events || []).map(mapCalendarEvent);
    }
    renderMonth();
  }).catch(function (err) {
    console.warn("Calendar events API unavailable; using local campus events", err);
    campusEvents = (CB.data.events || []).map(mapCalendarEvent);
    renderMonth();
  });
})();
