/* =========================================================
   CAMPUS BOARD — dashboard.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return; // redirects to index.html if no profile

  var profile = CB.storage.getProfile();
  var announcements = CB.data.getAllAnnouncements();
  var opportunities = CB.data.opportunities;
  var events = CB.data.events;
  var classLabel = profile.year + " · " + profile.branch + " · Section " + profile.section;

  var hour = new Date().getHours();
  var greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.getElementById("welcome-heading").textContent = greeting + " ✦";
  document.getElementById("welcome-tag").textContent = profile.role + " · " + classLabel;

  function relevantToClass(item) {
    return item.forClass === "All Students" || item.forClass === classLabel;
  }
  function typeLabel(type) {
    var map = { exam: "Exam", deadline: "Deadline", workshop: "Workshop", society: "Society", event: "Event", competition: "Competition" };
    return map[type] || "Event";
  }
  function toOpportunityCard(o) {
    return { id: o.id, title: o.title, description: o.description, category: o.category, deadline: o.deadline, source: o.org, venue: o.eligibility };
  }

  function renderAll() {
    announcements = CB.data.getAllAnnouncements();

    var needsAttention = announcements
      .filter(relevantToClass)
      .filter(function (a) { return a.priority === "high"; })
      .sort(function (a, b) { return (a.deadline || "9999").localeCompare(b.deadline || "9999"); })
      .slice(0, 4);
    CB.ui.renderInfoCards("needs-attention-grid", needsAttention, "announcement", "is-urgent");

    var forYou = opportunities.filter(function (o) { return CB.util.matchesInterests(o.category, profile.interests); }).slice(0, 4);
    if (!forYou.length) forYou = opportunities.slice(0, 4);
    CB.ui.renderInfoCards("for-you-grid", forYou.map(toOpportunityCard), "opportunity", "is-foryou");

    var upcomingEvents = events
      .filter(relevantToClass)
      .slice()
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
      .slice(0, 4);
    renderUpcomingTimeline(upcomingEvents);

    document.getElementById("qa-announcements-count").textContent = announcements.length + " total";
    document.getElementById("qa-opportunities-count").textContent = opportunities.length + " open";
    document.getElementById("qa-calendar-count").textContent = events.length + " upcoming";
    document.getElementById("qa-saved-count").textContent = CB.storage.savedCount() + " saved";

    var pinnedContainer = document.getElementById("pinned-notes");
    pinnedContainer.innerHTML = "";
    var tones = ["tone-a", "tone-b", "tone-c"];
    announcements.filter(relevantToClass).slice(0, 3).forEach(function (item, i) {
      var note = document.createElement("div");
      note.className = "pinned-note " + tones[i % tones.length];
      note.style.setProperty("--rot", (i % 2 === 0 ? -1 : 1) * (1 + i * 0.4) + "deg");
      note.innerHTML = '<span class="pin"></span><p class="pinned-note-title">' + item.title + '</p><p class="pinned-note-meta">' + CB.util.formatDate(item.deadline) + " · " + item.source + '</p>';
      pinnedContainer.appendChild(note);
    });
  }

  var DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var typeChipClass = { exam: "is-exam", deadline: "is-deadline", workshop: "is-workshop", society: "is-society", event: "is-event", competition: "is-competition" };

  function renderUpcomingTimeline(items) {
    var container = document.getElementById("upcoming-grid");
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = '<p class="search-empty">Nothing here right now — check back soon.</p>';
      return;
    }
    items.forEach(function (e) {
      var d = new Date(e.date + "T00:00:00");
      var chipClass = typeChipClass[e.type] || "is-event";
      var el = document.createElement("div");
      el.className = "timeline-item " + chipClass;
      el.innerHTML =
        '<div class="timeline-date">' + DAY_NAMES[d.getDay()] + '<strong>' + d.getDate() + '</strong></div>' +
        '<span class="timeline-marker"></span>' +
        '<div class="timeline-body"><p class="timeline-title">' + e.title + '</p><p class="timeline-tag">' + typeLabel(e.type) + '</p></div>';
      el.addEventListener("click", function () {
        CB.ui.openDetailModal({
          id: e.id, title: e.title, description: typeLabel(e.type) + " on your Campus Board calendar.",
          category: typeLabel(e.type), deadline: e.date, source: "Campus Calendar",
          venue: e.forClass, venueLabel: "For", savedType: "event"
        });
      });
      container.appendChild(el);
    });
  }

  document.addEventListener("cb:saved-changed", function () {
    document.getElementById("qa-saved-count").textContent = CB.storage.savedCount() + " saved";
  });

  renderAll();

  /* ---------------- CR tools ---------------- */

  if (profile.role === "Class Representative") {
    document.getElementById("cr-tools").hidden = false;

    var postModal = document.getElementById("post-modal");
    document.querySelectorAll("#post-modal [data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        postModal.classList.remove("is-open");
        document.body.classList.remove("modal-open");
      });
    });

    function openPostModal() {
      postModal.classList.add("is-open");
      document.body.classList.add("modal-open");
    }

    document.getElementById("cr-post-announcement").addEventListener("click", openPostModal);
    document.getElementById("cr-add-deadline").addEventListener("click", function () {
      document.getElementById("post-category").value = "Academic";
      openPostModal();
    });
    document.getElementById("cr-add-event").addEventListener("click", function () {
      document.getElementById("post-category").value = "Class";
      openPostModal();
    });

    document.getElementById("post-submit").addEventListener("click", function () {
      var title = document.getElementById("post-title").value.trim();
      var desc = document.getElementById("post-desc").value.trim();
      if (!title || !desc) {
        CB.util.toast("Please add a title and description");
        return;
      }
      CB.storage.addCrAnnouncement({
        id: "cr-" + Date.now(),
        title: title,
        description: desc,
        category: document.getElementById("post-category").value,
        date: new Date().toISOString().slice(0, 10),
        deadline: document.getElementById("post-deadline").value || null,
        source: classLabel + " CR",
        priority: document.getElementById("post-priority").value,
        forClass: classLabel,
        venue: "Not specified"
      });
      postModal.classList.remove("is-open");
      document.body.classList.remove("modal-open");
      document.getElementById("post-title").value = "";
      document.getElementById("post-desc").value = "";
      document.getElementById("post-deadline").value = "";
      CB.util.toast("Announcement posted to " + classLabel);
      renderAll();
    });
  }
})();
