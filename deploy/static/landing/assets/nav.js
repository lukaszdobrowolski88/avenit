// Wspólna nawigacja avenit.pl: rozwijane „Funkcje”, menu mobilne, cień po przewinięciu.
(function () {
  'use strict';
  var nav = document.getElementById('snav');
  if (!nav) return;
  var burger = nav.querySelector('.snav-burger');
  var menu = document.getElementById('snav-menu');
  var dds = nav.querySelectorAll('.snav-dd');
  var mobile = window.matchMedia('(max-width: 1099px)');

  function setDd(dd, open) {
    dd.classList.toggle('is-open', open);
    var b = dd.querySelector('.snav-dd-btn');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeAll(except) { dds.forEach(function (d) { if (d !== except) setDd(d, false); }); }
  function setMenu(open) {
    nav.classList.toggle('is-menu', open);
    document.documentElement.classList.toggle('snav-lock', open);
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) closeAll();
  }

  dds.forEach(function (dd) {
    var btn = dd.querySelector('.snav-dd-btn');
    var timer;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var open = !dd.classList.contains('is-open');
      closeAll(dd);
      setDd(dd, open);
    });
    // Na komputerze panel otwiera się też po najechaniu (z małym opóźnieniem przy wyjściu).
    dd.addEventListener('mouseenter', function () { if (mobile.matches) return; clearTimeout(timer); closeAll(dd); setDd(dd, true); });
    dd.addEventListener('mouseleave', function () { if (mobile.matches) return; timer = setTimeout(function () { setDd(dd, false); }, 180); });
  });

  if (burger) burger.addEventListener('click', function () { setMenu(!nav.classList.contains('is-menu')); });
  if (menu) menu.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (a) setMenu(false);
  });
  document.addEventListener('click', function (e) { if (!nav.contains(e.target)) closeAll(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openDd = nav.querySelector('.snav-dd.is-open .snav-dd-btn');
    closeAll();
    if (nav.classList.contains('is-menu')) { setMenu(false); if (burger) burger.focus(); } else if (openDd) openDd.focus();
  });
  mobile.addEventListener && mobile.addEventListener('change', function () { setMenu(false); });

  function onScroll() { nav.classList.toggle('is-scrolled', window.scrollY > 4); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
