// Podręcznik avenit.pl: powiększanie zrzutów, zwinięta lista rozdziałów na telefonie.
(function () {
  'use strict';
  var box = document.getElementById('pd-lightbox');
  if (box && typeof box.showModal === 'function') {
    var img = box.querySelector('img');
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.pd-zoom');
      if (!btn) return;
      var src = btn.querySelector('img');
      img.src = src.currentSrc.replace('-1200.webp', '-2000.webp');
      img.alt = src.alt;
      box.showModal();
    });
    box.addEventListener('click', function () { box.close(); });
  }
  // Na wąskim ekranie lista rozdziałów startuje zwinięta.
  var ch = document.querySelector('.pd-chapters');
  if (ch && window.matchMedia('(max-width: 900px)').matches) ch.removeAttribute('open');
})();
