# Site BudappsAI

Site statique, sans dépendance, sans traceur, sans cookie. Hébergé sur GitHub Pages.

| Page | Rôle |
|---|---|
| `index.html` | Accueil animé + présentation sonore (30 s) |
| `demo.html` | Démo guidée en 8 étapes (captures d'un Atelier vierge) |
| `contact.html` | Prépare un courriel dans la messagerie du visiteur (rien n'est envoyé par le site) |
| `mentions-legales.html` | Obligatoire ; seule page qui porte le nom de l'éditeur (non indexée) |
| `confidentialite.html` | Politique de confidentialité |
| `404.html` | Page introuvable |

## Outils
- `python3 outils/pages.py` : pose le même en-tête et pied de page sur toutes les pages (sauf l'accueil).
- `python3 outils/fabriquer_voix.py "Nom de la voix" 172` : refait la voix et recale les sous-titres (30 s au plus).

## Règle
Aucun nom ni prénom de l'éditeur ailleurs que dans les mentions légales.
