/* =========================================================
   CAMPUS BOARD — profile.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return;
  CB.ui.initPolaroid();

  var profile = CB.storage.getProfile();

  function classLabelOf(p) { return p.year + " · " + p.branch + " · Section " + p.section; }

  function paintSummary() {
    document.getElementById("profile-avatar-lg").textContent = CB.util.avatarInitial(profile);
    document.getElementById("profile-summary-name").textContent = profile.name || "Your name";
    document.getElementById("profile-summary-role").textContent = profile.role;
    document.getElementById("profile-summary-class").textContent = classLabelOf(profile);
  }

  document.getElementById("edit-name").value = profile.name || "";
  document.getElementById("edit-role").value = profile.role;
  document.getElementById("edit-year").value = profile.year;
  document.getElementById("edit-branch").value = profile.branch;
  document.getElementById("edit-section").value = profile.section;

  var selectedInterests = new Set(profile.interests || []);
  document.querySelectorAll("#edit-interests [data-value]").forEach(function (chip) {
    if (selectedInterests.has(chip.dataset.value)) chip.classList.add("is-active");
    chip.addEventListener("click", function () {
      var value = chip.dataset.value;
      if (selectedInterests.has(value)) {
        selectedInterests.delete(value);
        chip.classList.remove("is-active");
      } else {
        selectedInterests.add(value);
        chip.classList.add("is-active");
      }
    });
  });

  paintSummary();

  document.getElementById("save-profile").addEventListener("click", function () {
    var name = document.getElementById("edit-name").value.trim();
    if (!name) {
      CB.util.toast("Tell us your name first");
      return;
    }
    profile = {
      name: name,
      role: document.getElementById("edit-role").value,
      year: document.getElementById("edit-year").value,
      branch: document.getElementById("edit-branch").value,
      section: document.getElementById("edit-section").value,
      interests: Array.from(selectedInterests)
    };
    if (!profile.interests.length) {
      CB.util.toast("Pick at least one interest");
      return;
    }
    CB.storage.saveProfile(profile);
    paintSummary();
    // The header avatar (initial) updates immediately too, not just on next page load.
    var headerAvatar = document.getElementById("app-avatar");
    if (headerAvatar) headerAvatar.textContent = CB.util.avatarInitial(profile);
    CB.util.toast("Profile updated");
  });

  document.getElementById("reset-personalization").addEventListener("click", function () {
    var confirmed = window.confirm("This clears your name, role, class, interests, saved items and photos on this device. Continue?");
    if (!confirmed) return;
    CB.storage.clearProfile();
    localStorage.removeItem("campusboard.saved");
    localStorage.removeItem("campusboard.crAnnouncements");
    localStorage.removeItem("campusboard.calendarNotes");
    localStorage.removeItem("campusboard.polaroids");
    window.location.href = "index.html";
  });

  /* ---------------- saved items ---------------- */

  function renderSaved() {
    var saved = CB.storage.getSaved();
    var announcements = CB.data.getAllAnnouncements();
    var opportunities = CB.data.opportunities;
    var events = CB.data.getAllEvents();

    var items = [];
    (saved.announcement || []).forEach(function (id) {
      var found = announcements.find(function (a) { return a.id === id; });
      if (found) items.push({ type: "announcement", label: "Announcement", data: found });
    });
    (saved.opportunity || []).forEach(function (id) {
      var found = opportunities.find(function (o) { return o.id === id; });
      if (found) items.push({ type: "opportunity", label: "Opportunity", data: found });
    });
    (saved.event || []).forEach(function (id) {
      var found = events.find(function (e) { return e.id === id; });
      if (found) items.push({ type: "event", label: "Event", data: found });
    });

    document.getElementById("saved-count-line").textContent = items.length + " saved";

    var list = document.getElementById("saved-list");
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = '<p class="search-empty">Nothing saved yet — tap ☆ on any card to keep it here.</p>';
      return;
    }

    items.forEach(function (entry) {
      var d = entry.data;
      var title = d.title;
      var deadline = d.deadline;
      var source = d.source || d.org;

      var card = document.createElement("div");
      card.className = "info-card tone-rose";
      card.innerHTML =
        '<div class="info-card-head">' +
          '<div><span class="info-card-tag">' + entry.label + '</span><p class="info-card-title">' + title + '</p></div>' +
          '<button class="info-card-save is-saved" data-unsave="' + entry.type + ':' + d.id + '" aria-label="Remove from saved">★</button>' +
        '</div>' +
        '<div class="info-card-meta"><span>Deadline: <strong>' + CB.util.formatDate(deadline) + '</strong></span><span>Source: <strong>' + source + '</strong></span></div>';
      list.appendChild(card);
    });

    list.querySelectorAll("[data-unsave]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.dataset.unsave.split(":");
        CB.storage.toggleSaved(parts[0], parts[1]);
        CB.util.toast("Removed from saved");
        renderSaved();
      });
    });
  }

  renderSaved();
})();
