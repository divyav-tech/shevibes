/* =========================================================
   CAMPUS BOARD — past-events.js
   Archive actionable deadlines for a short window after they pass.
   ========================================================= */
(function () {
  "use strict";

  CB.initProtectedPage(function () {
    var grid = document.getElementById("past-events-grid");
    var filter = "all";
    var announcements = [];
    var events = [];

    function isoToday() {
      var d = CB.TODAY;
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function daysBetween(a, b) {
      var da = new Date(a + "T00:00:00");
      var db = new Date(b + "T00:00:00");
      return Math.round((db - da) / 86400000);
    }

    function mapNotice(row) {
      return {
        id: String(row.id), title: row.title,
        description: row.description || row.summary || row.content || "",
        category: row.category ? String(row.category).charAt(0).toUpperCase() + String(row.category).slice(1).toLowerCase() : "General",
        deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
        source: row.source || "Campus Board",
        priority: row.priority || "medium",
        venue: row.venue || "Not specified",
        aiGenerated: Boolean(row.aiGenerated || row.ai_generated)
      };
    }

    function mapEvent(row) {
      var category = String(row.category || "event").toLowerCase();
      var actionable = category === "deadline" || category === "academic";
      return {
        id: String(row.id), title: row.title,
        description: row.description || "Campus Board calendar item.",
        category: category === "academic" ? "Exam" : "Deadline",
        deadline: row.event_date ? String(row.event_date).slice(0, 10) : null,
        source: row.location || "Campus Calendar",
        priority: row.priority || "medium",
        venue: row.location || "Not specified",
        savedType: "event",
        actionable: actionable
      };
    }

    function buildItems() {
      var today = isoToday();
      var items = [];
      announcements.filter(function (a) { return a.deadline; }).forEach(function (a) {
        var age = daysBetween(a.deadline, today);
        var task = CB.storage.getTaskState("announcement", a.id);
        if ((task.completed && age >= 0) || (!task.completed && age >= 1 && age <= 3)) {
          items.push(Object.assign({}, a, { taskType: "announcement", status: task.completed ? "completed" : "missed", age: age }));
        }
      });
      events.filter(function (e) { return e.actionable && e.deadline; }).forEach(function (e) {
        var age = daysBetween(e.deadline, today);
        var task = CB.storage.getTaskState("event", e.id);
        if ((task.completed && age >= 0) || (!task.completed && age >= 1 && age <= 3)) {
          items.push(Object.assign({}, e, { taskType: "event", status: task.completed ? "completed" : "missed", age: age }));
        }
      });
      return items.sort(function (a, b) { return b.deadline.localeCompare(a.deadline); });
    }

    function render() {
      var items = buildItems().filter(function (item) { return filter === "all" || item.status === filter; });
      grid.innerHTML = "";
      if (!items.length) {
        grid.innerHTML = '<div class="past-events-empty"><div class="past-empty-mark">✦</div><h3>' + (filter === "all" ? "Nothing to archive yet." : "No " + filter + " items here.") + '</h3><p>Come back after a few deadlines have passed.</p></div>';
        return;
      }
      items.forEach(function (item, i) {
        var task = CB.storage.getTaskState(item.taskType, item.id);
        var card = document.createElement("article");
        card.className = "past-event-card " + item.status + (item.status === "completed" ? " is-completed" : "");
        card.style.setProperty("--rot", ((i % 2 === 0 ? -1 : 1) * (1 + (i % 3) * 0.6)) + "deg");
        var badge = item.status === "completed" ? '<span class="past-status completed">✓ COMPLETED</span>' : '<span class="past-status missed">MISSED!</span>';
        card.innerHTML =
          '<div class="past-event-top"><span class="info-card-tag">' + item.category + '</span>' + badge + '</div>' +
          '<h2 class="past-event-title">' + item.title + '</h2>' +
          '<p class="past-event-desc">' + item.description + '</p>' +
          '<div class="past-event-meta"><span>Deadline: <strong>' + CB.util.formatDate(item.deadline) + '</strong></span><span>' + item.source + '</span></div>' +
          '<div class="past-event-actions"><button class="task-complete-btn' + (task.completed ? ' is-completed' : '') + '" data-complete-past="' + item.taskType + ':' + item.id + '">' + (task.completed ? '✓ Completed' : '○ Mark complete') + '</button><button class="btn btn-ghost past-details" type="button">View details</button></div>' +
          (item.status === "missed" ? '<p class="missed-note">This stays here for ' + Math.max(1, 3 - item.age) + ' more day' + (Math.max(1, 3 - item.age) === 1 ? '' : 's') + '.</p>' : '<p class="completed-note">You checked this off. Nice. ✦</p>');
        card.querySelector("[data-complete-past]").addEventListener("click", function () {
          var next = CB.storage.toggleTaskComplete(item.taskType, item.id);
          CB.util.toast(next.completed ? "Marked complete ✓" : "Marked as incomplete");
          render();
        });
        card.querySelector(".past-details").addEventListener("click", function () {
          CB.ui.openDetailModal(Object.assign({}, item, { savedType: item.taskType }));
        });
        grid.appendChild(card);
      });
    }

    document.querySelectorAll("#past-filter-chips [data-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filter = btn.dataset.filter;
        document.querySelectorAll("#past-filter-chips [data-filter]").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
        render();
      });
    });

    function load() {
      var noticesPromise = CB.api.getNotices();
      var eventsPromise = CB.api.getCalendarEvents();
      Promise.all([noticesPromise, eventsPromise]).then(function (res) {
        var noticeRows = res[0] && Array.isArray(res[0].notices) && res[0].notices.length ? res[0].notices : CB.data.getAllAnnouncements();
        var eventRows = res[1] && Array.isArray(res[1].events) && res[1].events.length ? res[1].events : CB.data.getAllEvents().map(function (e) { return { id: e.id, title: e.title, description: "Campus Board calendar item.", event_date: e.date, category: e.type === "exam" ? "academic" : e.type, location: e.venue }; });
        announcements = noticeRows.map(mapNotice);
        events = eventRows.map(mapEvent);
        render();
      }).catch(function () {
        announcements = CB.data.getAllAnnouncements();
        events = CB.data.getAllEvents().map(function (e) { return { id: e.id, title: e.title, description: "Campus Board calendar item.", event_date: e.date, category: e.type === "exam" ? "academic" : e.type, location: e.venue }; }).map(mapEvent);
        render();
      });
    }

    document.addEventListener("cb:task-changed", render);
    load();
  });
})();
