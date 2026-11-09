// Shared header Menu (america.gov parity): a pill button that opens a panel of every route and page.
(function () {
  var bar = document.querySelector('.nav');
  if (!bar) return;
  var nav = bar.querySelector('.navlinks');
  if (!nav) {
    var old = bar.querySelector(':scope > a.pill');
    if (old) old.remove();
    nav = document.createElement('span');
    nav.className = 'navlinks';
    bar.appendChild(nav);
  }
  var LINKS = [
    ['Ask PermitGU', '/ask', 'Get an answer from official sources'],
    ['Start a food truck', '/food-truck', 'Full route'],
    ['Repair typhoon damage', '/typhoon-repair', 'Full route'],
    ['Build a house, addition, or fence', '/build', 'Full route'],
    ['Clear, grade, or install septic', '/clear-grade', 'Full route'],
    ['Hold an event or fiesta booth', '/events', 'Full route'],
    ['Check zoning or change land use', '/zoning', 'Full route'],
    ['Work on a road or driveway, hook up utilities', '/public-spaces', 'Full route'],
    ['Get help, check a permit, or appeal', '/help', 'Permit center, status, appeals, agencies'],
    ['Other government services', '/#all', 'Licenses, IDs, bills, and more'],
  ];
  var MORE = [['How it works', '/how-it-works'], ['Roadmap', '/roadmap'], ['Suggest a correction', '/corrections'], ['Privacy', '/privacy'], ['About', '/about']];
  document.querySelectorAll('.check,.open').forEach(function (gap) {
    var link = document.createElement('a');
    link.href = '/corrections?topic=' + encodeURIComponent(document.title.split('|')[0].trim());
    link.textContent = 'Prepare a correction';
    var paragraph = document.createElement('p');
    paragraph.appendChild(link);
    gap.appendChild(paragraph);
  });
  nav.innerHTML = '<a class="hide-sm" href="/how-it-works">How it works</a>' +
    '<button type="button" class="pill menu" id="menuBtn" aria-expanded="false" aria-controls="menuPanel">Menu</button>';
  var panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.id = 'menuPanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Menu');
  panel.innerHTML = '<div class="menu-sheet"><div class="menu-top"><span class="wm">Permit<b>GU</b></span>' +
    '<button type="button" class="menu-close" aria-label="Close menu">&times;</button></div><nav class="menu-links">' +
    LINKS.map(function (l) { return '<a href="' + l[1] + '"><b>' + l[0] + '</b><small>' + l[2] + '</small></a>'; }).join('') +
    '</nav><div class="menu-more">' + MORE.map(function (l) { return '<a href="' + l[1] + '">' + l[0] + '</a>'; }).join('') +
    '</div><p class="menu-note">Unofficial demo. Not affiliated with the Government of Guam.</p></div>';
  document.body.appendChild(panel);
  var btn = document.getElementById('menuBtn');
  var background = [];
  var previousOverflow = '';
  function set(open) {
    if (open === !panel.hidden) return;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      previousOverflow = document.documentElement.style.overflow;
      background = Array.from(document.body.children).filter(function (element) { return element !== panel; }).map(function (element) {
        var state = { element: element, inert: element.inert };
        element.inert = true;
        return state;
      });
    } else {
      background.forEach(function (state) { state.element.inert = state.inert; });
      background = [];
    }
    document.documentElement.style.overflow = open ? 'hidden' : previousOverflow;
    if (open) panel.querySelector('.menu-close').focus(); else btn.focus();
  }
  btn.onclick = function () { set(true); };
  panel.querySelector('.menu-close').onclick = function () { set(false); };
  panel.addEventListener('click', function (e) { if (e.target === panel || e.target.closest('.menu-links a,.menu-more a')) set(false); });
  document.addEventListener('keydown', function (event) {
    if (panel.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); set(false); }
    if (event.key !== 'Tab') return;
    var controls = Array.from(panel.querySelectorAll('button, a[href]'));
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();
