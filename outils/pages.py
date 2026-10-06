#!/usr/bin/env python3
"""Pose le même en-tête et le même pied de page sur toutes les pages.

Chaque page contient deux repères :
    <!--TETE-->...<!--/TETE-->   et   <!--PIED-->...<!--/PIED-->
Le script remplace leur contenu. Toutes les pages, accueil compris.   python3 outils/pages.py
"""
import os, re

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = ('<span class="logo"><svg viewBox="170 170 684 684" fill="#fff" aria-hidden="true"><path d="M512 800V420" stroke="#fff" stroke-width="64" stroke-linecap="round"/><path d="M520 668C410 680 300 616 282 476C412 462 512 532 520 668Z"/><path d="M504 606C600 616 702 556 724 436C612 426 512 486 504 606Z"/><circle cx="512" cy="356" r="98"/></svg></span>')
FLECHE = '<svg class="fleche" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'
LIENS = [('projetlia.html', 'PROJETLIA', 'projetlia.html'), ('donnees.html', 'Vos données', 'donnees.html'),
         ('tarifs.html', 'Tarifs', 'tarifs.html'), ('demo.html', 'Démo', 'demo.html'), ('contact.html', 'Contact', 'contact.html')]


def tete(page):
    nav = ''.join(f'<a href="{h}"{" aria-current=page" if p == page else ""}>{t}</a>' for h, t, p in LIENS)
    return f'''<header class="tete">
  <div class="enveloppe barre">
    <a class="marque" href="./" aria-label="BudappsAI, accueil">{LOGO}<span class="nom">Budapps<span class="ai">AI</span></span></a>
    <nav class="liens" aria-label="Navigation principale">{nav}</nav>
    <div class="boutons-tete"><a class="btn demo" href="demo.html">Voir la démo</a><a class="btn btn-lumiere aimant" href="tarifs.html">Passer à l'abonnement {FLECHE}</a></div>
    <button class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
</header>
<div class="menu-mobile">{nav}<a class="btn btn-lumiere" href="tarifs.html">Passer à l'abonnement</a><a class="btn" href="demo.html">Voir la démo</a></div>'''


PIED = f'''<footer class="pied">
  <div class="enveloppe">
    <div class="colonnes">
      <div><a class="marque" href="./">{LOGO}<span class="nom">Budapps<span class="ai">AI</span></span></a>
        <p class="signature">Des applications pour décider rapidement. Conçues en Guyane.</p></div>
      <div><h4>Applications</h4><ul><li><a href="projetlia.html">PROJETLIA</a></li><li><a href="demo.html">Démo guidée</a></li><li><a href="tarifs.html">Tarifs</a></li><li><a href="telecharger.html">Télécharger</a></li></ul></div>
      <div><h4>BudappsAI</h4><ul><li><a href="donnees.html">Vos données</a></li><li><a href="contact.html">Contact</a></li><li><a href="mailto:contact@budappsai.com">Courriel</a></li></ul></div>
      <div><h4>Légal</h4><ul><li><a href="mentions-legales.html">Mentions légales</a></li><li><a href="cgv.html">Conditions générales</a></li><li><a href="confidentialite.html">Confidentialité</a></li><li><a href="droits-auteur.html">Droits d'auteur</a></li></ul></div>
    </div>
    <div class="geant" aria-hidden="true">budappsai</div>
    <div class="bas"><span>© <span data-annee>2026</span> BudappsAI. Tous droits réservés.</span><span>Aucun cookie, aucun traceur.</span></div>
  </div>
</footer>'''

for nom in sorted(os.listdir(ICI)):
    if not nom.endswith('.html'):
        continue
    chemin = os.path.join(ICI, nom)
    html = open(chemin, encoding='utf-8').read()
    html = re.sub(r'<!--TETE-->.*?<!--/TETE-->', lambda m: f'<!--TETE-->\n{tete(nom)}\n<!--/TETE-->', html, flags=re.S)
    html = re.sub(r'<!--PIED-->.*?<!--/PIED-->', lambda m: f'<!--PIED-->\n{PIED}\n<!--/PIED-->', html, flags=re.S)
    open(chemin, 'w', encoding='utf-8').write(html)
    print('ok', nom)
