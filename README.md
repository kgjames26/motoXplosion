# MotoXplosion

PWA de **cruising motocross infini** en 2,5D cel-shading, jouable uniquement en mode paysage sur smartphone.
Le décor est généré à l'infini : forêts de pins, prairies, montagnes enneigées, canyons et rivières, avec des
sauts, des doubles, des gaps, des whoops, des berms, des ponts en bois, des gués, des montées et des descentes.

But du jeu : **aller le plus loin possible** en gérant deux énergies :

| Jauge | Se vide… | Se recharge avec… |
| --- | --- | --- |
| ⛽ Essence (moto) | en continu, plus vite quand on accélère | les **bidons d'essence** rouges |
| 💧 Énergie du pilote | avec le temps, les terrains cassants, les atterrissages durs et les chutes | les **bouteilles d'eau** |

Quand l'une des deux jauges tombe à zéro, la partie est terminée. Le record est enregistré dans le navigateur.

## Contrôles (paysage)

- **Poignée d'accélérateur** (à droite) : faire glisser vers le bas pour accélérer (plus c'est bas, plus ça pousse). On relâche : gaz coupés, frein moteur.
- **Balance ARRIÈRE / AVANT** (en bas au centre) : déplace le poids du pilote. Au sol, elle change le centre de gravité (wheelie ou charge sur l'avant). En l'air, elle fait tourner la moto pour préparer l'atterrissage. Elle revient au centre quand on la lâche.
- **Disque de frein** (à gauche) : freins avant + arrière.
- **Pause** en haut à droite. Compteur de vitesse en haut à gauche, progression vers le prochain drapeau (tous les 1 000 m) en haut au centre.
- Au clavier (pour tester sur ordinateur) : ↑/W gaz, ↓/S/Espace frein, ←/A arrière, →/D avant, P/Échap pause.

## Développement

```bash
npm install
npm run dev       # serveur de dev Vite (http://localhost:5173)
npm run build     # vérification TypeScript + build de production dans dist/
npm run preview   # sert dist/ en local (pour tester le service worker)
```

Node 18 ou plus récent. Aucune dépendance d'exécution : seulement TypeScript et Vite en dev.

## Déploiement sur Vercel

Le projet est un build Vite standard, sans configuration particulière :

1. Importer le dépôt GitHub dans Vercel.
2. Laisser les réglages détectés : *Framework* Vite, *Build command* `npm run build`, *Output directory* `dist`.
3. Chaque push sur `main` déclenche un déploiement. Aucune variable d'environnement n'est nécessaire.

`vercel.json` ajoute seulement des en-têtes de cache : `sw.js` jamais mis en cache, assets hashés immuables.

## PWA

- `public/manifest.webmanifest` : plein écran, orientation `landscape`, icônes 192/512 (dont une maskable) et une icône SVG.
- `public/sw.js` : réseau d'abord pour la page (avec repli hors ligne), cache d'abord pour les assets hashés et les icônes. Après une première visite, le jeu fonctionne hors ligne.
- Au lancement d'une partie, le jeu demande le plein écran et le verrouillage en paysage quand la plateforme le permet (Android / PWA installée). En portrait, un écran « Tournez votre téléphone » recouvre le jeu et la partie se met en pause.

## Architecture

```
src/
  main.ts                 boucle de jeu, écrans, PWA
  game.ts                 règles : énergies, bidons/bouteilles, chutes, relance, fin de partie, effets
  core/math.ts            PRNG déterministe, bruit 1D (value noise, fbm, ridged), utilitaires
  physics/bike.ts         physique de la moto (voir plus bas)
  world/
    types.ts              types partagés, surfaces et leurs propriétés physiques
    world.ts              champ de hauteur infini par chunks, requêtes de collision cercle/polyligne
    generator.ts          génération procédurale : biomes puis structures de cross, décor, bonus
  render/
    renderer.ts           rendu Canvas 2D cel-shading : ciel, terrain 2,5D, ponts, bonus, moto, particules
    background.ts         couches de parallaxe en tuiles mises en cache (montagnes enneigées, mesas, forêts)
    bikeRenderer.ts       moto et pilote procéduraux (fourche, bras oscillant, amortisseur animés)
    sprites.ts            sprites pré-rendus (pins, rochers, herbes, fleurs, nuages, bidons, bouteilles)
    particles.ts          particules en pool (poussière, mottes de terre, éclaboussures, étincelles)
    palette.ts            palettes par biome et fondus entre biomes
  ui/controls.ts          contrôles tactiles multi-touch (poignée, balance, frein) et clavier
  ui/hud.ts               compteur, jauges, progression
  audio/audio.ts          sons synthétisés en WebAudio (moteur selon le régime, vent, effets)
```

Le rendu est en Canvas 2D plutôt qu'en Three.js : pour une vue de côté en 2,5D, c'est plus léger sur mobile, et les contours nets et aplats du cel-shading se dessinent directement.

### Physique (pas fixe de 300 Hz)

- **Châssis rigide** (moto + pilote, masse, inertie en tangage). Le **centre de gravité se déplace** avec la balance du pilote, avec un transfert de poids progressif.
- **Deux roues indépendantes** : chacune est une masse qui coulisse sur l'axe de sa suspension (fourche avec angle de chasse, axe arrière incliné comme un bras oscillant), avec **ressort progressif + précharge**, **amortissement séparé en compression et en détente**, butée de détente et **butée de fin de course progressive**. Un talonnage transmet le choc au châssis.
- **Pneus** : contact pénalisé contre la polyligne du terrain (amortissement selon la surface) et **adhérence basée sur le glissement** ; chaque roue a sa propre rotation. Le patinage, le blocage des freins, les **wheelies dus au couple moteur** et les stoppies découlent directement du modèle.
- **Moteur** : couple limité par la puissance, rupteur, frein moteur, régime simulé (rapports virtuels) pour le son.
- **Surfaces** : terre, herbe, boue, sable, roche, bois, eau, chacune avec son adhérence, sa résistance au roulement et son rebond.
- **Contrôle aérien** : la balance applique un couple en l'air ; donner des gaz en l'air relève l'avant.
- **Atterrissages** : l'intensité (talonnage, efforts) et le désalignement avec la pente coûtent de l'énergie au pilote. Si le casque ou le dos touche le sol, c'est la chute : le pilote est éjecté, puis repart un peu plus loin. Une moto coincée (fond de gap, retournée) est relancée automatiquement.

### Génération procédurale

1. **Paysage** : suite de biomes (forêt, prairie, montagne, canyon, rivière) avec leur relief de base (bruit fractal, tendance de pente bornée), leurs surfaces et leur décor.
2. **Structures de cross** posées sur le relief selon des poids par biome : tabletops, doubles, gaps, step-ups, drops, whoops, rollers, berms, ponts en bois (ravin ou rivière), gués, montées, descentes, troncs, pierriers. La difficulté (hauteur des sauts, longueur des gaps, consommation) augmente avec la distance.
3. Les **bidons et bouteilles** sont placés à intervalles aléatoires mais réguliers, jamais au fond d'un gap ni sur un pont.

Le terrain est produit par chunks de 128 m devant le joueur et supprimé derrière lui.
