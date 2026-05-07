/* ============================================
   St. Mark Legacy Food Pantry — Shared JS
   Navbar injection, mobile menu, footer
   ============================================ */

(function () {
  'use strict';

  // Determine active page from filename
  var path = window.location.pathname;
  var page = 'home';
  if (path.indexOf('volunteer') !== -1) page = 'volunteer';
  else if (path.indexOf('contact') !== -1) page = 'contact';

  // ---- Navbar ----
  var nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.innerHTML =
    '<div class="navbar-inner">' +
      '<a href="index.html" class="navbar-brand">St. Mark Food Pantry</a>' +
      '<button class="hamburger" aria-label="Menu">' +
        '<span></span><span></span><span></span>' +
      '</button>' +
      '<ul class="navbar-links">' +
        '<li><a href="index.html"' + (page === 'home' ? ' class="active"' : '') + '>Home</a></li>' +
        '<li><a href="volunteer.html"' + (page === 'volunteer' ? ' class="active"' : '') + '>Volunteer</a></li>' +
        '<li><a href="contact.html"' + (page === 'contact' ? ' class="active"' : '') + '>Contact</a></li>' +
        '<li><a href="https://pantry.stmarklegacy.org/" style="background:rgba(255,255,255,0.15);border-radius:6px;">Open Dashboard</a></li>' +
      '</ul>' +
    '</div>';

  document.body.insertBefore(nav, document.body.firstChild);

  // ---- Hamburger toggle ----
  var hamburger = nav.querySelector('.hamburger');
  var links = nav.querySelector('.navbar-links');

  hamburger.addEventListener('click', function () {
    hamburger.classList.toggle('open');
    links.classList.toggle('open');
  });

  // Close menu when a link is clicked (mobile)
  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      hamburger.classList.remove('open');
      links.classList.remove('open');
    }
  });

  // ---- Footer ----
  var footer = document.createElement('footer');
  footer.innerHTML =
    '<p>St. Mark Legacy Food Pantry &mdash; 601 Braker Lane, Austin, TX</p>';

  document.body.appendChild(footer);
})();
