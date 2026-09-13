/* =========================================================
   CAMPUS BOARD — announcements.js
   ========================================================= */

(function () {
  "use strict";

  if (!CB.initAppHeader()) return;

  var profile = CB.storage.getProfile();
  var allAnnouncements = CB.data.getAllAnnouncements();

  var state = {
    query: "",
    category: "All",
    sort: "newest"
  };

  var params = new URLSearchParams(window.location.search);
  if (params.get("category")) state.category = params.get("category");
  if (params.get("q")) state.query = params.get("q");

  var pageSearch = document.getElementById("page-search");
  var sortSelect = document.getElementById("sort-select");
  pageSearch.value = state.query;
  sortSelect.value = state.sort;

  document.querySelectorAll("#category-chips [data-category]").forEach(function (chip) {
    if (chip.dataset.category === state.category) chip.classList.add("is-active");
    else chip.classList.remove("is-active");
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

  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value;
    render();
  });

  var priorityWeight = { high: 0, medium: 1, low: 2 };

  function toneFor(priority) {
    return priority === "high" ? "is-urgent" : priority === "medium" ? "is-foryou" : "is-latest";
  }

  function render() {
    var q = state.query.trim().toLowerCase();
    var filtered = allAnnouncements.filter(function (a) {
      var matchesCategory = state.category === "All" || a.category === state.category;
      var matchesQuery = !q || a.title.toLowerCase().indexOf(q) !== -1 || a.description.toLowerCase().indexOf(q) !== -1;
      return matchesCategory && matchesQuery;
    });

    filtered.sort(function (a, b) {
      if (state.sort === "deadline") return (a.deadline || "9999").localeCompare(b.deadline || "9999");
      if (state.sort === "priority") return priorityWeight[a.priority] - priorityWeight[b.priority];
      return (b.date || "").localeCompare(a.date || ""); // newest first
    });

    var cards = filtered.map(function (a) {
      return Object.assign({}, a, { _tone: toneFor(a.priority) });
    });

    var container = document.getElementById("announcements-grid");
    container.innerHTML = "";
    if (!cards.length) {
      container.innerHTML = '<p class="search-empty">No results found' + (q ? ' for “' + state.query + '”' : "") + '.</p>';
      return;
    }
    cards.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "info-card " + item._tone;
      card.innerHTML =
        '<div class="info-card-head">' +
          '<div><span class="info-card-tag">' + item.category + '</span><p class="info-card-title">' + item.title + '</p></div>' +
          '<button class="info-card-save' + (CB.storage.isSaved("announcement", item.id) ? " is-saved" : "") + '" data-save="' + item.id + '" aria-label="Save">' +
            (CB.storage.isSaved("announcement", item.id) ? "★" : "☆") +
          '</button>' +
        '</div>' +
        '<p class="info-card-desc">' + item.description + '</p>' +
        '<div class="info-card-meta">' +
          '<span>Deadline: <strong>' + CB.util.formatDate(item.deadline) + '</strong></span>' +
          '<span>For: <strong>' + item.forClass + '</strong></span>' +
          '<span>Source: <strong>' + item.source + '</strong></span>' +
        '</div>';
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-save]")) return;
        item.savedType = "announcement";
        CB.ui.openDetailModal(item);
      });
      container.appendChild(card);
    });

    container.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nowSaved = CB.storage.toggleSaved("announcement", btn.dataset.save);
        btn.textContent = nowSaved ? "★" : "☆";
        btn.classList.toggle("is-saved", nowSaved);
        CB.util.toast(nowSaved ? "Saved" : "Removed from saved");
      });
    });
  }

  render();
})();
