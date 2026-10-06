"""Le bloc « Veille réglementaire » de projetlia.html, tiré des registres réels.

Chaque application de PROJETLIA tient son registre de veille dans
~/<APP>-source/static/veille.json : un point par barème ou texte suivi, avec
sa source officielle et la date de sa dernière vérification. Ce script compte
les points et reprend la date la plus récente de chaque registre, puis réécrit
le bloc entre <!-- VEILLE:debut --> et <!-- VEILLE:fin -->. Aucun chiffre n'est
écrit à la main : on relance le script après chaque veille.

    python3 outils/veille_site.py          réécrit le bloc
    python3 outils/veille_site.py --voir   affiche les chiffres sans rien écrire
"""
import json, os, sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.expanduser('~')
PAGE = os.path.join(ICI, 'projetlia.html')
DEBUT, FIN = '<!-- VEILLE:debut -->', '<!-- VEILLE:fin -->'

# (dépôt, nom affiché, variable de couleur du site, ce que le registre suit)
APPLIS = [
    ('CREATA', 'CREATA', 'creata', "Impôts, cotisations, TVA, aides à la création, outre-mer"),
    ('JURIDIA', 'JURIDIA', 'juridia', "Seuils d'effectif, obligations sociales, assurances, ERP"),
    ('FONCIERA', 'PATRIMONIA', 'patrimonia', "Régimes locatifs, plus-values, frais d'acquisition, crédit"),
    ('ENERGIA', 'ENERGIA', 'energia', "Tarifs de l'électricité, RTAA DOM, décret tertiaire, aides"),
    ('PILOTIA', 'PILOTIA', 'pilotia', "Calendrier fiscal, mentions obligatoires des factures"),
    ('ATELIER', 'Commun', 'btpedia', "SMIC, taux d'emprunt, index BT, prix de l'énergie, facture électronique"),
]


def _date(iso):
    a, m, j = (iso or '').split('-') if iso and iso.count('-') == 2 else ('', '', '')
    return f'{j}/{m}/{a}' if a else '—'


def lire():
    lignes = []
    for depot, nom, couleur, theme in APPLIS:
        f = os.path.join(SOURCES, f'{depot}-source', 'static', 'veille.json')
        try:
            items = json.load(open(f, encoding='utf-8')).get('items', [])
        except (OSError, ValueError):
            items = []
        if not items:
            continue
        dates = sorted(i.get('verifie_le', '') for i in items if i.get('verifie_le'))
        lignes.append((nom, couleur, theme, len(items), dates[-1] if dates else ''))
    return lignes


def bloc(lignes):
    total = sum(l[3] for l in lignes)
    derniere = max((l[4] for l in lignes), default='')
    rangs = '\n'.join(
        f'        <div class="pays-ligne">\n'
        f'          <div class="pays-app"><b style="--c:var(--{c})">{n}</b><span>{t}</span></div>\n'
        f'          <div class="pays-liste"><span class="ok">{k} point{"s" if k > 1 else ""} suivi{"s" if k > 1 else ""}</span>'
        f'<span class="note">dernière vérification le {_date(d)}</span></div>\n'
        f'        </div>' for n, c, t, k, d in lignes)
    return f'''{DEBUT}
  <section id="veille">
    <div class="enveloppe">
      <div class="etiquette revele">Veille réglementaire</div>
      <h2 data-mots>Des barèmes <span class="degrade">tenus à jour</span></h2>
      <p class="chapeau revele d2">{total} barèmes et textes officiels sont suivis dans les applications, chacun relié à sa source (service-public.fr, Légifrance, URSSAF, INSEE, ADEME…) et daté de sa dernière vérification. L'application affiche cette date : un chiffre ancien ne passe pas inaperçu. Dernière campagne de veille : {_date(derniere)}.</p>
      <div class="pays revele">
{rangs}
      </div>
      <p class="pays-limites revele">Une valeur qui change n'est jamais corrigée automatiquement : elle est relue, puis modifiée à tous les endroits où elle sert, et une nouvelle version est publiée.</p>
    </div>
  </section>
  {FIN}'''


def main():
    lignes = lire()
    if '--voir' in sys.argv:
        for l in lignes:
            print(f'{l[0]:11} {l[3]:3} points  dernière vérification {_date(l[4])}')
        print('total', sum(l[3] for l in lignes))
        return
    html = open(PAGE, encoding='utf-8').read()
    nouveau = bloc(lignes)
    if DEBUT in html:
        avant, reste = html.split(DEBUT, 1)
        html = avant + nouveau + reste.split(FIN, 1)[1]
    else:
        ancre = '  <section id="applications">'
        assert html.count(ancre) == 1, 'ancre introuvable dans projetlia.html'
        html = html.replace(ancre, '  ' + nouveau + '\n\n' + ancre)
    open(PAGE, 'w', encoding='utf-8').write(html)
    print('projetlia.html : bloc de veille à jour,', sum(l[3] for l in lignes), 'points')


if __name__ == '__main__':
    main()
