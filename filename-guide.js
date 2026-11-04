(() => {
  const guide = document.querySelector('.filename-guide');
  if (!guide) return;
  const status = document.getElementById('filename-copy-status');
  const fallback = document.getElementById('filename-copy-fallback');
  const systems = [...guide.querySelectorAll('.filename-table')].map(table =>
    [...table.querySelectorAll('tbody tr')].map(row => ({
      name: row.querySelector('code').textContent.trim(),
      category: row.cells[1].textContent.trim(),
    }))
  );
  function guideText(kind) {
    const sections = ['NDC VAHAN TOOL filename formats'];
    for (const [index, title] of ['Full filenames', 'Quick filenames'].entries()) {
      if (kind !== 'all' && kind !== (index ? 'quick' : 'full')) continue;
      sections.push(title + '\n' + systems[index].map(row => row.name + '\t' + row.category).join('\n'));
    }
    sections.push('Add .jpg, .png, .webp or .pdf to match your actual file format. Names are case-insensitive. Review assigned categories before uploading.');
    return sections.join('\n\n');
  }
  async function copy(text, message) {
    fallback.hidden = true;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = message;
    } catch {
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      status.textContent = 'Clipboard access is unavailable. The text below is selected; press Ctrl+C or use your device’s Copy action.';
    }
  }
  guide.querySelectorAll('[data-copy-filenames]').forEach(button => {
    button.addEventListener('click', () => copy(guideText(button.dataset.copyFilenames), 'Filename formats copied to clipboard.'));
  });
  guide.querySelectorAll('.filename-table code').forEach(code => {
    const name = code.textContent.trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filename-copy-one';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy filename ' + name);
    button.addEventListener('click', () => copy(name, name + ' copied to clipboard.'));
    code.after(button);
  });
})();
