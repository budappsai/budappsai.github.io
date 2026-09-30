#!/usr/bin/env python3
"""Fabrique la voix de la présentation et recale les sous-titres de l'accueil.

    python3 outils/fabriquer_voix.py                 # voix par défaut
    python3 outils/fabriquer_voix.py "Audrey (Premium)" 160

Chaque phrase est dite séparément par `say`, mesurée, puis assemblée avec de
courts silences : les débuts et fins mesurés remplacent ceux de SCENES dans
index.html. Le volume est volontairement bas (la voix accompagne, elle ne
crie pas). Doit tenir sous 30 secondes, sinon le script refuse.
"""
import array, os, re, subprocess, sys, tempfile, wave

VOIX = sys.argv[1] if len(sys.argv) > 1 else 'Chantal (Enhanced)'
DEBIT = sys.argv[2] if len(sys.argv) > 2 else '175'
ESSAI = sys.argv[3] if len(sys.argv) > 3 else None
VOLUME = 0.55                     # 1 = niveau d'origine de `say`
TAUX = 24000
PHRASES = [                       # ce que la voix DIT (orthographe phonétique)
    "Bienvenue chez Beudapps, A. I.",
    "Ici, on crée des applications pour décider vite, et juste.",
    "La première, L'Atelier, vous accompagne de l'idée, jusqu'au pilotage de votre entreprise.",
    "Chiffres, droit, bâtiment, immobilier : tout se retrouve dans un seul dossier.",
    "Et chaque chiffre vous montre d'où il vient.",
    "Vos données, elles, restent chez vous.",
    "Essayez la démo. C'est gratuit.",
    "Beudapps, A. I. Décidez plus vite.",
]
SILENCES = [0.3, 0.55, 0.45, 0.45, 0.45, 0.45, 0.45, 0.6]
ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with tempfile.TemporaryDirectory() as tmp:
    sortie = os.path.join(tmp, 'voix.wav')
    out = wave.open(sortie, 'wb'); out.setnchannels(1); out.setsampwidth(2); out.setframerate(TAUX)
    t, marques = 0.0, []
    for i, (phrase, pause) in enumerate(zip(PHRASES, SILENCES)):
        f = os.path.join(tmp, f'{i}.wav')
        subprocess.run(['say', '-v', VOIX, '-r', DEBIT, '-o', f, f'--data-format=LEI16@{TAUX}', phrase], check=True)
        w = wave.open(f); ech = array.array('h', w.readframes(w.getnframes())); d = len(ech) / TAUX
        ech = array.array('h', (int(x * VOLUME) for x in ech))
        out.writeframes(b'\0\0' * int(pause * TAUX)); t += pause
        marques.append((round(t, 2), round(t + d, 2))); out.writeframes(ech.tobytes()); t += d
    out.writeframes(b'\0\0' * int(0.4 * TAUX)); t += 0.4
    out.close()
    if t > 30:
        sys.exit(f'Trop long : {t:.1f} s (30 s au plus). Montez le débit.')
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', sortie,
                    ESSAI or os.path.join(ICI, 'media', 'presentation.m4a')], check=True)
if ESSAI:
    print(f'{VOIX} à {DEBIT} : {t:.1f} s -> {ESSAI} ; marques {marques}')
    sys.exit(0)

page = os.path.join(ICI, 'index.html')
html = open(page, encoding='utf-8').read()
bloc = re.search(r'const SCENES = \[(.*?)\n  \];', html, re.S)
lignes = bloc.group(1)
n = iter(marques)
def remplace(m):
    d, f = next(n)
    return f'{{ d: {d}, f: {f},'
lignes2 = re.sub(r'\{ d: [\d.]+, f: [\d.]+,', remplace, lignes)
html = html.replace(lignes, lignes2)
html = re.sub(r"voix\.duration \|\| [\d.]+", f"voix.duration || {t:.1f}", html)
open(page, 'w', encoding='utf-8').write(html)
print(f'{VOIX} à {DEBIT} : {t:.1f} s ; sous-titres recalés.')
