// Presentation-only controls. No extension code, file processing, or portal integration.
(() => {
  const root = document.getElementById('ndcInteractiveDemo'), panel = document.getElementById('ndcLimitedPreview'), hero = document.getElementById('ndcHeroMockup'); if (!root || !panel) return;
  const names = ['Aadhaar.pdf', 'INS.pdf', 'INV.pdf'];
  const heading = '<div class="mock-head"><img src="logo.png" alt="ND"><div><strong>VAHAN NDC TOOL <small>5.2.0</small></strong><p>Vehicle registration document uploader</p></div><button type="button" data-mock="settings" aria-label="Preview settings">⚙</button></div>';
  const tabs = ['Preferences', 'Log contents', 'Filename hints', 'Session monitor'];
  const options = ['Convert images to PDF', 'Automatic Upload', 'Skip Already Uploaded Documents', 'Automatic file movement & submission', 'Show Log on Page After Submission', 'Auto Copy Logs to Clipboard', 'Automatic ZIP Download'];
  let scene = 'documents', settingsTab = 'Preferences';
  function rows(folder = false) { return `<div class="mock-files">${names.map((name, i) => `<div class="mock-file">${folder ? '<input type="checkbox" aria-label="Select ' + name + '">' : ''}<span class="mock-pdf">PDF</span><span><strong>${name}</strong><small>${['Address proof', 'Insurance', 'Dealer invoice'][i]} · Sample document</small></span><em>Ready</em><button type="button" data-mock="preview" data-index="${i}" aria-label="Preview ${name}">◉</button></div>`).join('')}</div>`; }
  function settings() { return `<button type="button" class="mock-back" data-mock="documents">← Back to documents</button><div class="mock-welcome"><small>MAKE IT YOURS</small><h3>Workspace settings</h3><p>Your preferences, document guide, and session activity.</p></div><div class="mock-tabs">${tabs.map(t => `<button type="button" data-tab="${t}" aria-pressed="${settingsTab === t}">${t}</button>`).join('')}</div>${settingsTab === 'Preferences' ? '<div class="mock-folder"><strong>Customer documents folder</strong><p>Choose the folder containing all customer folders.</p><span>Sample customers / Demo customer</span></div><label class="mock-setting mock-danger-preference"><span><strong>Auto import/prepare/upload matched documents in CX folder</strong><small>Off by default. Import on workspace opening; upload follows Automatic Upload.</small></span><input type="checkbox" aria-label="Preview automatic CX folder import setting"></label>' + options.map((t, i) => `<label class="mock-setting"><span>${t}</span><input type="checkbox" ${[1, 2, 4].includes(i) ? 'checked' : ''}></label>`).join('') : settingsTab === 'Log contents' ? '<p class="mock-note">Always included: application number, completion status and RTA office after submission.</p>' + ['Customer name', 'Full owner details', 'Full insurance details', 'HP / hypothecation details', 'Chassis number', 'Application date'].map(t => `<label class="mock-setting"><span>${t}</span><input type="checkbox" checked></label>`).join('') : settingsTab === 'Filename hints' ? '<div class="mock-folder"><strong>Filename hints</strong><p>Aadhaar.pdf → Address Proof<br>INS.pdf → Insurance<br>INV.pdf → Dealer Invoice</p><p>Conflicting filenames can be assigned manually in the extension.</p></div>' : '<div class="mock-folder"><strong>Session monitor</strong><p>Demo user · Sample session</p><p>Account and connection details appear here in the extension.</p></div>'}`; }
  function documents() { return `<div class="mock-welcome"><small>YOUR DOCUMENT WORKSPACE</small><h3>Welcome back, <span>Demo user.</span></h3><p>Prepare your documents and keep every step in view.</p></div><ol class="mock-stages"><li>1 &nbsp; Select</li><li class="active">2 &nbsp; Prepare</li><li>3 &nbsp; Upload</li></ol><div class="mock-picker"><div><strong>▤ &nbsp; Add your documents</strong><p>PDF or images · Up to 12 files</p><small>Prepared locally. Your originals stay unchanged.</small></div><div class="mock-picker-actions"><button type="button" data-mock="folder">Choose documents</button><button type="button" class="mock-gold" data-mock="auto-import">Auto-import available</button><button type="button" data-mock="folder">Browse files manually</button></div><small class="mock-import-status" role="status"></small></div><div class="mock-section-title"><strong>Selected files</strong><small>3 sample files · Ready for review</small></div>${rows()}<div class="mock-active"><strong>Active settings</strong><span>Skip uploaded files</span><span>Submission log</span><button type="button" data-mock="settings">Edit</button></div>`; }
  function draw(target, view) { let body = documents(); if (view === 'preferences') body = settings(); if (view === 'folder') body = '<div class="mock-welcome"><small>CUSTOMER DOCUMENTS</small><h3>Documents in Demo customer</h3><p>Try selecting sample documents or opening a preview.</p></div>' + rows(true); if (view === 'preparation') body = '<div class="mock-welcome"><small>PREPARATION</small><h3>Preparing your documents</h3><p>Preparation status appears here in the extension.</p></div><div class="mock-progress"><i></i></div><p class="mock-note">Preparing 2 of 3 documents · Insurance.pdf</p><button type="button" class="mock-cancel" data-mock="cancel">Cancel preparation</button>'; if (view === 'monitor-progress') body = '<div class="mock-welcome"><small>DOCUMENT MONITOR</small><h3>Every document in view</h3><p>Illustrative progress · 2 uploaded · 1 pending</p></div>' + rows() + '<p class="mock-note">The extension shows uploaded, skipped, failed, and pending counts here.</p>'; if (view === 'log-upload') body = '<div class="mock-welcome"><small>FINAL LOG</small><h3>Upload complete</h3><p>A readable record of the completed workflow.</p></div><dl class="mock-log"><dt>Application</dt><dd>DEMO-2026-001234</dd><dt>Customer</dt><dd>Demo customer</dd><dt>Status</dt><dd>Completed · Sample data</dd></dl><button type="button" data-mock="copied">Try Copy details</button><p class="mock-note">Display-only preview. No information is copied to your clipboard.</p>'; target.innerHTML = heading + body; }
  function show(next) { scene = next; root.querySelectorAll('[data-scene]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === scene))); draw(panel, scene); }
  function events(container, isHero) { container.addEventListener('click', event => { const b = event.target.closest('button'); if (!b) return; if (b.dataset.tab) { settingsTab = b.dataset.tab; draw(container, 'preferences'); return; } if (b.dataset.mock === 'preview') { const card = document.querySelectorAll('.ndc-shot')[2]; card?.querySelector('button').click(); return; } if (b.dataset.mock === 'cancel') { b.parentElement.innerHTML = '<div class="mock-welcome"><h3>Preparation cancelled</h3><p>Completed documents stay available. Queued uploads do not start.</p><button type="button" data-mock="documents">Back to documents</button></div>'; return; } if (b.dataset.mock === 'auto-import') { container.querySelector('.mock-import-status').textContent = '3 / 12 categories imported (sample). Available documents are ready for review.'; return; } if (b.dataset.mock === 'copied') { b.textContent = 'Sample details ready'; return; } if (b.dataset.mock) { const next = b.dataset.mock === 'settings' ? 'preferences' : b.dataset.mock; if (isHero) draw(container, next); else show(next); } }); }
  root.addEventListener('click', event => { const b = event.target.closest('button'); if (b?.dataset.scene) show(b.dataset.scene); if (b?.id === 'ndcSourceReset') { settingsTab = 'Preferences'; show('documents'); } }); events(panel, false); if (hero) { draw(hero, 'documents'); events(hero, true); } show('documents');
})();

/* ============================================================
   INTERACTIVE DEMOS - v5.3.0 Advanced Features
   ============================================================ */
(() => {
  "use strict";

  // --- Demo 1: Drag & Drop ---
  const demoDropzone = document.getElementById('demo-dragdrop-stage');
  if (demoDropzone) {
    let droppedFiles = [];
    let fileIdCounter = 0;

    const sampleFiles = [
      { name: 'Aadhaar.pdf', type: 'pdf', size: '245 KB' },
      { name: 'INS.pdf', type: 'pdf', size: '180 KB' },
      { name: 'INV.pdf', type: 'pdf', size: '312 KB' },
      { name: 'CHASSIS.jpg', type: 'img', size: '156 KB' },
      { name: 'FORM20.pdf', type: 'pdf', size: '390 KB' },
      { name: 'PAN.pdf', type: 'pdf', size: '89 KB' },
      { name: 'FRONTPHOTO.png', type: 'img', size: '203 KB' },
      { name: 'SIGN.webp', type: 'img', size: '45 KB' },
    ];

    function renderDropzone() {
      const filesHtml = droppedFiles.length
        ? droppedFiles.map(f => `
            <div class="drop-file-row" data-fid="${f.id}">
              <span class="drop-file-type ${f.type}">${f.type.toUpperCase()}</span>
              <div class="drop-file-info">
                <span class="drop-file-name">${f.name}</span>
                <span class="drop-file-size">${f.size}</span>
              </div>
              <span class="drop-file-status">Ready</span>
              <button class="drop-file-remove" aria-label="Remove ${f.name}">×</button>
            </div>
          `).join('')
        : '<p class="drop-empty">No files dropped yet. Try dragging files above or press <kbd>Enter</kbd> to select.</p>';

      demoDropzone.innerHTML = `
        <div class="demo-dropzone" role="button" tabindex="0" aria-label="Drag and drop files here, or press Enter to choose files">
          <span class="drop-icon">📁</span>
          <div class="drop-title">Drop files here</div>
          <div class="drop-sub">PDF, JPG, PNG, WEBP · Up to 12 files · 400 KB each</div>
          <div class="drop-keyboard">Or press <kbd>Enter</kbd> / <kbd>Space</kbd> to open file picker</div>
        </div>
        <div class="drop-zone-inner">${filesHtml}</div>
      `;

      // Attach event listeners
      const dropzone = demoDropzone.querySelector('.demo-dropzone');
      dropzone.addEventListener('dragover', handleDragOver);
      dropzone.addEventListener('dragleave', handleDragLeave);
      dropzone.addEventListener('drop', handleDrop);
      dropzone.addEventListener('keydown', handleKeyDown);
      dropzone.addEventListener('click', () => dropzone.focus());

      demoDropzone.querySelectorAll('.drop-file-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fid = Number(btn.closest('.drop-file-row').dataset.fid);
          droppedFiles = droppedFiles.filter(f => f.id !== fid);
          renderDropzone();
        });
      });
    }

    function handleDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      e.target.closest('.demo-dropzone').classList.add('drag-active');
    }

    function handleDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      const dropzone = e.target.closest('.demo-dropzone');
      if (!dropzone.contains(e.relatedTarget)) {
        dropzone.classList.remove('drag-active');
      }
    }

    function handleDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      const dropzone = e.target.closest('.demo-dropzone');
      dropzone.classList.remove('drag-active');

      const files = e.dataTransfer.files;
      if (!files.length) return;

      addFiles(files);
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Simulate file selection - add a sample file
        if (droppedFiles.length < 12) {
          const sample = sampleFiles[droppedFiles.length % sampleFiles.length];
          droppedFiles.push({ ...sample, id: ++fileIdCounter });
          renderDropzone();
        }
      }
    }

    function addFiles(files) {
      for (const file of files) {
        if (droppedFiles.length >= 12) break;
        droppedFiles.push({
          id: ++fileIdCounter,
          name: file.name,
          type: file.type.startsWith('image/') ? 'img' : 'pdf',
          size: formatSize(file.size)
        });
      }
      renderDropzone();
    }

    function formatSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    renderDropzone();
  }

  // --- Demo 2: Searchable Hints ---
  const searchHintsStage = document.getElementById('demo-searchhints-stage');
  if (searchHintsStage) {
    const addressProofData = [
      { keyword: 'aadhar / aadhaar', category: 'Aadhaar Card', desc: 'Ex: aadhar.jpg || aadhaar.pdf' },
      { keyword: 'bankpassbook / passbook', category: 'Bank Passbook with Photo', desc: 'Ex: bankpassbook.jpg || passbook.pdf' },
      { keyword: 'electricitybill / currentbill', category: 'Electricity Bill', desc: 'Ex: electricitybill.jpg || electricity.pdf' },
      { keyword: 'gasbill', category: 'Gas Bill', desc: 'Ex: gasbill.jpg || gasbill.pdf' },
      { keyword: 'gst / gstcertificate', category: 'GST or Company Registered Certificate', desc: 'Ex: gstcertificate.jpg || gstcertificate.pdf' },
      { keyword: 'waterbill', category: 'Latest Water Bill Delhi Jal Board', desc: 'Ex: waterbill.jpg || waterbill.pdf' },
      { keyword: 'passport', category: 'Passport', desc: 'Ex: passport.jpg || passport.pdf' },
      { keyword: 'rationcard', category: 'Ration Card', desc: 'Ex: rationcard.jpg || rationcard.pdf' },
      { keyword: 'telephonebill', category: 'Telephone Bill', desc: 'Ex: telephonebill.jpg || landlinebill.pdf' },
      { keyword: 'voterid / voter', category: 'Voter ID', desc: 'Ex: voterid.jpg || votercard.pdf' },
    ];

    const otherDocsData = [
      { keyword: 'insurance', category: 'Certificate of Insurance', desc: 'Ex: insurance.jpg || INS.pdf' },
      { keyword: 'invoice', category: 'Dealers Invoice', desc: 'Ex: invoice.jpg || INV.pdf' },
      { keyword: 'form20', category: 'Form 20 – Finance', desc: 'Ex: form20.jpg || F20.pdf' },
      { keyword: 'inspection / signedform20', category: 'VAHAN Form 20 – Signed', desc: 'Ex: inspection.jpg || INSP.pdf' },
      { keyword: 'form22', category: 'Form 22 – Road Worthiness', desc: 'Ex: form22.jpg || F22.pdf' },
      { keyword: 'form21', category: 'Form 21 – Sale Certificate', desc: 'Ex: form21.jpg || F21.pdf' },
      { keyword: 'frontphoto / vehiclephoto', category: 'Owners Photo with Vehicle', desc: 'Ex: frontphoto.jpg || CWVP.pdf' },
      { keyword: 'chassis / chassisphoto', category: 'Photo of Chassis', desc: 'Ex: chassis.jpg || CHAS.pdf' },
      { keyword: 'signature / sign', category: 'Owners Signature', desc: 'Ex: signature.jpg || SN.pdf' },
      { keyword: 'pan / pancard', category: 'PAN Card', desc: 'Ex: pan.jpg || PAN.pdf' },
      { keyword: 'ownerphoto / photo', category: 'Owners Photo', desc: 'Ex: ownerphoto.jpg || PIC.pdf' },
    ];

    let searchQuery1 = '', searchQuery2 = '';

    function escapeHtml(text) {
      return String(text).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c]));
    }

    function highlightMatch(text, query) {
      if (!query) return escapeHtml(text);
      const regex = new RegExp(`(${escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return escapeHtml(text).replace(regex, '<mark>$1</mark>');
    }

    function renderSearchHints() {
      searchHintsStage.innerHTML = `
        <div class="demo-search-hints-container">
          <div class="demo-search-row">
            <div class="demo-search-input-wrapper">
              <span class="demo-search-icon">🔍</span>
              <input type="search" class="demo-search-input" id="search-address-proof"
                placeholder="Search Address Proof keywords (e.g., aadhaar, gst, electricity)..."
                value="${escapeHtml(searchQuery1)}"
                aria-label="Search Address Proof hints">
              <button type="button" class="demo-search-clear" id="clear-search1" aria-label="Clear search">✕</button>
            </div>
            <div class="demo-search-input-wrapper">
              <span class="demo-search-icon">🔍</span>
              <input type="search" class="demo-search-input" id="search-other-docs"
                placeholder="Search Other Documents keywords (e.g., insurance, invoice, form20)..."
                value="${escapeHtml(searchQuery2)}"
                aria-label="Search Other Documents hints">
              <button type="button" class="demo-search-clear" id="clear-search2" aria-label="Clear search">✕</button>
            </div>
          </div>

          <div class="demo-search-table-wrap">
            <table class="demo-search-table" id="table-address-proof">
              <thead>
                <tr><th>Keyword</th><th class="category-col">VAHAN Category</th><th>Example</th></tr>
              </thead>
              <tbody>
                ${addressProofData.map(item => {
        const match1 = !searchQuery1 || item.keyword.toLowerCase().includes(searchQuery1.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery1.toLowerCase()) ||
          item.desc.toLowerCase().includes(searchQuery1.toLowerCase());
        return `
                    <tr class="${match1 ? '' : 'hidden'}">
                      <td><code>${highlightMatch(item.keyword, searchQuery1)}</code></td>
                      <td class="category-col">${escapeHtml(item.category)}</td>
                      <td><small>${escapeHtml(item.desc)}</small></td>
                    </tr>
                  `;
      }).join('')}
              </tbody>
            </table>
          </div>

          <div class="demo-search-table-wrap" style="margin-top: 16px;">
            <table class="demo-search-table" id="table-other-docs">
              <thead>
                <tr><th>Keyword</th><th class="category-col">VAHAN Category</th><th>Example</th></tr>
              </thead>
              <tbody>
                ${otherDocsData.map(item => {
        const match2 = !searchQuery2 || item.keyword.toLowerCase().includes(searchQuery2.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery2.toLowerCase()) ||
          item.desc.toLowerCase().includes(searchQuery2.toLowerCase());
        return `
                    <tr class="${match2 ? '' : 'hidden'}">
                      <td><code>${highlightMatch(item.keyword, searchQuery2)}</code></td>
                      <td class="category-col">${escapeHtml(item.category)}</td>
                      <td><small>${escapeHtml(item.desc)}</small></td>
                    </tr>
                  `;
      }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Attach search handlers
      const input1 = searchHintsStage.querySelector('#search-address-proof');
      const input2 = searchHintsStage.querySelector('#search-other-docs');
      const clear1 = searchHintsStage.querySelector('#clear-search1');
      const clear2 = searchHintsStage.querySelector('#clear-search2');

      input1.addEventListener('input', () => {
        searchQuery1 = input1.value;
        searchHintsStage.querySelector('#clear-search1').classList.toggle('visible', !!searchQuery1);
        renderSearchHints();
      });
      input1.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchQuery1 = ''; input1.value = ''; renderSearchHints(); }
      });

      input2.addEventListener('input', () => {
        searchQuery2 = input2.value;
        searchHintsStage.querySelector('#clear-search2').classList.toggle('visible', !!searchQuery2);
        renderSearchHints();
      });
      input2.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchQuery2 = ''; input2.value = ''; renderSearchHints(); }
      });

      clear1.addEventListener('click', () => { searchQuery1 = ''; input1.value = ''; renderSearchHints(); input1.focus(); });
      clear2.addEventListener('click', () => { searchQuery2 = ''; input2.value = ''; renderSearchHints(); input2.focus(); });
    }

    renderSearchHints();
  }

  // --- Demo 3: Retry & Aadhaar Merge ---
  const retryMergeStage = document.getElementById('demo-retrymerge-stage');
  if (retryMergeStage) {
    let files = [
      { id: 1, name: 'Aadhaar.pdf', type: 'pdf', category: 'Address Proof', status: 'ready', merged: true, sourceFiles: ['1.jpg', '2.jpg'] },
      { id: 2, name: 'INS.pdf', type: 'pdf', category: 'Insurance', status: 'ready' },
      { id: 3, name: 'INV.pdf', type: 'pdf', category: 'Dealer Invoice', status: 'ready' },
      { id: 4, name: 'FORM20.pdf', type: 'pdf', category: 'Form 20 (Finance)', status: 'failed', error: 'Exceeds 390 KB after compression' },
      { id: 5, name: 'CHASSIS.jpg', type: 'img', category: 'Chassis Photo', status: 'skipped', error: "No matching category" },
      { id: 6, name: 'FRONTPHOTO.png', type: 'img', category: 'Owner + Vehicle Photo', status: 'ready' },
    ];

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, c => ({
        '&': '&', '<': '<', '>': '>', '"': '&quot', "'": '&#39;'
      }[c]));
    }

    function renderRetryMerge() {
      retryMergeStage.innerHTML = `
        <div class="demo-retry-merge-container">
          <table class="demo-file-table">
            <thead>
              <tr>
                <th>#</th>
                <th>File</th>
                <th>Type</th>
                <th>Assigned Category</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${files.map((f, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>
                    <span class="${f.type === 'pdf' ? 'demo-file-type pdf' : 'demo-file-type img'}">${f.type.toUpperCase()}</span>
                    <strong>${escapeHtml(f.name)}</strong>
                  </td>
                  <td>${escapeHtml(f.type.toUpperCase())}</td>
                  <td>
                    ${escapeHtml(f.category)}
                    ${f.merged ? `<span class="merge-badge" data-tooltip="Merged from: ${escapeHtml(f.sourceFiles.join(', '))}">Merged (2)ⓘ</span>` : ''}
                  </td>
                  <td>
                    <span class="status-badge status-${escapeHtml(f.status)}">${escapeHtml(f.status.charAt(0).toUpperCase() + f.status.slice(1))}</span>
                    ${f.error ? `<br><small style="color:#ff7777;">${escapeHtml(f.error)}</small>` : ''}
                  </td>
                  <td>
                    ${f.status === 'failed' || f.status === 'skipped'
          ? `<button class="retry-btn" data-fid="${f.id}">↻ Retry</button>`
          : f.status === 'compressing'
            ? `<span style="color:var(--gold);font-size:9px;">Preparing…</span>`
            : '—'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      retryMergeStage.querySelectorAll('.retry-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const fid = Number(btn.dataset.fid);
          const file = files.find(f => f.id === fid);
          if (!file) return;

          // Show compressing state
          file.status = 'compressing';
          renderRetryMerge();

          // Simulate retry completion
          setTimeout(() => {
            file.status = Math.random() > 0.3 ? 'ready' : 'failed';
            if (file.status === 'failed') file.error = 'Still exceeds size limit';
            else file.error = '';
            renderRetryMerge();
          }, 1500);
        });
      });
    }

    renderRetryMerge();
  }

  // --- Demo 4: Upload History & Custom Aliases ---
  const historyAliasesStage = document.getElementById('demo-historyaliases-stage');
  if (historyAliasesStage) {
    let uploadHistory = [
      {
        id: 1, customerName: 'Ravi Kumar', timestamp: Date.now() - 86400000, uploaded: 8, skipped: 2, failed: 1,
        logText: 'Application: HR26X1234\nCustomer: Ravi Kumar\nStatus: Completed\nUploaded: 8\nSkipped: 2\nFailed: 1'
      },
      {
        id: 2, customerName: 'Priya Singh', timestamp: Date.now() - 172800000, uploaded: 12, skipped: 0, failed: 0,
        logText: 'Application: DL04Y5678\nCustomer: Priya Singh\nStatus: Completed\nUploaded: 12\nSkipped: 0\nFailed: 0'
      },
      {
        id: 3, customerName: 'Amit Patel', timestamp: Date.now() - 259200000, uploaded: 6, skipped: 4, failed: 2,
        logText: 'Application: MH12Z9012\nCustomer: Amit Patel\nStatus: Partial\nUploaded: 6\nSkipped: 4\nFailed: 2'
      },
      {
        id: 4, customerName: 'Neha Sharma', timestamp: Date.now() - 345600000, uploaded: 10, skipped: 2, failed: 0,
        logText: 'Application: KA03A3456\nCustomer: Neha Sharma\nStatus: Completed\nUploaded: 10\nSkipped: 2\nFailed: 0'
      },
      {
        id: 5, customerName: 'Vikram Singh', timestamp: Date.now() - 432000000, uploaded: 9, skipped: 1, failed: 2,
        logText: 'Application: UP16B7890\nCustomer: Vikram Singh\nStatus: Partial\nUploaded: 9\nSkipped: 1\nFailed: 2'
      },
    ];

    let customAliases = {
      'mycompany-invoice': 'Dealers Invoice',
      'client-aadhaar': 'Address Proof',
      'office-insurance': 'Certificate of Insurance',
    };

    const categoryOptions = [
      'Address Proof', 'Certificate of Insurance submitted at the time of first registration',
      'Dealers Invoice', 'Form 20 If Finance Form 20 Two copies with Financier Seal and Signature',
      'FORM 20 Print From VAHAN4 With Signature By Vehicle Purchaser And Chassis Print',
      'Form 22 (Road Worthiness Certificate)', 'Form 21 (Sale Certificate)',
      'Owners Signature', 'Owners Photo', 'Owners Photo with Vehicle', 'PAN Card', 'Photo of chassis'
    ];

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c]));
    }

    function formatDate(ts) {
      return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    function renderHistoryAliases() {
      historyAliasesStage.innerHTML = `
        <div class="demo-history-aliases-container">
          <section class="demo-history-section">
            <h4 style="margin:0 0 12px;font-size:13px;font-weight:700;color:var(--gold);">Upload History (Last 5 of 50)</h4>
            <div class="demo-history-list" id="history-list">
              ${uploadHistory.map(h => `
                <div class="demo-history-item" data-id="${h.id}" tabindex="0" role="button" aria-label="Click to copy log for ${escapeHtml(h.customerName)}">
                  <div class="demo-history-item-header">
                    <span class="demo-history-customer">${escapeHtml(h.customerName)}</span>
                    <span class="demo-history-date">${formatDate(h.timestamp)}</span>
                  </div>
                  <div class="demo-history-stats">
                    <span class="uploaded">✓ ${h.uploaded} uploaded</span>
                    <span class="skipped">⊘ ${h.skipped} skipped</span>
                    <span class="failed">✗ ${h.failed} failed</span>
                  </div>
                  <div class="demo-history-log">${escapeHtml(h.logText)}</div>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="demo-aliases-section">
            <h4 style="margin:0 0 12px;font-size:13px;font-weight:700;color:var(--gold);">Custom Filename Aliases</h4>
            <p style="margin:0 0 12px;font-size:11px;color:var(--muted);">Add keyword → category mappings. Never overrides built-in aliases.</p>

            <form class="demo-aliases-form" id="alias-form">
              <div class="form-row">
                <input type="text" id="alias-keyword" placeholder="Keyword (e.g., mydoc, invoice2)" aria-label="Custom alias keyword" required pattern="[a-z0-9_\-\\s]+" maxlength="50">
                <select id="alias-category" aria-label="VAHAN category" required>
                  <option value="">-- Select VAHAN category --</option>
                  ${categoryOptions.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                </select>
                <button type="submit" class="add-btn primary" disabled>Add</button>
              </div>
              <p id="alias-error" style="margin:8px 0 0;font-size:10px;color:#ff7777;height:14px;"></p>
            </form>

            <div class="demo-aliases-list" id="aliases-list">
              ${Object.entries(customAliases).map(([kw, cat]) => `
                <div class="demo-alias-item" data-keyword="${escapeHtml(kw)}">
                  <div>
                    <span class="alias-keyword"><code>${escapeHtml(kw)}</code></span>
                    <span class="alias-category">→ ${escapeHtml(cat)}</span>
                  </div>
                  <button class="demo-alias-delete" aria-label="Delete alias ${escapeHtml(kw)}">×</button>
                </div>
              `).join('') || '<p style="padding:12px;font-size:11px;color:var(--muted);text-align:center;">No custom aliases yet.</p>'}
            </div>
          </section>
        </div>
      `;

      // Attach handlers
      const form = historyAliasesStage.querySelector('#alias-form');
      const keywordInput = historyAliasesStage.querySelector('#alias-keyword');
      const categorySelect = historyAliasesStage.querySelector('#alias-category');
      const addBtn = historyAliasesStage.querySelector('.add-btn');
      const errorEl = historyAliasesStage.querySelector('#alias-error');
      const list = historyAliasesStage.querySelector('#aliases-list');

      function validateForm() {
        const kw = keywordInput.value.trim().toLowerCase();
        const cat = categorySelect.value;
        const valid = kw.length > 0 && cat && /^[a-z0-9_\-\s]+$/i.test(kw);
        addBtn.disabled = !valid;
        if (!valid && kw) {
          errorEl.textContent = 'Keyword must be alphanumeric with spaces, hyphens, or underscores only.';
        } else {
          errorEl.textContent = '';
        }
      }

      keywordInput.addEventListener('input', validateForm);
      categorySelect.addEventListener('change', validateForm);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (addBtn.disabled) return;
        const kw = keywordInput.value.trim().toLowerCase();
        const cat = categorySelect.value;
        customAliases[kw] = cat;
        keywordInput.value = '';
        categorySelect.value = '';
        addBtn.disabled = true;
        renderHistoryAliases();
      });

      list.querySelectorAll('.demo-alias-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const kw = btn.closest('.demo-alias-item').dataset.keyword;
          delete customAliases[kw];
          renderHistoryAliases();
        });
      });

      // History item click to copy
      historyAliasesStage.querySelectorAll('.demo-history-item').forEach(item => {
        item.addEventListener('click', async () => {
          const id = Number(item.dataset.id);
          const session = uploadHistory.find(s => s.id === id);
          if (!session) return;
          try {
            await navigator.clipboard.writeText(session.logText);
            // Visual feedback
            const oldText = item.innerHTML;
            item.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gold);">Log copied to clipboard!</div>';
            setTimeout(() => { item.innerHTML = oldText; renderHistoryAliases(); }, 1500);
          } catch {
            alert('Could not copy to clipboard. Try again.');
          }
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });
    }

    renderHistoryAliases();
  }

  // --- Demo 5: Advanced Tools ---
  const advancedToolsStage = document.getElementById('demo-advancedtools-stage');
  if (advancedToolsStage) {
    let bulkRenameFiles = [
      { orig: 'Aadhaar.pdf', slot: 'Address Proof', categorySlug: 'address-proof' },
      { orig: 'insurance.pdf', slot: 'Insurance', categorySlug: 'insurance' },
      { orig: 'INVOICE.pdf', slot: 'Dealer Invoice', categorySlug: 'dealer-invoice' },
      { orig: 'FORM20.pdf', slot: 'Form 20 (Finance)', categorySlug: 'form20' },
      { orig: 'CHASSIS.jpg', slot: 'Chassis Photo', categorySlug: 'chassis-photo' },
    ];
    let customerSlug = 'ravi-kumar';
    let completionSoundEnabled = true;

    function slugify(text) {
      return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c]));
    }

    function suggestedName(slot) {
      return `${customerSlug}_${slugify(slot)}.pdf`;
    }

    function renderAdvancedTools() {
      advancedToolsStage.innerHTML = `
        <div class="demo-advanced-tools-container">
          <!-- Bulk Rename -->
          <article class="demo-tool-card">
            <header class="demo-tool-header">
              <span class="demo-tool-icon">✎</span>
              <span class="demo-tool-title">Bulk Rename Assistant</span>
            </header>
            <div class="demo-tool-body">
              <div class="demo-bulk-rename-row header">
                <span>Original Name</span>
                <span>Suggested Name</span>
                <span class="category">Category</span>
                <span></span>
              </div>
              ${bulkRenameFiles.map((f, i) => `
                <div class="demo-bulk-rename-row">
                  <span class="orig">${escapeHtml(f.orig)}</span>
                  <span class="new">${escapeHtml(suggestedName(f.slot))}</span>
                  <span class="category">${escapeHtml(f.slot)}</span>
                  <input type="checkbox" checked data-index="${i}" style="accent-color:var(--gold);">
                </div>
              `).join('')}
              <p style="margin-top:12px;font-size:10px;color:var(--muted);">Click Apply Renames to update both original and prepared file objects.</p>
            </div>
          </article>

          <!-- Checklist Generator -->
          <article class="demo-tool-card">
            <header class="demo-tool-header">
              <span class="demo-tool-icon">☑</span>
              <span class="demo-tool-title">Printable Checklist</span>
            </header>
            <div class="demo-tool-body">
              <table class="demo-checklist-table">
                <thead>
                  <tr><th>#</th><th>Document Category</th><th>Subcategory</th><th>Filename Suggestion</th><th class="status">✓</th></tr>
                </thead>
                <tbody>
                  <tr class="addr-proof"><td>1</td><td>Address Proof</td><td>Aadhaar Card</td><td><code class="hint">${escapeHtml(suggestedName('Aadhaar Card'))}</code></td><td class="status">✓</td></tr>
                  <tr class="addr-proof"><td>2</td><td>Address Proof</td><td>Bank Passbook</td><td><code class="hint">${escapeHtml(suggestedName('Bank Passbook'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>3</td><td>Address Proof</td><td>Electricity Bill</td><td><code class="hint">${escapeHtml(suggestedName('Electricity Bill'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>4</td><td>Address Proof</td><td>Gas Bill</td><td><code class="hint">${escapeHtml(suggestedName('Gas Bill'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>5</td><td>Address Proof</td><td>Water Bill (Delhi Jal Board)</td><td><code class="hint">${escapeHtml(suggestedName('Water Bill (Delhi Jal Board)'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>6</td><td>Address Proof</td><td>Passport</td><td><code class="hint">${escapeHtml(suggestedName('Passport'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>7</td><td>Address Proof</td><td>Voter ID</td><td><code class="hint">${escapeHtml(suggestedName('Voter ID'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>8</td><td>Address Proof</td><td>Ration Card</td><td><code class="hint">${escapeHtml(suggestedName('Ration Card'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>9</td><td>Address Proof</td><td>Telephone Bill</td><td><code class="hint">${escapeHtml(suggestedName('Telephone Bill'))}</code></td><td class="status"></td></tr>
                  <tr class="addr-proof"><td>10</td><td>Address Proof</td><td>GST Certificate</td><td><code class="hint">${escapeHtml(suggestedName('GST Certificate'))}</code></td><td class="status"></td></tr>
                  <tr><td>11</td><td>Certificate of Insurance</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Certificate of Insurance'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>12</td><td>Dealer Invoice</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Dealer Invoice'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>13</td><td>Form 20 (Finance)</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Form 20 (Finance)'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>14</td><td>Form 20 (Signed + Chassis)</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Form 20 (Signed + Chassis)'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>15</td><td>Form 22</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Form 22'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>16</td><td>Form 21</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Form 21'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>17</td><td>Owner Signature</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Owner Signature'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>18</td><td>Owner Photo</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Owner Photo'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>19</td><td>Owner + Vehicle Photo</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Owner + Vehicle Photo'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>20</td><td>PAN Card</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('PAN Card'))}</code></td><td class="status">✓</td></tr>
                  <tr><td>21</td><td>Chassis Photo</td><td>—</td><td><code class="hint">${escapeHtml(suggestedName('Chassis Photo'))}</code></td><td class="status">✓</td></tr>
                </tbody>
              </table>
              <p style="margin-top:12px;font-size:10px;color:var(--muted);">Legend: ✓ = matched file. Yellow rows = Address Proof subcategories. Opens in 800×600 printable window.</p>
            </div>
          </article>

          <!-- Keyboard Shortcuts -->
          <article class="demo-tool-card">
            <header class="demo-tool-header">
              <span class="demo-tool-icon">⌨</span>
              <span class="demo-tool-title">Global Keyboard Shortcuts</span>
            </header>
            <div class="demo-tool-body">
              <div class="demo-shortcuts-grid">
                <div class="demo-shortcut-key"><span class="keys"><kbd>Ctrl</kbd><kbd>+</kbd><kbd>O</kbd></span><span class="desc">Open file picker</span></div>
                <div class="demo-shortcut-key"><span class="keys"><kbd>Ctrl</kbd><kbd>+</kbd><kbd>Enter</kbd></span><span class="desc">Start upload</span></div>
                <div class="demo-shortcut-key"><span class="keys"><kbd>Ctrl</kbd><kbd>+</kbd><kbd>S</kbd></span><span class="desc">Download ZIP</span></div>
                <div class="demo-shortcut-key"><span class="keys"><kbd>Esc</kbd></span><span class="desc">Cancel / Close</span></div>
                <div class="demo-shortcut-key"><span class="keys"><kbd>←</kbd></span><span class="desc">Prev settings tab</span></div>
                <div class="demo-shortcut-key"><span class="keys"><kbd>→</kbd></span><span class="desc">Next settings tab</span></div>
              </div>
              <p style="margin-top:12px;font-size:10px;color:var(--muted);">Works via Chrome Commands API — even when popup is closed.</p>
            </div>
          </article>

          <!-- Completion Sound -->
          <article class="demo-tool-card">
            <header class="demo-tool-header">
              <span class="demo-tool-icon">🔊</span>
              <span class="demo-tool-title">Completion Sound</span>
            </header>
            <div class="demo-sound-card">
              <div class="demo-sound-info">
                <h4>Preview the chime</h4>
                <p>880 Hz sine wave, 0.5 s exponential decay via Web Audio API. Toggle in Settings → Preferences.</p>
              </div>
              <button class="btn demo-sound-btn" id="play-sound-btn">▶ Play Preview</button>
            </div>
          </article>

          <!-- Advanced Settings -->
          <article class="demo-tool-card">
            <header class="demo-tool-header">
              <span class="demo-tool-icon">🔧</span>
              <span class="demo-tool-title">Advanced Settings</span>
            </header>
            <div class="demo-tool-body">
              <div class="demo-advanced-toggle">
                <label>
                  <input type="checkbox" id="exp-features">
                  <span class="toggle-name">Enable Experimental Features</span>
                  <span class="toggle-desc">Bulk rename assistant, offline preparation queue (beta)</span>
                </label>
              </div>
              <div class="demo-advanced-toggle">
                <label>
                  <input type="checkbox" id="debug-mode">
                  <span class="toggle-name">Debug Mode</span>
                  <span class="toggle-desc">Verbose console logging + internal states for troubleshooting</span>
                </label>
              </div>
              <div class="demo-advanced-toggle">
                <label>
                  <span class="toggle-name">Custom User-Agent</span>
                  <span class="toggle-desc">Override User-Agent for VAHAN requests</span>
                  <input type="text" id="custom-ua" placeholder="Mozilla/5.0 (custom)..." style="margin-left:auto;min-width:200px;">
                </label>
              </div>
            </div>
          </article>

          <!-- Granular Log Controls -->
          <article class="demo-tool-card">
            <header class="demo-tool-header">
              <span class="demo-tool-icon">📋</span>
              <span class="demo-tool-title">Granular Log Controls</span>
            </header>
            <div class="demo-tool-body">
              <div class="demo-log-controls-grid">
                <div class="demo-log-toggle">
                  <label>
                    <input type="checkbox" checked>
                    <span class="toggle-name">Include filenames</span>
                    <span class="toggle-desc">Original filenames in summary</span>
                  </label>
                </div>
                <div class="demo-log-toggle">
                  <label>
                    <input type="checkbox" checked>
                    <span class="toggle-name">Include file sizes</span>
                    <span class="toggle-desc">Prepared file sizes</span>
                  </label>
                </div>
                <div class="demo-log-toggle">
                  <label>
                    <input type="checkbox" checked>
                    <span class="toggle-name">Include timestamps</span>
                    <span class="toggle-desc">Upload timestamps</span>
                  </label>
                </div>
                <div class="demo-log-toggle">
                  <label>
                    <input type="checkbox" checked>
                    <span class="toggle-name">Address Proof subcategories</span>
                    <span class="toggle-desc">Subcategory names in log</span>
                  </label>
                </div>
              </div>
              <p style="margin-top:12px;font-size:10px;color:var(--muted);">Each defaults ON. Fine-tune what appears in on-page summary and clipboard copy.</p>
            </div>
          </article>

          <!-- DMS Retry & Timeout Controls -->
          <article class="demo-tool-card">
            <header class="demo-tool-header">
              <span class="demo-tool-icon">⚙</span>
              <span class="demo-tool-title">DMS Retry & Timeout Controls</span>
            </header>
            <div class="demo-tool-body">
              <div class="demo-dms-controls">
                <div class="demo-dms-control">
                  <label>DMS Max Retries (1–10)</label>
                  <input type="number" id="dms-retries" min="1" max="10" value="4" style="width:80px;">
                </div>
                <div class="demo-dms-control">
                  <label>Step Timeout (ms, 5000–120000)</label>
                  <input type="number" id="step-timeout" min="5000" max="120000" step="1000" value="20000" style="width:100px;">
                </div>
              </div>
              <div class="demo-dms-controls" style="margin-top:8px;">
                <div class="demo-dms-control">
                  <div class="control-row">
                    <input type="checkbox" id="auto-retry-failed">
                    <span>Auto Retry Failed Uploads once</span>
                  </div>
                </div>
                <div class="demo-dms-control">
                  <div class="control-row">
                    <input type="checkbox" id="confirm-submit">
                    <span>Confirm Before File Movement</span>
                  </div>
                </div>
              </div>
              <p style="margin-top:12px;font-size:10px;color:var(--muted);">Stored separately in chrome.storage.local. Changes apply to next upload.</p>
            </div>
          </article>
        </div>
      `;

      // Play completion sound
      const playBtn = advancedToolsStage.querySelector('#play-sound-btn');
      playBtn?.addEventListener('click', () => {
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
          playBtn.textContent = "✓ Played!"
          setTimeout(() => playBtn.textContent = '▶ Play Preview', 1000);
        } catch (e) {
          playBtn.textContent = "Unsupported";
          setTimeout(() => playBtn.textContent = '▶ Play Preview', 1500);
        }
      });
    }

    renderAdvancedTools();
  }
})();