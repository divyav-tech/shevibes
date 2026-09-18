/* =========================================================
   CAMPUS BOARD — profile.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return;
  CB.ui.initPolaroid();

  var profile = CB.storage.getProfile();
  var selectedInterests = new Set(profile.interests || []);

  function classLabelOf(p) { return p.year + " · " + p.branch + " · Section " + p.section; }

  function mapBackendRole(role) {
    var r = String(role || "").toLowerCase();
    if (r === "cr" || r.indexOf("representative") !== -1) return "Class Representative";
    return "Regular Student";
  }

  function mapBackendProfile(row) {
    return {
      name: row.name,
      role: mapBackendRole(row.role),
      year: row.year,
      branch: row.branch,
      section: row.section,
      college: row.college,
      interests: Array.isArray(row.interests) ? row.interests : []
    };
  }

  function paintSummary() {
    document.getElementById("profile-avatar-lg").textContent = CB.util.avatarInitial(profile);
    document.getElementById("profile-summary-name").textContent = profile.name || "Your name";
    document.getElementById("profile-summary-role").textContent = profile.role;
    document.getElementById("profile-summary-class").textContent = classLabelOf(profile);
  }

  function refreshHeaderAvatar() {
    var headerAvatar = document.getElementById("app-avatar");
    if (headerAvatar) headerAvatar.textContent = CB.util.avatarInitial(profile);
  }

  function fillFormFromProfile() {
    document.getElementById("edit-name").value = profile.name || "";
    document.getElementById("edit-role").value = profile.role;
    document.getElementById("edit-year").value = profile.year;
    document.getElementById("edit-branch").value = profile.branch;
    document.getElementById("edit-section").value = profile.section;
    selectedInterests.clear();
    (profile.interests || []).forEach(function (interest) { selectedInterests.add(interest); });
    document.querySelectorAll("#edit-interests [data-value]").forEach(function (chip) {
      chip.classList.toggle("is-active", selectedInterests.has(chip.dataset.value));
    });
  }

  fillFormFromProfile();
  document.querySelectorAll("#edit-interests [data-value]").forEach(function (chip) {
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

  if (CB.api && CB.api.getProfile) {
    CB.api.getProfile().then(function (res) {
      if (res && res.profile && (res.profile.name || res.profile.id)) {
        profile = mapBackendProfile(res.profile);
        CB.storage.saveProfile(profile);
        fillFormFromProfile();
        paintSummary();
        refreshHeaderAvatar();
      }
    });
  }

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
      college: profile.college,
      interests: Array.from(selectedInterests)
    };
    if (!profile.interests.length) {
      CB.util.toast("Pick at least one interest");
      return;
    }
    CB.storage.saveProfile(profile);
    paintSummary();
    refreshHeaderAvatar();
    if (CB.api && CB.api.postProfile) {
      CB.api.postProfile(profile);
    }
    CB.util.toast("Profile updated");
  });

  var signOutBtn = document.getElementById("sign-out");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", function () {
      if (!window.confirm("Sign out of Campus Board?")) return;
      signOutBtn.disabled = true;
      var finish = function () {
        CB.storage.clearProfile();
        window.location.href = "index.html";
      };
      if (CB.api && CB.api.logout) {
        CB.api.logout().then(finish).catch(finish);
      } else {
        finish();
      }
    });
  }

  var resetBtn = document.getElementById("reset-personalization");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      var confirmed = window.confirm("This logs you out and clears saved data on this device. Continue?");
      if (!confirmed) return;
      function finishLogout() {
        var taskUid = localStorage.getItem("campusboard.activeUserId") || "guest";
        CB.storage.clearProfile();
        localStorage.removeItem("campusboard.saved");
        localStorage.removeItem("campusboard.crAnnouncements");
        localStorage.removeItem("campusboard.calendarNotes");
        localStorage.removeItem("campusboard.polaroids");
        localStorage.removeItem("campusboard.taskStates." + taskUid);
        window.location.href = "index.html";
      }
      if (CB.api && CB.api.logout) {
        CB.api.logout().then(finishLogout, finishLogout);
      } else {
        finishLogout();
      }
    });
  }

  /* ---------------- saved items ---------------- */

  function renderSaved() {
    var noticesPromise = (CB.api && CB.api.getNotices) ? CB.api.getNotices() : Promise.resolve(null);
    var oppsPromise = (CB.api && CB.api.getOpportunities) ? CB.api.getOpportunities() : Promise.resolve(null);

    Promise.all([noticesPromise, oppsPromise]).then(function (results) {
      var noticesRes = results[0];
      var oppsRes = results[1];

      var saved = CB.storage.getSaved();
      var announcements = CB.data.getAllAnnouncements();
      if (noticesRes && Array.isArray(noticesRes.notices)) {
        var apiAnnouncements = noticesRes.notices.map(function (row) {
          return {
            id: String(row.id),
            title: row.title,
            description: row.summary || row.content,
            category: row.category,
            deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
            source: row.source || "Campus Board",
            forClass: row.class_name || "All Students",
            priority: row.priority || "medium",
            aiGenerated: !!row.ai_generated
          };
        });
        apiAnnouncements.forEach(function (apiA) {
          if (!announcements.some(function (a) { return String(a.id) === String(apiA.id); })) {
            announcements.push(apiA);
          }
        });
      }

      var opportunities = (CB.data.opportunities || []).slice();
      if (oppsRes && Array.isArray(oppsRes.opportunities)) {
        var apiOpps = oppsRes.opportunities.map(function (row) {
          return {
            id: String(row.id),
            title: row.title,
            description: row.description,
            category: row.category,
            deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
            org: row.org || row.source || "Campus",
            eligibility: row.eligibility || "All Students",
            priority: row.priority || "medium"
          };
        });
        apiOpps.forEach(function (apiO) {
          if (!opportunities.some(function (o) { return String(o.id) === String(apiO.id); })) {
            opportunities.push(apiO);
          }
        });
      }

      var events = CB.data.getAllEvents();

      var items = [];
      (saved.announcement || []).forEach(function (id) {
        var found = announcements.find(function (a) { return String(a.id) === String(id); });
        if (found) items.push({ type: "announcement", label: "Announcement", data: found });
      });
      (saved.opportunity || []).forEach(function (id) {
        var found = opportunities.find(function (o) { return String(o.id) === String(id); });
        if (found) items.push({ type: "opportunity", label: "Opportunity", data: found });
      });
      (saved.event || []).forEach(function (id) {
        var found = events.find(function (e) { return String(e.id) === String(id); });
        if (found) items.push({ type: "event", label: "Event", data: found });
      });

      var countEl = document.getElementById("saved-count-line");
      if (countEl) countEl.textContent = items.length + " saved";

      var list = document.getElementById("saved-list");
      if (!list) return;
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
    }).catch(function () {});
  }

  renderSaved();
})();
