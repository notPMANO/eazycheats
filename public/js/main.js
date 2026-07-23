// Footer year
var yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Copy-to-clipboard buttons ([data-copy]). Bound here rather than inline so the
// Content-Security-Policy (script-src 'self') doesn't block it.
(function () {
  var buttons = document.querySelectorAll('.js-copy');
  if (!buttons.length) return;

  function flash(btn, msg) {
    var original = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(function () {
      btn.textContent = original;
      btn.disabled = false;
    }, 1200);
  }

  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy') || '';
      // navigator.clipboard needs a secure context; fall back for plain http.
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
          .then(function () { flash(btn, 'Copied!'); })
          .catch(function () { flash(btn, 'Failed'); });
        return;
      }
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      flash(btn, ok ? 'Copied!' : 'Failed');
    });
  });
})();

// Confirm-before-submit for destructive forms ([data-confirm] on .js-confirm).
// Same reason as above: inline onsubmit="" is blocked by the CSP.
(function () {
  var forms = document.querySelectorAll('.js-confirm');
  Array.prototype.forEach.call(forms, function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm') || 'Are you sure?')) {
        e.preventDefault();
      }
    });
  });
})();

// Image dropzone with drag/drop + preview
(function () {
  var dz = document.getElementById('dropzone');
  if (!dz) return;
  var input = document.getElementById('fileInput');
  var preview = document.getElementById('preview');
  var prompt = document.getElementById('dropPrompt');

  function showFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      preview.src = e.target.result;
      preview.style.display = '';
      if (prompt) prompt.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  dz.addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () { if (input.files[0]) showFile(input.files[0]); });

  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('dragover'); });
  });
  dz.addEventListener('drop', function (e) {
    var file = e.dataTransfer.files[0];
    if (file) {
      // Put the dropped file into the hidden input so it submits with the form.
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      showFile(file);
    }
  });
})();
