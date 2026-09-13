/* =========================================================
   CAMPUS BOARD — calendar.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return;

  var profile = CB.storage.getProfile();
  var classLabel = profile.year + " · " + profile.branch + " · Section " + profile.section;
  var events = CB.data.events;

  function relevantToClass(e) {
    return e.forClass === "All Students" || e.forClass === classLabel;
  }

  var typeMeta = {
    exam: { label: "Exam", deadline: false },
    deadline: { label: "Deadline", deadline: true },
    workshop: { label: "Workshop", deadline: false },
    society: { label: "Society", deadline: false },
    event: { label: "Event", deadline: false },
    competition: { label: "Competition", deadline: false }
  };

  function toDetailItem(e) {
    return {
      id: e.id,
      title: e.title,
      description: (typeMeta[e.type] || {}).label + " on your Campus Board calendar.",
      category: (typeMeta[e.type] || {}).label || "Event",
      deadline: e.date,
      source: "Campus Calendar",
      venue: e.forClass,
      venueLabel: "For",
      savedType: "event"
    };
  }

  /* ---------------- month grid ---------------- */

  // Anchored to September 2026 to match the sample data above.
  var YEAR = 2026, MONTH = 8; // JS months are 0-indexed — 8 = September

  function renderMonth() {
    var grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";

    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) {
      var el = document.createElement("div");
      el.className = "calendar-weekday";
      el.textContent = d;
      grid.appendChild(el);
    });

    var firstDay = new Date(YEAR, MONTH, 1).getDay();
    var daysInMonth = new Date(YEAR, MONTH + 1, 0).getDate();
    var todayIso = "2026-09-12"; // fixed "today" for this prototype, matches sample data

    var eventsByDate = {};
    events.filter(relevantToClass).forEach(function (e) {
      if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
      eventsByDate[e.date].push(e);
    });

    for (var i = 0; i < firstDay; i++) {
      var empty = document.createElement("div");
      empty.className = "calendar-cell is-empty";
      grid.appendChild(empty);
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var iso = YEAR + "-09-" + String(day).padStart(2, "0");
      var cell = document.createElement("div");
      cell.className = "calendar-cell" + (iso === todayIso ? " is-today" : "");
      cell.innerHTML = '<span class="cell-date">' + day + '</span>';

      (eventsByDate[iso] || []).forEach(function (e) {
        var dot = document.createElement("span");
        dot.className = "calendar-event-dot" + ((typeMeta[e.type] || {}).deadline ? " is-deadline" : "");
        dot.textContent = e.title;
        dot.addEventListener("click", function () { CB.ui.openDetailModal(toDetailItem(e)); });
        cell.appendChild(dot);
      });

      grid.appendChild(cell);
    }
  }

  /* ---------------- upcoming list ---------------- */

  function renderUpcoming() {
    var list = document.getElementById("upcoming-list");
    list.innerHTML = "";
    var upcoming = events.filter(relevantToClass).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    if (!upcoming.length) {
      list.innerHTML = '<p class="search-empty">Nothing scheduled right now.</p>';
      return;
    }

    upcoming.forEach(function (e) {
      var meta = typeMeta[e.type] || { label: "Event" };
      var card = document.createElement("div");
      card.className = "info-card" + (meta.deadline ? " is-urgent" : " is-latest");
      card.innerHTML =
        '<div class="info-card-head">' +
          '<div><span class="info-card-tag">' + meta.label + '</span><p class="info-card-title">' + e.title + '</p></div>' +
        '</div>' +
        '<div class="info-card-meta"><span>' + CB.util.formatDate(e.date) + '</span><span>' + e.forClass + '</span></div>';
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
  });

  renderMonth();
  renderUpcoming();
})();
