// Avenit analytics — first-party, cookieless. Bez cookies, bez localStorage,
// bez zewnętrznych skryptów. Wysyła zdarzenia na własny /api/track (sendBeacon).
(function () {
  'use strict';
  if (navigator.doNotTrack === '1') return;

  var q = [];
  var visibleMs = 0;
  var visStart = document.visibilityState === 'visible' ? Date.now() : null;

  function utm() {
    try {
      var p = new URLSearchParams(location.search);
      var keys = ['source', 'medium', 'campaign', 'term', 'content'];
      var o = {}, any = false;
      for (var i = 0; i < keys.length; i++) {
        var v = p.get('utm_' + keys[i]);
        if (v) { o[keys[i]] = v.slice(0, 100); any = true; }
      }
      return any ? o : undefined;
    } catch (e) { return undefined; }
  }
  var UTM = utm();

  function flush() {
    if (!q.length) return;
    var payload = JSON.stringify({
      v: 1,
      site: 'landing',
      scr: screen.width + 'x' + screen.height,
      lang: (navigator.language || '').slice(0, 16),
      utm: UTM,
      events: q.splice(0, 20)
    });
    try {
      var ok = navigator.sendBeacon &&
        navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
      if (!ok) {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) { /* analityka nigdy nie psuje strony */ }
  }

  // Odsłona — od razu przy załadowaniu.
  q.push({
    n: 'pageview',
    path: location.pathname,
    title: (document.title || '').slice(0, 256),
    ref: document.referrer ? document.referrer.slice(0, 1024) : undefined
  });
  flush();

  // Głębokość scrolla: maksymalny osiągnięty % strony (wysyłany z 'leave').
  var maxScroll = 0;
  window.addEventListener('scroll', function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0) {
      var pct = Math.round((window.scrollY / max) * 100);
      if (pct > maxScroll) maxScroll = Math.min(100, pct);
    }
  }, { passive: true });

  // Czas widoczności strony: sumowany między visible/hidden, wysyłany jako 'leave'.
  function sendLeave() {
    if (visStart) { visibleMs += Date.now() - visStart; visStart = null; }
    if (visibleMs <= 0) return;
    q.push({
      n: 'leave',
      path: location.pathname,
      dur: visibleMs,
      props: maxScroll > 0 ? { scroll: maxScroll } : undefined
    });
    visibleMs = 0;
    flush();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendLeave();
    else if (!visStart) visStart = Date.now();
  });
  window.addEventListener('pagehide', sendLeave);

  // Kliknięcia: elementy z data-track (CTA) + linki wychodzące.
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('a[href], [data-track]') : null;
    if (!el) return;
    var name = el.getAttribute('data-track');
    if (name) {
      q.push({ n: 'click', path: location.pathname, props: { t: name.slice(0, 100) } });
      flush();
      return;
    }
    if (el.hostname && el.hostname !== location.hostname && /^https?:$/.test(el.protocol)) {
      q.push({ n: 'click', path: location.pathname, props: { href: (el.href || '').slice(0, 300) } });
      flush();
    }
  }, true);
})();
