// BudappsAI — comportements communs à toutes les pages. Rien n'est envoyé nulle part.
(() => {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tactile = matchMedia('(hover: none)').matches;

  // Menu mobile
  const burger = document.querySelector('.burger');
  if (burger) {
    burger.addEventListener('click', () => {
      const ouvert = document.body.classList.toggle('menu-ouvert');
      burger.setAttribute('aria-expanded', ouvert);
    });
    document.querySelectorAll('.menu-mobile a').forEach(a => a.addEventListener('click', () => {
      document.body.classList.remove('menu-ouvert'); burger.setAttribute('aria-expanded', false);
    }));
  }

  // Titres découpés en mots qui arrivent un par un
  document.querySelectorAll('[data-mots]').forEach(el => {
    let i = 0;
    const couper = n => {
      if (n.nodeType === 3) {
        const f = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(bout => {
          if (!bout) return;
          if (/^\s+$/.test(bout)) { f.append(bout); return; }
          const s = document.createElement('span'); s.className = 'm'; s.style.setProperty('--i', i++); s.textContent = bout; f.append(s);
        });
        n.replaceWith(f);
      } else if (n.nodeType === 1 && n.classList.contains('degrade')) {
        // Un dégradé découpé ne s'afficherait plus : il arrive d'un bloc.
        n.classList.add('m'); n.style.setProperty('--i', i++);
      } else if (n.nodeType === 1) [...n.childNodes].forEach(couper);
    };
    [...el.childNodes].forEach(couper);
    el.classList.add('mots');
  });

  // Apparition au défilement
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('vue'); io.unobserve(e.target); }
  }), { threshold: .14, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.revele,.mots').forEach(el => io.observe(el));

  // Projecteur des cartes (et légère inclinaison)
  document.querySelectorAll('.carte').forEach(c => {
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      c.style.setProperty('--mx', x + 'px'); c.style.setProperty('--my', y + 'px');
      if (!calme && !tactile && c.dataset.incline !== undefined)
        c.style.transform = `perspective(900px) rotateX(${(.5 - y / r.height) * 6}deg) rotateY(${(x / r.width - .5) * 6}deg) translateY(-4px)`;
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });

  // Boutons aimantés
  if (!calme && !tactile) document.querySelectorAll('.aimant').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px,${(e.clientY - r.top - r.height / 2) * .28}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });

  // L'année du pied de page
  document.querySelectorAll('[data-annee]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();

// Les sections animées au défilement. Chaque page n'a que certaines d'entre
// elles : tout est gardé par l'existence de l'élément.
(() => {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tactile = matchMedia('(hover: none)').matches;
  const $ = s => document.querySelector(s);
  const borne = v => Math.min(1, Math.max(0, v));

  // Les écrans de l'accueil s'inclinent avec la souris
  const plateau = $('#plateau');
  if (!calme && !tactile && plateau) addEventListener('pointermove', e => {
    const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
    plateau.style.transform = `rotateX(${18 - y * 6}deg) rotateY(${x * 8}deg)`;
  });

  // Le manifeste s'allume mot par mot
  const man = $('#manifeste'); let mots = [];
  if (man) {
    man.innerHTML = man.innerHTML.replace(/<em>(.*?)<\/em>|([^<\s]+)/g, (m, fort, mot) =>
      fort ? fort.split(/\s+/).filter(Boolean).map(w => `<span class="w fort">${w}</span>`).join(' ') : `<span class="w">${mot}</span>`);
    mots = [...man.querySelectorAll('.w')];
  }

  const zoom = $('#zoom'), cadre = $('#cadre');
  const phrases = zoom ? [...zoom.querySelectorAll('.phrases p')] : [], jauges = zoom ? [...zoom.querySelectorAll('.jauge b')] : [];
  const parcours = $('#parcours'), trait = $('#trait'), etapes = [...document.querySelectorAll('.etape')], barreBas = $('#barreBas');
  let prevu = false;
  const suivre = () => {
    prevu = false;
    if (!calme && zoom) {
      const r = zoom.getBoundingClientRect(), p = borne(-r.top / (r.height - innerHeight)), q = borne(p / .45);
      cadre.style.setProperty('--rx', (30 * (1 - q)) + 'deg'); cadre.style.setProperty('--s', (.68 + .3 * q).toFixed(3));
      cadre.style.setProperty('--sombre', (.66 * borne((p - .1) / .3)).toFixed(3));
      const k = p < .34 ? 0 : p < .67 ? 1 : 2;
      phrases.forEach((el, i) => el.classList.toggle('active', i === k && p > .02 && p < .99));
      jauges.forEach((b, i) => b.style.setProperty('--p', borne((p - i / 3) * 3)));
    }
    if (!calme && man) {
      const m = man.getBoundingClientRect(), f = borne((innerHeight * .85 - m.top) / (m.height + innerHeight * .35));
      mots.forEach((w, i) => w.classList.toggle('on', i < f * mots.length * 1.05));
    }
    if (parcours) {
      const rp = parcours.getBoundingClientRect();
      trait.style.height = (borne((innerHeight * .6 - rp.top) / rp.height) * (rp.height - 16)) + 'px';
      etapes.forEach(et => et.classList.toggle('vue', et.getBoundingClientRect().top < innerHeight * .6));
    }
    if (barreBas) barreBas.classList.toggle('montre', scrollY > innerHeight * .9 && innerHeight + scrollY < document.body.scrollHeight - 400);
  };
  if (zoom || man || parcours || barreBas) {
    addEventListener('scroll', () => { if (!prevu) { prevu = true; requestAnimationFrame(suivre); } }, { passive: true });
    addEventListener('resize', suivre); suivre();
  }

  // Les compteurs
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    const el = e.target, fin = +el.dataset.compte, suf = el.dataset.suffixe || '', t0 = performance.now(), duree = calme ? 0 : 1400;
    const pas = t => { const k = duree ? borne((t - t0) / duree) : 1, v = Math.round(fin * (1 - Math.pow(1 - k, 3)));
      el.textContent = v + suf; if (k < 1) requestAnimationFrame(pas); };
    requestAnimationFrame(pas);
  }), { threshold: .6 });
  document.querySelectorAll('[data-compte]').forEach(el => io.observe(el));
})();

// Un lien vers une section (« projetlia.html#international ») : le navigateur
// saute avant que la page ait pris sa hauteur (zoom collant, images), et la
// section n'est jamais atteinte. On y va une fois la page posee.
addEventListener('load', () => {
  const cible = location.hash && document.getElementById(location.hash.slice(1));
  if (cible) setTimeout(() => cible.scrollIntoView({ block: 'start' }), 120);
});
