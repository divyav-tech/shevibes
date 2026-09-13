/* =========================================================
   CAMPUS BOARD — onboarding.js
   Drives the "Build My Board" modal on index.html.
   Depends on main.js (CB.storage) being loaded first.
   ========================================================= */

(function () {
  "use strict";

  var modal = document.getElementById("build-board");
  if (!modal) return; // this script only runs on the landing page

  var steps = Array.prototype.slice.call(document.querySelectorAll(".onboarding-step"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".progress-dot"));
  var progressLines = Array.prototype.slice.call(document.querySelectorAll(".progress-line"));
  var buildLinks = document.querySelectorAll(".js-build-board, .js-my-board");
  var closeButtons = document.querySelectorAll("[data-close-board]");

  var currentStep = 1;
  var roleChoice = "";
  var classInfo = { year: "1st Year", branch: "CSE", section: "A" };
  var interests = new Set();

  function openBoard(e) {
    if (e) e.preventDefault();

    // Returning user with a saved profile — skip onboarding entirely.
    if (CB.storage.hasProfile()) {
      window.location.href = "dashboard.html";
      return;
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    showStep(1);
  }

  function closeBoard() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function showStep(number) {
    currentStep = number;
    steps.forEach(function (step) {
      step.classList.toggle("is-active", Number(step.dataset.step) === number);
    });
    dots.forEach(function (dot, index) { dot.classList.toggle("is-active", index < number); });
    progressLines.forEach(function (line, index) { line.classList.toggle("is-active", index < number - 1); });
  }

  function updateButtons() {
    var step1Next = document.querySelector('[data-step="1"] [data-next]');
    var step3Next = document.querySelector('[data-step="3"] [data-next]');
    if (step1Next) step1Next.disabled = !roleChoice;
    if (step3Next) step3Next.disabled = interests.size === 0;
  }

  buildLinks.forEach(function (link) { link.addEventListener("click", openBoard); });
  closeButtons.forEach(function (button) { button.addEventListener("click", closeBoard); });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal.classList.contains("is-open")) closeBoard();
  });

  document.querySelectorAll('[data-choice-group="role"]').forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll('[data-choice-group="role"]').forEach(function (item) {
        item.classList.remove("is-selected");
      });
      button.classList.add("is-selected");
      roleChoice = button.dataset.value;
      updateButtons();
    });
  });

  document.querySelectorAll('[data-choice-group="interest"]').forEach(function (button) {
    button.addEventListener("click", function () {
      var value = button.dataset.value;
      if (interests.has(value)) {
        interests.delete(value);
        button.classList.remove("is-selected");
      } else {
        interests.add(value);
        button.classList.add("is-selected");
      }
      updateButtons();
    });
  });

  ["year", "branch", "section"].forEach(function (field) {
    var select = document.querySelector('[data-field="' + field + '"]');
    if (!select) return;
    classInfo[field] = select.value;
    select.addEventListener("change", function () { classInfo[field] = select.value; });
  });

  document.querySelectorAll("[data-next]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (currentStep === 1 && roleChoice) {
        showStep(2);
      } else if (currentStep === 2) {
        showStep(3);
      } else if (currentStep === 3 && interests.size) {
        var interestList = Array.from(interests);
        var classLabel = classInfo.year + " · " + classInfo.branch + " · Section " + classInfo.section;
        var classLabelEl = document.querySelector("[data-class-label]");
        var roleLabelEl = document.querySelector("[data-role-label]");
        var countEl = document.querySelector("[data-interest-count]");
        var firstInterestEl = document.querySelector("[data-first-interest]");
        if (classLabelEl) classLabelEl.textContent = classLabel;
        if (roleLabelEl) roleLabelEl.textContent = roleChoice;
        if (countEl) countEl.textContent = interestList.length;
        if (firstInterestEl) firstInterestEl.textContent = interestList[0];
        showStep(4);
      }
    });
  });

  document.querySelectorAll("[data-back]").forEach(function (button) {
    button.addEventListener("click", function () { showStep(Math.max(1, currentStep - 1)); });
  });

  var finishButton = document.querySelector("[data-finish]");
  if (finishButton) {
    finishButton.addEventListener("click", function () {
      var profile = {
        role: roleChoice,
        year: classInfo.year,
        branch: classInfo.branch,
        section: classInfo.section,
        interests: Array.from(interests)
      };
      CB.storage.saveProfile(profile);
      closeBoard();
      window.location.href = "dashboard.html";
    });
  }

  // If someone already has a profile and lands directly on the page
  // (e.g. bookmarked), quietly let them jump straight to the dashboard
  // via the same "Build My Board" / "My Board" entry points — handled
  // above in openBoard(), so no extra redirect is needed on load.

  updateButtons();
})();
