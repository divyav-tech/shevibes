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

  function renderDailyBriefing() {
    var events = CB.data.getAllEvents();
    CB.api.dailyBriefing(profile, announcements, opportunities, events).then(function (res) {
      if (!res) return;
      var headline = document.getElementById("briefing-headline");
      var mustKnowList = document.getElementById("briefing-must-know-list");
      var mightLikeList = document.getElementById("briefing-might-like-list");

      if (headline) headline.textContent = res.headline;

      if (mustKnowList && res.must_know) {
        mustKnowList.innerHTML = "";
        res.must_know.forEach(function (item) {
          var li = document.createElement("li");
          li.innerHTML = (item.level === "red" ? "🔴 " : "🟡 ") + "<strong>" + item.title + "</strong><br><span style='font-size:0.78rem;color:var(--color-text-muted);'>" + item.meta + "</span>";
          mustKnowList.appendChild(li);
        });
      }

      if (mightLikeList && res.might_like) {
        mightLikeList.innerHTML = "";
        res.might_like.forEach(function (item) {
          var li = document.createElement("li");
          li.innerHTML = "♡ <strong>" + item.title + "</strong><br><span style='font-size:0.78rem;color:var(--color-text-muted);'>" + item.reason + "</span>";
          mightLikeList.appendChild(li);
        });
      }
    });
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

    var forYouRaw = opportunities.filter(function (o) { return CB.util.matchesInterests(o.category, profile.interests); }).slice(0, 4);
    if (!forYouRaw.length) forYouRaw = opportunities.slice(0, 4);
    var forYouCards = forYouRaw.map(toOpportunityCard);

    // Feature 2: Connect AI Prioritization to "For You" section
    CB.api.prioritize(profile, forYouCards).then(function(priorities) {
      if (priorities && priorities.length === forYouCards.length) {
        forYouCards.forEach(function(card, idx) {
          if (priorities[idx] && priorities[idx].reason) {
            card.description = priorities[idx].reason + " · " + card.description;
          }
        });
      }
      CB.ui.renderInfoCards("for-you-grid", forYouCards, "opportunity", "tone-opportunity");
    }).catch(function() {
      CB.ui.renderInfoCards("for-you-grid", forYouCards, "opportunity", "tone-opportunity");
    });

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

    renderDailyBriefing();
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
      fields.category.value = parsed.category ? (parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1)) : "General";
      fields.priority.value = (parsed.priority || "medium").toLowerCase();
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

      // Call backend API (or fallback)
      CB.api.parseAnnouncement(text).then(function (parsed) {
        currentParsed = parsed || CB.ai.parseAnnouncement(text, { today: CB.TODAY });
        setTimeout(function () {
          fillResultFields(currentParsed);
          setEditable(false);
          setStage("result");
        }, stepDelay * 2);
      });
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
        raw: currentParsed.raw || rawInput.value,
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
        tags: currentParsed.tags || [],
        confidence: currentParsed.confidence || 0.9,
        aiGenerated: true
      };
      CB.storage.addCrAnnouncement(announcement);
      CB.api.postNotice(announcement); // Requirement 7 & 8: Persist to backend DB & auto-add calendar_event
      closePostModal();
      CB.util.toast("Posted to " + classLabel + " · sorted.");
      renderAll();
    });

    /* ---------------- Feature 3: CR AI Chat Digest Modal & Handler ---------------- */

    var chatDigestModal = document.getElementById("chat-digest-modal");
    var chatDigestBtn = document.getElementById("cr-chat-digest-btn");
    var chatDigestInput = document.getElementById("chat-digest-input");
    var chatFileInput = document.getElementById("chat-file-input");
    var chatFileName = document.getElementById("chat-file-name");
    var generateDigestBtn = document.getElementById("generate-digest-btn");
    var digestResultContainer = document.getElementById("digest-result-container");
    var digestConflictsBox = document.getElementById("digest-conflicts");
    var digestSummaryText = document.getElementById("digest-summary-text");
    var digestItemsList = document.getElementById("digest-items-list");

    if (chatDigestBtn && chatDigestModal) {
      chatDigestBtn.addEventListener("click", function () {
        chatDigestModal.classList.add("is-open");
        document.body.classList.add("modal-open");
      });

      document.querySelectorAll("[data-close-digest-modal]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          chatDigestModal.classList.remove("is-open");
          document.body.classList.remove("modal-open");
        });
      });

      if (chatFileInput) {
        chatFileInput.addEventListener("change", function (e) {
          var file = e.target.files[0];
          if (file) {
            chatFileName.textContent = file.name;
            var reader = new FileReader();
            reader.onload = function (evt) {
              chatDigestInput.value = evt.target.result;
            };
            reader.readAsText(file);
          }
        });
      }

      if (generateDigestBtn) {
        generateDigestBtn.addEventListener("click", function () {
          var chatText = chatDigestInput.value.trim();
          if (!chatText) {
            CB.util.toast("Please paste or upload chat text first");
            return;
          }

          generateDigestBtn.disabled = true;
          generateDigestBtn.textContent = "✦ Analyzing chat with AI…";

          CB.api.chatDigest(chatText).then(function (digest) {
            generateDigestBtn.disabled = false;
            generateDigestBtn.textContent = "✦ Generate AI Digest";

            if (!digest) {
              CB.util.toast("Could not process chat digest");
              return;
            }

            digestResultContainer.hidden = false;
            digestSummaryText.textContent = digest.summary;

            if (digest.conflicts && digest.conflicts.length > 0) {
              digestConflictsBox.hidden = false;
              digestConflictsBox.innerHTML = digest.conflicts.join("<br>");
            } else {
              digestConflictsBox.hidden = true;
            }

            digestItemsList.innerHTML = "";
            (digest.items || []).forEach(function (item) {
              var card = document.createElement("div");
              card.className = "digest-item-card";
              card.innerHTML = '<div>' +
                '<span class="board-tag" style="margin-bottom:4px;display:inline-block;">' + item.category + '</span>' +
                '<div class="digest-item-title">' + (item.title || item.content) + '</div>' +
                '<div class="digest-item-meta">' + (item.deadline ? 'Deadline: ' + item.deadline + ' · ' : '') + 'Status: ' + (item.status || 'UNVERIFIED') + '</div>' +
                '</div>' +
                '<button class="btn btn-primary btn-small approve-digest-item" type="button">Approve</button>';

              card.querySelector(".approve-digest-item").addEventListener("click", function () {
                var ann = {
                  id: "cr-digest-" + Date.now(),
                  title: item.title || item.content.slice(0, 40),
                  description: item.content,
                  category: item.category ? item.category.toLowerCase() : "academic",
                  deadline: item.deadline || null,
                  date: new Date().toISOString().slice(0, 10),
                  priority: "high",
                  source: classLabel + " CR Digest",
                  forClass: classLabel,
                  add_to_calendar: !!item.deadline,
                  aiGenerated: true
                };
                CB.storage.addCrAnnouncement(ann);
                CB.api.postNotice(ann); // Persist through backend API
                CB.util.toast("Approved & posted to Class Board!");
                card.style.opacity = "0.5";
                card.querySelector(".approve-digest-item").disabled = true;
                renderAll();
              });

              digestItemsList.appendChild(card);
            });
          });
        });
      }
    }
  }
})();
