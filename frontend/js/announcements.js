/* =========================================================
   CAMPUS BOARD — announcements.js
   ========================================================= */

(function () {
  "use strict";

  CB.initProtectedPage(function (profile) {
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

  function titleCaseCategory(category) {
    if (!category) return "General";
    var s = String(category);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function firstTenChars(value) {
    if (value == null || value === "") return null;
    return String(value).slice(0, 10);
  }

  function mapNotice(row) {
    return {
      id: String(row.id),
      title: row.title,
      description: row.description || row.summary || row.content || "",
      forClass: row.forClass || row.class_name || "All Students",
      date: firstTenChars(row.created_at || row.date) || "",
      deadline: firstTenChars(row.deadline),
      category: titleCaseCategory(row.category),
      priority: row.priority,
      source: row.source,
      tags: row.tags || [],
      venue: row.venue || "Not specified",
      aiGenerated: Boolean(row.aiGenerated || row.ai_generated),
      subject: row.subject,
      action: row.action,
      time: row.time
    };
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
      return Object.assign({}, a, { _tone: CB.util.toneForCategory(a.category) });
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
        '</div>' +
        (item.aiGenerated ? '<span class="ai-badge">AI sorted this</span>' : '');
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

  CB.api.getNotices().then(function (res) {
    // Keep the polished demo/sample announcements when the database is empty.
    if (res && Array.isArray(res.notices) && res.notices.length) {
      allAnnouncements = res.notices.map(mapNotice);
      render();
    } else {
      render();
    }
  }).catch(function () {
    // API failure must never blank the page.
    render();
  });
  });
})();
