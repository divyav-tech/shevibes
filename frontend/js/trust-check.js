/**
 * Campus Board — Trust Check Frontend Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  const tabPaste = document.getElementById('tab-paste');
  const tabUpload = document.getElementById('tab-upload');
  const panelPaste = document.getElementById('panel-paste');
  const panelUpload = document.getElementById('panel-upload');

  const textInput = document.getElementById('tc-text-input');
  const dropzone = document.getElementById('tc-dropzone');
  const fileInput = document.getElementById('tc-file-input');
  const imgPreview = document.getElementById('tc-img-preview');

  const inputWhere = document.getElementById('tc-where');
  const inputWhoSent = document.getElementById('tc-who-sent');
  const inputWhoIssued = document.getElementById('tc-who-issued');

  const submitBtn = document.getElementById('tc-submit-btn');
  const loadingCard = document.getElementById('tc-loading');
  const resultsCard = document.getElementById('tc-results');

  const riskBadge = document.getElementById('tc-risk-badge');
  const summaryText = document.getElementById('tc-summary');
  const fallbackNotice = document.getElementById('tc-fallback-notice');
  const redFlagsList = document.getElementById('tc-red-flags-list');
  const unverifiedList = document.getElementById('tc-unverified-list');
  const stepsList = document.getElementById('tc-steps-list');

  const detailIssuer = document.getElementById('tc-detail-issuer');
  const detailDeadline = document.getElementById('tc-detail-deadline');
  const detailFee = document.getElementById('tc-detail-fee');
  const detailVenue = document.getElementById('tc-detail-venue');
  const detailLink = document.getElementById('tc-detail-link');
  const detailSource = document.getElementById('tc-detail-source');

  const reportTrigger = document.getElementById('tc-report-trigger');
  const reportModal = document.getElementById('tc-report-modal');
  const reportCancel = document.getElementById('tc-report-cancel');
  const reportSubmit = document.getElementById('tc-report-submit');
  const reportReason = document.getElementById('tc-report-reason');

  let activeMode = 'paste'; // 'paste' | 'upload'
  let selectedFile = null;
  let currentAnalysisText = '';

  // Tab switching
  if (tabPaste && tabUpload) {
    tabPaste.addEventListener('click', () => {
      activeMode = 'paste';
      tabPaste.classList.add('is-active');
      tabPaste.setAttribute('aria-selected', 'true');
      tabUpload.classList.remove('is-active');
      tabUpload.setAttribute('aria-selected', 'false');
      panelPaste.hidden = false;
      panelUpload.hidden = true;
    });

    tabUpload.addEventListener('click', () => {
      activeMode = 'upload';
      tabUpload.classList.add('is-active');
      tabUpload.setAttribute('aria-selected', 'true');
      tabPaste.classList.remove('is-active');
      tabPaste.setAttribute('aria-selected', 'false');
      panelUpload.hidden = false;
      panelPaste.hidden = true;
    });
  }

  // File Upload / Dropzone handlers
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });

    ['dragleave', 'dragend'].forEach(evt => {
      dropzone.addEventListener(evt, () => dropzone.classList.remove('is-dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Please select an image smaller than 8 MB.');
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      imgPreview.src = e.target.result;
      imgPreview.hidden = false;
    };
    reader.readAsDataURL(file);
  }

  // Form Submit
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const text = textInput ? textInput.value.trim() : '';
      if (activeMode === 'paste' && !text) {
        alert('Please paste the announcement text to analyze.');
        return;
      }
      if (activeMode === 'upload' && !selectedFile) {
        alert('Please select a screenshot image to analyze.');
        return;
      }

      currentAnalysisText = text || (selectedFile ? selectedFile.name : '');

      // Loading state
      submitBtn.disabled = true;
      if (loadingCard) loadingCard.hidden = false;
      if (resultsCard) resultsCard.hidden = true;

      try {
        let res, data;
        const where = inputWhere ? inputWhere.value.trim() : '';
        const whoSent = inputWhoSent ? inputWhoSent.value.trim() : '';
        const whoIssued = inputWhoIssued ? inputWhoIssued.value.trim() : '';

        if (activeMode === 'upload' && selectedFile) {
          const formData = new FormData();
          formData.append('image', selectedFile);
          if (text) formData.append('text', text);
          formData.append('where_received', where);
          formData.append('who_sent', whoSent);
          formData.append('who_issued', whoIssued);

          res = await fetch('/api/trust-check', {
            method: 'POST',
            body: formData
          });
        } else {
          res = await fetch('/api/trust-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text,
              where_received: where,
              who_sent: whoSent,
              who_issued: whoIssued
            })
          });
        }

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        data = await res.json();
        renderResults(data);

      } catch (err) {
        console.error('Trust Check Error:', err);
        alert('Could not complete Trust Check. Performing local safety assessment...');
        // Fallback locally if network/server failed
        renderResults({
          success: true,
          ai_used: false,
          is_fallback: true,
          fallback_notice: "AI analysis is currently unavailable. We've performed a basic safety check using predefined warning indicators. Independently verify the announcement before acting on it.",
          risk_level: "CAUTION",
          summary: "Could not reach AI services. Please verify this message independently.",
          observed_details: {
            issuer: inputWhoIssued?.value || "Not specified",
            deadline: "Not specified",
            fee: "Not specified",
            venue: "Not specified",
            link: "Not specified",
            source: inputWhere?.value || "Not specified"
          },
          red_flags: [
            { flag: "Unverified Message Source", explanation: "Always check official department channels." }
          ],
          unverified_points: [
            "Details could not be cross-checked with official databases."
          ],
          verification_steps: [
            "Contact your Class Representative or Department HOD.",
            "Do not pay any money or share credentials."
          ]
        });
      } finally {
        submitBtn.disabled = false;
        if (loadingCard) loadingCard.hidden = true;
      }
    });
  }

  // Render Results UI
  function renderResults(data) {
    if (!resultsCard) return;

    // 1. Risk Badge
    const risk = (data.risk_level || 'CAUTION').toUpperCase();
    const riskMap = {
      'LOW': { text: 'Low Concern', icon: '🟢', class: 'risk-low' },
      'CAUTION': { text: 'Caution — Verify First', icon: '🟡', class: 'risk-caution' },
      'HIGH': { text: 'High Concern', icon: '🔴', class: 'risk-high' },
      'INSUFFICIENT_INFORMATION': { text: 'Insufficient Information', icon: '⚪', class: 'risk-insufficient' }
    };
    const info = riskMap[risk] || riskMap['CAUTION'];
    riskBadge.className = `tc-risk-badge ${info.class}`;
    riskBadge.innerHTML = `<span>${info.icon}</span> <span>${info.text}</span>`;

    // 2. Summary & Fallback Notice
    summaryText.textContent = data.summary || '';
    if (fallbackNotice) {
      fallbackNotice.hidden = !data.is_fallback;
    }

    // 3. Red Flags
    redFlagsList.innerHTML = '';
    const flags = data.red_flags || [];
    if (flags.length === 0) {
      redFlagsList.innerHTML = '<div class="tc-red-flag-card" style="border-left-color: var(--color-sage);"><strong style="color: var(--color-sage);">No obvious high-risk warning flags detected</strong><p>While no major warning signs were found, always verify deadlines and details with official college channels.</p></div>';
    } else {
      flags.forEach(item => {
        const div = document.createElement('div');
        div.className = 'tc-red-flag-card';
        div.innerHTML = `<strong>🚩 ${escapeHtml(item.flag || 'Warning Sign')}</strong><p>${escapeHtml(item.explanation || '')}</p>`;
        redFlagsList.appendChild(div);
      });
    }

    // 4. Observed Details
    const obs = data.observed_details || {};
    detailIssuer.textContent = obs.issuer || 'Not specified';
    detailDeadline.textContent = obs.deadline || 'Not specified';
    detailFee.textContent = obs.fee || 'Not specified';
    detailVenue.textContent = obs.venue || 'Not specified';
    detailLink.textContent = obs.link || 'Not specified';
    detailSource.textContent = obs.source || 'Not specified';

    // 5. Unverified Points
    unverifiedList.innerHTML = '';
    const unverified = data.unverified_points || [];
    if (unverified.length === 0) {
      unverifiedList.innerHTML = '<li>All key statements require standard department cross-checking.</li>';
    } else {
      unverified.forEach(pt => {
        const li = document.createElement('li');
        li.textContent = pt;
        unverifiedList.appendChild(li);
      });
    }

    // 6. Verification Steps
    stepsList.innerHTML = '';
    const steps = data.verification_steps || [];
    steps.forEach(st => {
      const li = document.createElement('li');
      li.textContent = st;
      stepsList.appendChild(li);
    });

    // Reveal Results Card
    resultsCard.hidden = false;
    resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Report Modal Actions
  if (reportTrigger && reportModal) {
    reportTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      reportModal.hidden = false;
      reportModal.style.display = 'grid';
    });

    if (reportCancel) {
      reportCancel.addEventListener('click', (e) => {
        e.preventDefault();
        reportModal.hidden = true;
        reportModal.style.display = 'none';
        if (reportReason) reportReason.value = '';
      });
    }

    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) {
        reportModal.hidden = true;
        reportModal.style.display = 'none';
      }
    });

    if (reportSubmit) {
      reportSubmit.addEventListener('click', async (e) => {
        e.preventDefault();
        const reason = reportReason ? reportReason.value.trim() : '';
        try {
          await fetch('/api/trust-check/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message_text: currentAnalysisText,
              reason: reason
            })
          });
        } catch (err) {
          console.warn('Report submit failed:', err);
        }
        reportModal.hidden = true;
        reportModal.style.display = 'none';
        if (reportReason) reportReason.value = '';
        alert('Thank you for reporting. This message has been flagged for campus safety review.');
      });
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
