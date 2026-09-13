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
    exam: { label: "Exam", deadline: false, chipClass: "is-exam" },
    deadline: { label: "Deadline", deadline: true, chipClass: "is-deadline" },
    workshop: { label: "Workshop", deadline: false, chipClass: "is-workshop" },
    society: { label: "Society", deadline: false, chipClass: "is-society" },
    event: { label: "Event", deadline: false, chipClass: "is-event" },
    competition: { label: "Competition", deadline: false, chipClass: "is-competition" }
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

  // Anchored to September 2026 to match the sample data — prev/next
  // navigation works for any month via plain date math; months with
  // no sample events simply render an empty grid, nothing crashes.
  var TODAY_ISO = "2026-09-12";
  var viewYear = 2026, viewMonth = 8; // JS months are 0-indexed — 8 = September

  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function pad(n) { return String(n).padStart(2, "0"); }

  function renderMonth() {
    document.getElementById("calendar-month-title").textContent = MONTH_NAMES[viewMonth];

    var grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";

    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) {
      var el = document.createElement("div");
      el.className = "calendar-weekday";
      el.textContent = d;
      grid.appendChild(el);
    });

    var firstDay = new Date(viewYear, viewMonth, 1).getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

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
      var iso = viewYear + "-" + pad(viewMonth + 1) + "-" + pad(day);
      var isToday = iso === TODAY_ISO;
      var cell = document.createElement("div");
      cell.className = "calendar-cell" + (isToday ? " is-today" : "");
      cell.innerHTML = isToday
        ? '<span class="today-sticker"><span class="today-sticker-num">' + day + '</span><span class="today-sticker-label">TODAY ✦</span></span>'
        : '<span class="cell-date">' + day + '</span>';

      (eventsByDate[iso] || []).forEach(function (e) {
        var meta = typeMeta[e.type] || {};
        var chip = document.createElement("span");
        chip.className = "calendar-event-chip " + (meta.chipClass || "is-event");
        chip.textContent = e.title;
        chip.addEventListener("click", function () { CB.ui.openDetailModal(toDetailItem(e)); });
        cell.appendChild(chip);
      });

      grid.appendChild(cell);
    }
  }

  document.getElementById("cal-prev").addEventListener("click", function () {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderMonth();
  });
  document.getElementById("cal-next").addEventListener("click", function () {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderMonth();
  });

  /* ---------------- upcoming — pinned timeline ---------------- */

  var DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  function renderUpcoming() {
    var list = document.getElementById("upcoming-list");
    list.innerHTML = "";
    var upcoming = events.filter(relevantToClass).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    if (!upcoming.length) {
      list.innerHTML = '<p class="search-empty">Nothing scheduled right now.</p>';
      return;
    }

    upcoming.forEach(function (e) {
      var meta = typeMeta[e.type] || { label: "Event", chipClass: "is-event" };
      var d = new Date(e.date + "T00:00:00");
      var dayName = DAY_NAMES[d.getDay()];
      var dayNum = d.getDate();

      var item = document.createElement("div");
      item.className = "timeline-item " + meta.chipClass;
      item.innerHTML =
        '<div class="timeline-date">' + dayName + '<strong>' + dayNum + '</strong></div>' +
        '<span class="timeline-marker"></span>' +
        '<div class="timeline-body">' +
          '<p class="timeline-title">' + e.title + '</p>' +
          '<p class="timeline-tag">' + meta.label + ' · ' + e.forClass + '</p>' +
        '</div>';
      item.addEventListener("click", function () { CB.ui.openDetailModal(toDetailItem(e)); });
      list.appendChild(item);
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
