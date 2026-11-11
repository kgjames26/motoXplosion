# MotoXplosion

PWA de cruising motocross (TypeScript + Vite + Three.js). Voir README.md.

## Numéro de version
- `public/version.json` contient le numéro affiché en tout petit en bas à gauche de l'accueil (`v2.N`).
- Il est incrémenté automatiquement à chaque nouvelle demande par le hook `UserPromptSubmit` (`.claude/settings.json` → `tools/bump-version.mjs`), qui met aussi à jour le nom du cache de `public/sw.js`.
- Si le hook n'a pas tourné, lancer `node tools/bump-version.mjs` une fois par nouvelle demande, avant de commiter.

## Ressources
- `art/source/` : fichiers fournis par l'auteur (planches, peintures, musiques). Les scripts de `tools/` en tirent `public/res/`.
