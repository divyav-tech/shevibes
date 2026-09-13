/* =========================================================
   CAMPUS BOARD — dashboard.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return; // redirects to index.html if no profile
  CB.ui.initPolaroid();
  CB.ui.initPolaroidAdder(document.getElementById("campus-corner-polaroids"), "dashboard", document.getElementById("campus-corner-add"));

  var profile = CB.storage.getProfile();
  var announcements = CB.data.getAllAnnouncements();
  var opportunities = CB.data.opportunities;
  var classLabel = profile.year + " · " + profile.branch + " · Section " + profile.section;

  var hour = new Date().getHours();
  var greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  var firstName = (profile.name || "").trim().split(/\s+/)[0];
  document.getElementById("welcome-heading").textContent = greeting + (firstName ? ", " + firstName : "") + " ✦";
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
    var events = CB.data.getAllEvents();

    var needsAttention = announcements
      .filter(relevantToClass)
      .filter(function (a) { return a.priority === "high"; })
      .sort(function (a, b) { return (a.deadline || "9999").localeCompare(b.deadline || "9999"); })
      .slice(0, 4);
    CB.ui.renderInfoCards("needs-attention-grid", needsAttention, "announcement", "tone-important");

    var forYou = opportunities.filter(function (o) { return CB.util.matchesInterests(o.category, profile.interests); }).slice(0, 4);
    if (!forYou.length) forYou = opportunities.slice(0, 4);
    CB.ui.renderInfoCards("for-you-grid", forYou.map(toOpportunityCard), "opportunity", "tone-opportunity");

    var upcomingItems = events
      .filter(relevantToClass)
      .slice()
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
      .slice(0, 4)
      .map(function (e) {
        return {
          id: e.id, title: e.title,
          description: typeLabel(e.type) + " · " + CB.util.formatDate(e.date) + (e.time ? " · " + e.time : ""),
          category: typeLabel(e.type), deadline: e.date, source: "Campus Calendar",
          venue: e.venue || "Not specified", aiGenerated: !!e.aiGenerated
        };
      });
    CB.ui.renderInfoCards("upcoming-grid", upcomingItems, "event", "tone-event");

    document.getElementById("qa-announcements-count").textContent = announcements.length + " total";
    document.getElementById("qa-opportunities-count").textContent = opportunities.length + " open";
    document.getElementById("qa-calendar-count").textContent = events.length + " upcoming";
    document.getElementById("qa-saved-count").textContent = CB.storage.savedCount() + " saved";

    var pinnedContainer = document.getElementById("pinned-notes");
    pinnedContainer.innerHTML = "";
    announcements.filter(relevantToClass).slice(0, 3).forEach(function (item, i) {
      var note = document.createElement("div");
      note.className = "pinned-note";
      note.style.setProperty("--rot", (i % 2 === 0 ? -1 : 1) * (1 + i * 0.4) + "deg");
      note.innerHTML = '<span class="pin"></span><p class="pinned-note-title">' + item.title + '</p><p class="pinned-note-meta">' + CB.util.formatDate(item.deadline) + " · " + item.source + '</p>';
      pinnedContainer.appendChild(note);
    });
  }

  document.addEventListener("cb:saved-changed", function () {
    document.getElementById("qa-saved-count").textContent = CB.storage.savedCount() + " saved";
  });

  renderAll();

  /* ---------------- CR tools: natural-language AI announcement flow ---------------- */

  if (profile.role === "Class Representative") {
    document.getElementById("cr-tools").hidden = false;

    var postModal = document.getElementById("post-modal");
    var rawInput = document.getElementById("ai-raw-input");
    var understandBtn = document.getElementById("ai-understand-btn");
    var editBtn = document.getElementById("ai-edit-btn");
    var postBtn = document.getElementById("ai-post-btn");
    var processingSteps = Array.prototype.slice.call(document.querySelectorAll("#ai-processing-steps li"));

    var fields = {
      subject: document.getElementById("ai-field-subject"),
      action: document.getElementById("ai-field-action"),
      deadline: document.getElementById("ai-field-deadline"),
      time: document.getElementById("ai-field-time"),
      venue: document.getElementById("ai-field-venue"),
      category: document.getElementById("ai-field-category"),
      priority: document.getElementById("ai-field-priority"),
      klass: document.getElementById("ai-field-class"),
      calendar: document.getElementById("ai-field-calendar")
    };
    var resultTitleDisplay = document.getElementById("ai-result-title-display");
    var currentParsed = null;
    var processingTimer = null;

    function setStage(stage) {
      document.querySelectorAll("#post-modal .ai-flow-stage").forEach(function (el) {
        el.classList.toggle("is-active", el.dataset.flowStage === stage);
      });
    }

    function resetFlow() {
      clearTimeout(processingTimer);
      rawInput.value = "";
      currentParsed = null;
      processingSteps.forEach(function (li) { li.classList.remove("is-done"); });
      setStage("compose");
    }

    function openPostModal() {
      resetFlow();
      postModal.classList.add("is-open");
      document.body.classList.add("modal-open");
      setTimeout(function () { rawInput.focus(); }, 50);
    }
    function closePostModal() {
      postModal.classList.remove("is-open");
      document.body.classList.remove("modal-open");
    }

    document.querySelectorAll("#post-modal [data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", closePostModal);
    });

    document.getElementById("cr-post-announcement").addEventListener("click", openPostModal);
    document.getElementById("cr-add-deadline").addEventListener("click", function () {
      openPostModal();
      rawInput.placeholder = "e.g. Data Structures assignment 3 is due Friday. Submit on the portal by 6 PM.";
    });
    document.getElementById("cr-add-event").addEventListener("click", function () {
      openPostModal();
      rawInput.placeholder = "e.g. Class shifts to Room 108 tomorrow at 2 PM instead of the usual slot.";
    });

    function fillResultFields(parsed) {
      resultTitleDisplay.textContent = parsed.title;
      fields.subject.value = parsed.subject || "";
      fields.subject.placeholder = "Not specified";
      fields.action.value = parsed.action || "";
      fields.action.placeholder = "Not specified";
      fields.deadline.value = parsed.deadline || "";
      fields.time.value = parsed.time || "";
      fields.venue.value = parsed.venue || "";
      fields.category.value = parsed.category;
      fields.priority.value = parsed.priority;
      fields.klass.value = classLabel;
      fields.calendar.checked = parsed.add_to_calendar;
    }

    function setEditable(editable) {
      Object.keys(fields).forEach(function (key) {
        fields[key].disabled = !editable;
        var wrapper = fields[key].closest(".ai-result-field");
        if (wrapper) wrapper.classList.toggle("is-editing", editable);
      });
    }

    understandBtn.addEventListener("click", function () {
      var text = rawInput.value.trim();
      if (!text) {
        CB.util.toast("Type what happened first");
        return;
      }
      setStage("processing");
      processingSteps.forEach(function (li) { li.classList.remove("is-done"); });

      var stepDelay = 420;
      processingSteps.forEach(function (li, i) {
        setTimeout(function () { li.classList.add("is-done"); }, stepDelay * (i + 1));
      });

      processingTimer = setTimeout(function () {
        currentParsed = CB.ai.parseAnnouncement(text, { today: CB.TODAY });
        fillResultFields(currentParsed);
        setEditable(false);
        setStage("result");
      }, stepDelay * (processingSteps.length + 1));
    });

    editBtn.addEventListener("click", function () {
      var editing = !fields.subject.disabled;
      setEditable(!editing);
      if (!editing) fields.subject.focus();
      editBtn.textContent = editing ? "Edit" : "Done editing";
    });

    postBtn.addEventListener("click", function () {
      if (!currentParsed) return;
      var deadline = fields.deadline.value || null;
      var announcement = {
        id: "cr-" + Date.now(),
        raw: currentParsed.raw,
        title: resultTitleDisplay.textContent,
        description: currentParsed.summary,
        subject: fields.subject.value || null,
        action: fields.action.value || null,
        deadline: deadline,
        time: fields.time.value || null,
        venue: fields.venue.value || "Not specified",
        category: fields.category.value,
        date: new Date().toISOString().slice(0, 10),
        priority: fields.priority.value,
        source: classLabel + " CR",
        forClass: classLabel,
        add_to_calendar: fields.calendar.checked && !!deadline,
        tags: currentParsed.tags,
        confidence: currentParsed.confidence,
        aiGenerated: true
      };
      CB.storage.addCrAnnouncement(announcement);
      closePostModal();
      CB.util.toast("Posted to " + classLabel + " · sorted.");
      renderAll();
    });
  }
})();
