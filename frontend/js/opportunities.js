/* =========================================================
   CAMPUS BOARD — opportunities.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return;

  var profile = CB.storage.getProfile();
  var allOpportunities = CB.data.opportunities;

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
      el.className = "info-card is-foryou";
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

    renderGrid("recommended-grid", recommended, "Pick a few more interests in your profile to see recommendations here.");
    renderGrid("opportunities-grid", filtered, "No results found" + (q ? ' for “' + state.query + '”' : "") + ".");
  }

  render();
})();
