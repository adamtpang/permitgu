// Guide pages: one idea per screen. Each step opens on a tap, long notes fold to two
// lines, and a short row of counts sits under the headline. Without JavaScript every
// step and note stays open, so nothing is hidden from a reader or a search engine.
(function () {
  var list = document.querySelector('ol.steps');
  if (!list) return;
  var root = document.documentElement;
  root.classList.add('js-guide');
  var items = Array.prototype.slice.call(list.children).filter(function (li) { return li.querySelector('h2'); });

  items.forEach(function (li, index) {
    var heading = li.querySelector('h2');
    var body = document.createElement('div');
    body.className = 'step-body';
    body.id = 'step-body-' + (index + 1);
    // Everything after the heading, in order: who to see, what to do, links, notes.
    while (heading.nextSibling) body.appendChild(heading.nextSibling);
    li.appendChild(body);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'step-toggle';
    button.setAttribute('aria-controls', body.id);
    while (heading.firstChild) button.appendChild(heading.firstChild);
    heading.appendChild(button);
    if (!li.id) li.id = 'step-' + (index + 1);
    li.setOpen = function (open) {
      li.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', function () {
      li.setOpen(!li.classList.contains('is-open'));
      syncAll();
    });
    // A page that starts with a set of choices keeps every step closed until one is picked.
    li.setOpen(index === 0 && list.getAttribute('data-start') !== 'closed');
  });

  // One control to open or close every step.
  var all = document.createElement('button');
  all.type = 'button';
  all.className = 'steps-all';
  function syncAll() {
    var open = items.every(function (li) { return li.classList.contains('is-open'); });
    all.textContent = open ? 'Close all steps' : 'Open all steps';
    all.setAttribute('aria-expanded', String(open));
  }
  all.addEventListener('click', function () {
    var open = items.every(function (li) { return li.classList.contains('is-open'); });
    items.forEach(function (li) { li.setOpen(!open); });
    syncAll();
  });
  list.parentNode.insertBefore(all, list);
  syncAll();

  // The counts under the headline, taken from the page itself.
  var hero = document.querySelector('.route-hero');
  if (hero) {
    var sources = {};
    Array.prototype.forEach.call(list.querySelectorAll('a[href^="http"]'), function (a) { sources[a.href] = 1; });
    var gaps = document.querySelectorAll('.check').length;
    // Numbered steps are the route. A step marked "+" only applies to some people.
    var numbered = items.filter(function (li) { return /^\d+$/.test((li.querySelector('.num') || {}).textContent || ''); }).length || items.length;
    var facts = [
      [numbered, numbered === 1 ? 'step' : 'steps'],
      [Object.keys(sources).length, 'official sources'],
      [gaps, gaps === 1 ? 'point not yet confirmed' : 'points not yet confirmed'],
    ];
    var glance = document.createElement('dl');
    glance.className = 'glance';
    facts.forEach(function (fact) {
      var cell = document.createElement('div');
      var number = document.createElement('dt');
      number.textContent = String(fact[0]);
      var label = document.createElement('dd');
      label.textContent = fact[1];
      cell.appendChild(number);
      cell.appendChild(label);
      glance.appendChild(cell);
    });
    hero.appendChild(glance);
  }

  // Long notes fold to two lines with a control to read the rest.
  Array.prototype.forEach.call(document.querySelectorAll('.check, .open'), function (note, index) {
    if ((note.textContent || '').length < 170) return;
    var inner = document.createElement('div');
    inner.className = 'note-text';
    inner.id = 'note-' + (index + 1);
    while (note.firstChild) inner.appendChild(note.firstChild);
    note.appendChild(inner);
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'note-more';
    more.setAttribute('aria-controls', inner.id);
    function set(open) {
      note.classList.toggle('is-folded', !open);
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show less' : 'Read the full note';
    }
    more.addEventListener('click', function () { set(note.classList.contains('is-folded')); });
    note.appendChild(more);
    set(false);
  });

  // A link to a step, or to anything inside one, opens that step.
  function openFromHash() {
    if (!location.hash) return;
    var target;
    try { target = document.querySelector(location.hash); } catch (error) { return; }
    var step = target && target.closest ? target.closest('ol.steps > li') : null;
    if (step && step.setOpen) {
      step.setOpen(true);
      syncAll();
      step.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  // Print and in-page search show everything.
  window.addEventListener('beforeprint', function () {
    items.forEach(function (li) { li.setOpen(true); });
    Array.prototype.forEach.call(document.querySelectorAll('.is-folded'), function (note) { note.classList.remove('is-folded'); });
    syncAll();
  });
})();
