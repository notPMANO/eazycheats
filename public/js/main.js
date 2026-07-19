// Footer year
var yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

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
