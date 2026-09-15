/* =========================================================
   CAMPUS BOARD — opportunities.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return;
  CB.ui.initPolaroid();

  var profile = CB.storage.getProfile();
  var allOpportunities = [];

  var state = { query: "", category: "All" };
  var params = new URLSearchParams(window.location.search);
  if (params.get("q")) state.query = params.get("q");

  var pageSearch = document.getElementById("page-search");
  pageSearch.value = state.query;

  document.querySelectorAll("#category-chips [data-category]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      state.category = chip.dataset.category;
      document.querySelectorAll("#category-chips [data-category]").forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      render();
    });
  });

  pageSearch.addEventListener("input", CB.util.debounce(function () {
    state.query = pageSearch.value;
    render();
  }, 150));

  function mapOpportunityCategory(category) {
    var key = String(category || "").toLowerCase();
    if (key === "tech" || key === "hackathon" || key === "internship") return "Tech";
    if (key === "workshop" || key === "webinar") return "Workshops";
    if (key === "competition") return "Competitions";
    if (key === "scholarship") return "Scholarships";
    if (key === "volunteering") return "Volunteering";
    if (key === "events") return "Events";
    if (key === "societies") return "Societies";
    if (!category) return "General";
    var s = String(category);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function mapOpportunity(row) {
    var category = mapOpportunityCategory(row.category);
    return {
      id: String(row.id),
      title: row.title,
      org: row.org || "Campus",
      category: category,
      deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
      eligibility: row.eligibility || "Not specified",
      description: row.description || "",
      tags: Array.isArray(row.tags) ? row.tags : [category]
    };
  }

  function toCard(o) {
    return {
      id: o.id,
      title: o.title,
      description: o.description,
      category: o.category,
      deadline: o.deadline,
      source: o.org,
      sourceLabel: "Organization",
      venue: o.eligibility,
      venueLabel: "Eligibility",
      tags: o.tags,
      savedType: "opportunity"
    };
  }

  function renderGrid(containerId, items, emptyMessage) {
    var container = document.getElementById(containerId);
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = '<p class="search-empty">' + emptyMessage + '</p>';
      return;
    }
    items.forEach(function (o) {
      var card = toCard(o);
      var el = document.createElement("div");
      el.className = "info-card " + CB.util.toneForCategory(o.category);
      el.innerHTML =
        '<div class="info-card-head">' +
          '<div><span class="info-card-tag">' + o.category + '</span><p class="info-card-title">' + o.title + '</p></div>' +
          '<button class="info-card-save' + (CB.storage.isSaved("opportunity", o.id) ? " is-saved" : "") + '" data-save="' + o.id + '" aria-label="Save">' +
            (CB.storage.isSaved("opportunity", o.id) ? "★" : "☆") +
          '</button>' +
        '</div>' +
        '<p class="info-card-desc">' + o.description + '</p>' +
        '<div class="info-card-meta">' +
          '<span>Deadline: <strong>' + CB.util.formatDate(o.deadline) + '</strong></span>' +
          '<span>Org: <strong>' + o.org + '</strong></span>' +
        '</div>' +
        '<div class="info-card-meta">' + o.tags.map(function (t) { return '<span class="info-card-tag">' + t + '</span>'; }).join("") + '</div>';
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-save]")) return;
        CB.ui.openDetailModal(card);
      });
      container.appendChild(el);
    });
    container.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nowSaved = CB.storage.toggleSaved("opportunity", btn.dataset.save);
        btn.textContent = nowSaved ? "★" : "☆";
        btn.classList.toggle("is-saved", nowSaved);
        CB.util.toast(nowSaved ? "Saved" : "Removed from saved");
      });
    });
  }

  function render() {
    var q = state.query.trim().toLowerCase();
    var filtered = allOpportunities.filter(function (o) {
      var matchesCategory = state.category === "All" || o.category === state.category;
      var matchesQuery = !q || o.title.toLowerCase().indexOf(q) !== -1 || o.description.toLowerCase().indexOf(q) !== -1;
      return matchesCategory && matchesQuery;
    });

    var recommended = filtered.filter(function (o) { return CB.util.matchesInterests(o.category, profile.interests); });

    var emptyAll = "No opportunities available right now.";
    renderGrid("recommended-grid", recommended, allOpportunities.length ? "Pick a few more interests in your profile to see recommendations here." : emptyAll);
    renderGrid("opportunities-grid", filtered, allOpportunities.length ? ("No results found" + (q ? ' for “' + state.query + '”' : "") + ".") : emptyAll);
  }

  CB.api.getOpportunities().then(function (res) {
    if (res && Array.isArray(res.opportunities) && res.opportunities.length) {
      allOpportunities = res.opportunities.map(mapOpportunity);
    } else {
      // Keep the built-in campus opportunities when the database is empty/offline.
      allOpportunities = (CB.data.opportunities || []).slice();
    }
    render();
  }).catch(function () {
    allOpportunities = (CB.data.opportunities || []).slice();
    render();
  });
})();
