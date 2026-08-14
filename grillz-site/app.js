// MENES — Site interactions

(function () {
  'use strict';

  // Nav scroll effect
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });

  // Mobile menu
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => navLinks.classList.remove('open'));
  });

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach((el) => observer.observe(el));

  // Karat tab filtering (mobile highlight)
  document.querySelectorAll('.karat-tabs').forEach((tabGroup) => {
    const targetId = tabGroup.dataset.target;
    const table = document.getElementById(targetId);
    if (!table) return;

    tabGroup.querySelectorAll('.karat-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        tabGroup.querySelectorAll('.karat-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const karat = tab.dataset.karat;
        table.querySelectorAll('[data-karat]').forEach((cell) => {
          const isMatch = cell.dataset.karat === karat;
          cell.style.opacity = isMatch ? '1' : '0.35';
          cell.style.fontWeight = isMatch ? '700' : '400';
        });
      });
    });
  });

  // Order form — POST /api/lead (Resend)
  const form = document.getElementById('orderForm');
  const formNote = document.getElementById('formNote');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = new FormData(form);
    const name = data.get('name');
    const phone = data.get('phone');
    const email = data.get('email');
    const collection = data.get('collection');
    const karat = data.get('karat');
    const config = data.get('config') || 'Non spécifié';
    const message = data.get('message') || '—';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours...';
    formNote.textContent = '';
    formNote.className = 'form-note';

    try {
      const response = await fetch((window.MENES_CONFIG?.API_BASE || 'https://boutiquemenes.netlify.app') + '/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name,
          phone,
          email,
          collection,
          karat,
          config,
          message,
          source: 'grillz-site',
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Erreur réseau');

      form.reset();
      formNote.textContent = 'Demande envoyée. Nous vous répondons sous 24 h.';
      formNote.className = 'form-note success';
    } catch {
      formNote.textContent = 'Envoi impossible. Écrivez-nous sur Instagram @menes_jewelry.';
      formNote.className = 'form-note error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Envoyer la demande';
    }
  });

  // Smooth anchor offset for fixed nav
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const offset = 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();
