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
        var suffix = ".user." + taskUid;
        CB.storage.clearProfile();
        ["campusboard.saved", "campusboard.calendarNotes", "campusboard.polaroids", "campusboard.notifications", "campusboard.crAnnouncements"].forEach(function (key) {
          localStorage.removeItem(key + suffix);
        });
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
    var saved = CB.storage.getSaved();
    var announcements = CB.data.getAllAnnouncements();
    var opportunities = CB.data.opportunities.slice();
    var events = CB.data.getAllEvents();

    function finishRender() {
      saved = CB.storage.getSaved();
      var items = [];
      (saved.announcement || []).forEach(function (id) {
        var found = announcements.find(function (a) { return String(a.id) === String(id); });
        if (found && !CB.storage.isAnnouncementHidden(found.id)) items.push({ type: "announcement", label: "Announcement", data: found });
      });
      (saved.opportunity || []).forEach(function (id) {
        var found = opportunities.find(function (o) { return String(o.id) === String(id); });
        if (found) items.push({ type: "opportunity", label: "Opportunity", data: found });
      });
      (saved.event || []).forEach(function (id) {
        var found = events.find(function (e) { return String(e.id) === String(id); });
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
        var card = document.createElement("div");
        card.className = "info-card tone-rose";
        card.innerHTML = '<div class="info-card-head"><div><span class="info-card-tag">' + entry.label + '</span><p class="info-card-title">' + d.title + '</p></div><button class="info-card-save is-saved" data-unsave="' + entry.type + ':' + d.id + '" aria-label="Remove from saved">★</button></div>' +
          '<p class="info-card-desc">' + (d.description || "") + '</p>' +
          '<div class="info-card-meta"><span>Deadline: <strong>' + CB.util.formatDate(d.deadline) + '</strong></span><span>Source: <strong>' + (d.source || d.org || "Campus Board") + '</strong></span></div>';
        card.addEventListener("click", function (e) {
          if (e.target.closest("[data-unsave]")) return;
          CB.ui.openDetailModal(Object.assign({}, d, { savedType: entry.type }));
        });
        list.appendChild(card);
      });
      list.querySelectorAll("[data-unsave]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var parts = btn.dataset.unsave.split(":");
          CB.storage.toggleSaved(parts[0], parts[1]);
          CB.util.toast("Removed from saved");
          renderSaved();
        });
      });
    }

    Promise.all([CB.api.getNotices(), CB.api.getOpportunities(), CB.api.getCalendarEvents()]).then(function (results) {
      var noticeRes = results[0];
      if (noticeRes && Array.isArray(noticeRes.notices)) {
        noticeRes.notices.forEach(function (row) {
          var item = { id: String(row.id), title: row.title, description: row.description || row.summary || row.content || "", category: row.category ? String(row.category).charAt(0).toUpperCase() + String(row.category).slice(1).toLowerCase() : "General", deadline: row.deadline ? String(row.deadline).slice(0,10) : null, source: row.source || "Campus Board", venue: row.venue || "Not specified", forClass: row.forClass || row.class_name || "All Students", aiGenerated: Boolean(row.aiGenerated || row.ai_generated) };
          if (!CB.storage.isAnnouncementHidden(item.id) && !announcements.some(function(a){ return String(a.id) === String(item.id); })) announcements.push(item);
        });
      }
      var oppRes = results[1];
      if (oppRes && Array.isArray(oppRes.opportunities)) {
        oppRes.opportunities.forEach(function(row) {
          var item = { id: String(row.id), title: row.title, description: row.description || "", category: row.category || "General", deadline: row.deadline ? String(row.deadline).slice(0,10) : null, source: row.org || "Campus", org: row.org || "Campus", eligibility: row.eligibility || "Not specified" };
          if (!opportunities.some(function(o){ return String(o.id) === String(item.id); })) opportunities.push(item);
        });
      }
      var eventRes = results[2];
      if (eventRes && Array.isArray(eventRes.events)) {
        eventRes.events.forEach(function(row) {
          var item = { id: String(row.id), title: row.title, description: row.description || "Campus Board calendar item.", date: row.event_date ? String(row.event_date).slice(0,10) : null, deadline: row.event_date ? String(row.event_date).slice(0,10) : null, type: row.category || "event", source: row.location || "Campus Calendar", venue: row.location || "Not specified" };
          if (!events.some(function(e){ return String(e.id) === String(item.id); })) events.push(item);
        });
      }
      finishRender();
    }).catch(finishRender);
  }
  renderSaved();
})();
