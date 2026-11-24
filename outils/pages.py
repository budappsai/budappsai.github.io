#!/usr/bin/env python3
"""Pose le même en-tête et le même pied de page sur toutes les pages.

Chaque page contient deux repères :
    <!--TETE-->...<!--/TETE-->   et   <!--PIED-->...<!--/PIED-->
Le script remplace leur contenu. Toutes les pages, accueil compris.   python3 outils/pages.py
"""
import os, re

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = '<span class="logo logo-noeud"><img src="img/noeud-logo.webp" alt="" width="40" height="40"></span>'
FLECHE = '<svg class="fleche" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'
LIENS = [('./', 'Accueil', 'index.html', None), ('entreprise.html', "L'entreprise", 'entreprise.html', None), ('vision.html', 'Notre vision', 'vision.html', None),
         ('projetlia.html', 'Nos applications', 'projetlia.html', [
             ('projetlia.html', 'Projé9'),
             ('modele-etude-de-marche.html', 'Étude de marché'), ('modele-relation-clients.html', 'Relation clients'),
             ('modele-production.html', 'Production et coûts'), ('modele-stocks-achats.html', 'Achats et stocks'),
             ('modele-qualite.html', 'Qualité et conformité'), ('modele-secteur.html', 'Dossier pour un secteur')]),
         ('projetlia-avec-claude.html', 'Connecteurs IA', 'projetlia-avec-claude.html', [
             ('projetlia-avec-claude.html', "Vue d'ensemble"), ('projetlia-avec-claude.html#gratuit', 'Claude, gratuit'),
             ('connecteur-claude.html', 'Claude, formule Pro'), ('connecteur-chatgpt.html', 'ChatGPT'),
             ('connecteurs-ia.html', 'Pour votre entreprise')]),
         ('constats.html', 'Mes constats', 'constats.html', None),
         ('simulateurs.html', 'Simulateurs', 'simulateurs.html', None),
         ('jeux.html', 'Jeux', 'jeux.html', None),
         ('tarifs.html', 'Tarifs', 'tarifs.html', None), ('contact.html', 'Contact', 'contact.html', None)]
SOUS_PAGES = {'modeles.html': 'projetlia.html', 'modele-etude-de-marche.html': 'projetlia.html', 'modele-relation-clients.html': 'projetlia.html', 'modele-production.html': 'projetlia.html', 'modele-stocks-achats.html': 'projetlia.html', 'modele-qualite.html': 'projetlia.html', 'modele-secteur.html': 'projetlia.html', 'connecteur-claude.html': 'projetlia-avec-claude.html',
              'connecteur-chatgpt.html': 'projetlia-avec-claude.html', 'connecteurs-ia.html': 'projetlia-avec-claude.html'}


def tete(page):
    actif = SOUS_PAGES.get(page, page)
    def lien(h, t, p): return f'<a href="{h}"{" aria-current=page" if p == actif else ""}>{t}</a>'
    nav, mob = '', ''
    for h, t, p, sous in LIENS:
        if not sous:
            nav += lien(h, t, p); mob += lien(h, t, p); continue
        items = ''.join(f'<a href="{sh}">{st}</a>' for sh, st in sous)
        nav += f'<div class="groupe">{lien(h, t, p)}<div class="sous" role="group" aria-label="{t}">{items}</div></div>'
        mob += lien(h, t, p) + f'<div class="sous-mobile">{items}</div>'

    return f'''<header class="tete">
  <div class="enveloppe barre">
    <a class="marque" href="./" aria-label="BudappsAI, accueil">{LOGO}<span class="nom">Budappsai<span class="ai">.com</span></span></a>
    <nav class="liens" aria-label="Navigation principale">{nav}</nav>
    <button class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
</header>
<div class="menu-mobile">{mob}</div>'''


PIED = f'''<footer class="pied">
  <div class="enveloppe">
    <div class="colonnes">
      <div><a class="marque" href="./">{LOGO}<span class="nom">Budappsai<span class="ai">.com</span></span></a>
        <p class="signature">Des applications pour décider rapidement. Conçues en Guyane.</p></div>
      <div><h4>Applications</h4><ul><li><a href="projetlia.html">Projé9</a></li><li><a href="tarifs.html#services">Nos services</a></li><li><a href="tarifs.html">Tarifs</a></li></ul></div>
      <div><h4>BudappsAI</h4><ul><li><a href="business-plan-guyane.html">Guide : business plan en Guyane</a></li><li><a href="projetlia-avec-claude.html">Connecteurs IA</a></li><li><a href="simulateurs.html">Simulateurs pour structures</a></li><li><a href="connecteurs-ia.html">Votre IA, vos données (entreprises)</a></li><li><a href="modeles.html">Modèles d'applications</a></li><li><a href="donnees.html">Vos données</a></li><li><a href="contact.html">Contact</a></li><li><a href="mailto:contact@budappsai.com">Courriel</a></li></ul></div>
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
