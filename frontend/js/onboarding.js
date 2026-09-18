/* =========================================================
   CAMPUS BOARD — onboarding.js
   Drives the "Create New Board" registration modal on index.html.
   Steps: 1 Credentials & Name -> 2 Role -> 3 Class -> 4 Interests -> 5 Ready.
   Depends on main.js (CB.storage, CB.api) being loaded first.
   ========================================================= */

(function () {
  "use strict";

  var modal = document.getElementById("build-board");
  if (!modal) return; // this script only runs on the landing page

  var steps = Array.prototype.slice.call(document.querySelectorAll("#build-board .onboarding-step"));
  var dots = Array.prototype.slice.call(document.querySelectorAll("#build-board .progress-dot"));
  var progressLines = Array.prototype.slice.call(document.querySelectorAll("#build-board .progress-line"));
  var buildLinks = document.querySelectorAll(".js-build-board");
  var closeButtons = document.querySelectorAll("[data-close-board]");

  var currentStep = 1;
  var nameValue = "";
  var emailValue = "";
  var passwordValue = "";
  var roleChoice = "";
  var classInfo = { year: "1st Year", branch: "CSE", section: "A" };
  var interests = new Set();

  var nameInput = document.getElementById("field-name");
  var emailInput = document.getElementById("field-email");
  var passwordInput = document.getElementById("field-password");
  var errorMsgEl = document.getElementById("onboarding-error");

  function showError(msg) {
    if (errorMsgEl) {
      errorMsgEl.textContent = msg;
      errorMsgEl.style.display = "block";
    }
  }

  function hideError() {
    if (errorMsgEl) {
      errorMsgEl.textContent = "";
      errorMsgEl.style.display = "none";
    }
  }

  function openBoard(e) {
    if (e) e.preventDefault();

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    showStep(1);
  }

  function closeBoard() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    hideError();
  }

  function showStep(number) {
    currentStep = number;
    steps.forEach(function (step) {
      step.classList.toggle("is-active", Number(step.dataset.step) === number);
    });
    dots.forEach(function (dot, index) { dot.classList.toggle("is-active", index < number); });
    progressLines.forEach(function (line, index) { line.classList.toggle("is-active", index < number - 1); });
    if (number === 1 && nameInput) nameInput.focus();
  }

  function updateButtons() {
    var step1Next = document.querySelector('#build-board [data-step="1"] [data-next]');
    var step2Next = document.querySelector('#build-board [data-step="2"] [data-next]');
    var step4Next = document.querySelector('#build-board [data-step="4"] [data-next]');
    if (step1Next) {
      step1Next.disabled = !(nameValue.trim() && emailValue.trim() && passwordValue.trim());
    }
    if (step2Next) step2Next.disabled = !roleChoice;
    if (step4Next) step4Next.disabled = interests.size === 0;
  }

  buildLinks.forEach(function (link) { link.addEventListener("click", openBoard); });
  closeButtons.forEach(function (button) { button.addEventListener("click", closeBoard); });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal.classList.contains("is-open")) closeBoard();
  });

  [nameInput, emailInput, passwordInput].forEach(function (input) {
    if (!input) return;
    input.addEventListener("input", function () {
      nameValue = nameInput ? nameInput.value : "";
      emailValue = emailInput ? emailInput.value : "";
      passwordValue = passwordInput ? passwordInput.value : "";
      hideError();
      updateButtons();
    });
  });

  document.querySelectorAll('#build-board [data-choice-group="role"]').forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll('#build-board [data-choice-group="role"]').forEach(function (item) {
        item.classList.remove("is-selected");
      });
      button.classList.add("is-selected");
      roleChoice = button.dataset.value;
      updateButtons();
    });
  });

  document.querySelectorAll('#build-board [data-choice-group="interest"]').forEach(function (button) {
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
    var select = document.querySelector('#build-board [data-field="' + field + '"]');
    if (!select) return;
    classInfo[field] = select.value;
    select.addEventListener("change", function () { classInfo[field] = select.value; });
  });

  document.querySelectorAll("#build-board [data-next]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (currentStep === 1) {
        if (!nameValue.trim() || !emailValue.trim() || !passwordValue.trim()) {
          showError("Please fill in all required fields.");
          return;
        }
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue.trim())) {
          showError("Please enter a valid college email ID.");
          return;
        }
        hideError();
        showStep(2);
      } else if (currentStep === 2 && roleChoice) {
        showStep(3);
      } else if (currentStep === 3) {
        showStep(4);
      } else if (currentStep === 4 && interests.size) {
        var interestList = Array.from(interests);
        var classLabel = classInfo.year + " · " + classInfo.branch + " · Section " + classInfo.section;
        var nameLabelEl = document.querySelector("#build-board [data-name-label]");
        var classLabelEl = document.querySelector("#build-board [data-class-label]");
        var roleLabelEl = document.querySelector("#build-board [data-role-label]");
        var countEl = document.querySelector("#build-board [data-interest-count]");
        var firstInterestEl = document.querySelector("#build-board [data-first-interest]");
        if (nameLabelEl) nameLabelEl.textContent = nameValue.trim();
        if (classLabelEl) classLabelEl.textContent = classLabel;
        if (roleLabelEl) roleLabelEl.textContent = roleChoice;
        if (countEl) countEl.textContent = interestList.length;
        if (firstInterestEl) firstInterestEl.textContent = interestList[0];
        showStep(5);
      }
    });
  });

  document.querySelectorAll("#build-board [data-back]").forEach(function (button) {
    button.addEventListener("click", function () { showStep(Math.max(1, currentStep - 1)); });
  });

  var finishButton = document.querySelector("#build-board [data-finish]");
  if (finishButton) {
    finishButton.addEventListener("click", function () {
      var payload = {
        name: nameValue.trim(),
        college_email: emailValue.trim(),
        password: passwordValue.trim(),
        role: roleChoice,
        year: classInfo.year,
        branch: classInfo.branch,
        section: classInfo.section,
        college: "Indira Gandhi Delhi Technical University for Women",
        interests: Array.from(interests)
      };

      finishButton.disabled = true;
      finishButton.textContent = "Creating board…";

      if (CB.api && CB.api.register) {
        CB.api.register(payload).then(function (res) {
          finishButton.disabled = false;
          finishButton.textContent = "Enter my board →";

          if (res && (res.user || res.message)) {
            var userProfile = res.user || payload;
            CB.storage.saveProfile(userProfile);
            closeBoard();
            window.location.href = "dashboard.html";
          } else if (res && res.error) {
            showStep(1);
            showError(res.error);
            CB.util.toast(res.error);
          } else {
            CB.storage.saveProfile(payload);
            closeBoard();
            window.location.href = "dashboard.html";
          }
        }).catch(function (err) {
          finishButton.disabled = false;
          finishButton.textContent = "Enter my board →";
          showStep(1);
          showError(err.message || "Registration failed. Please try again.");
        });
      } else {
        CB.storage.saveProfile(payload);
        closeBoard();
        window.location.href = "dashboard.html";
      }
    });
  }

  updateButtons();
})();
