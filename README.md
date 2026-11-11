# MotoXplosion

PWA de **cruising motocross infini** en 2,5D, jouable uniquement en mode paysage sur smartphone : une balade
contemplative dans de grands paysages peints, et un vrai défi de pilotage grâce à une physique de moto exigeante.

Chaque partie (niveau) se déroule dans **une région**, dont on traverse les différents environnements :

| Région | Environnements | Ponts |
| --- | --- | --- |
| **Alpes** | alpages, forêts de pins, montagne rocheuse, gorges et rivières | bois, pierre, fer, viaducs |
| **Grande Forêt** | sous-bois, rivières, clairières | surtout bois et pierre |
| **Canyon** | mesas, sable rouge, roche, oued | treillis en fer, viaducs |

Sur la piste : sauts, tabletops, doubles, gaps, step-ups, drops, whoops, berms, gués, troncs, pierriers, montées
et descentes, et des ponts **en bois** (pont de corde), **en pierre** (arches, dos d'âne), **en fer** (treillis riveté)
ou de grands **viaducs** au-dessus d'une vallée. Le record est gardé pour chaque région.

But du jeu : **aller le plus loin possible** en gérant deux énergies :

| Jauge | Se vide… | Se recharge avec… |
| --- | --- | --- |
| ⛽ Essence (moto) | en continu, plus vite quand on accélère | les **bidons d'essence** rouges |
| 💧 Énergie du pilote | avec le temps, les terrains cassants, les atterrissages durs et les chutes | les **bouteilles d'eau** |

Quand l'une des deux jauges tombe à zéro, la partie est terminée. Le record est enregistré dans le navigateur.

## Contrôles (paysage)

- **Balance ARRIÈRE / AVANT** (en bas à gauche) : déplace le poids du pilote. Au sol, elle change le centre de gravité (balance à moitié en arrière = wheelie, tout en arrière plein gaz = on se retourne). En l'air, elle fait tourner la moto pour préparer l'atterrissage. Elle revient au centre quand on la lâche.
- **Disque de frein** (juste à gauche de l'accélérateur) : freins avant + arrière.
- **Poignée d'accélérateur** (à droite) : faire glisser vers le bas pour accélérer (plus c'est bas, plus ça pousse). On relâche : gaz coupés, frein moteur.
- **Pause** en haut à droite. Compteur de vitesse en haut à gauche, progression vers le prochain drapeau (tous les 1 000 m) en haut au centre.
- **Paramètres** (roue dentée sur l'accueil et dans le menu pause) : volume de la musique, volume du moteur et des effets, disposition des commandes (*Balance à gauche* par défaut, *Balance au centre*, *Gaucher* en miroir), vibrations.
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
- `public/sw.js` : réseau d'abord pour la page (avec repli hors ligne), cache d'abord pour le code hashé, les images de `public/res/` et les icônes. Après une première visite, le jeu fonctionne hors ligne (sans la musique, qui est diffusée en streaming). **Penser à changer `CACHE` dans `sw.js` quand un fichier de `public/res/` change.**
- Au lancement d'une partie, le jeu demande le plein écran et le verrouillage en paysage quand la plateforme le permet (Android / PWA installée). En portrait, un écran « Tournez votre téléphone » recouvre le jeu et la partie se met en pause.

## Son

- **Musiques** : `public/audio/music-menu.mp3` (accueil, pause, fin de partie) et `music-game.mp3` (en course, en boucle). La boucle saute le silence du début et de la fin et enchaîne avec un fondu de 4 s, sans coupure. Les musiques passent de l'une à l'autre en fondu.
- **Moteur** : synthétisé en temps réel (AudioWorklet, `src/audio/engineWorklet.ts`), modèle d'un monocylindre 4 temps de cross : une explosion tous les deux tours, avec des irrégularités aléatoires, excitant deux résonateurs (échappement et carter). S'y ajoutent le claquement de combustion sous charge et des pétarades à la décélération, puis un filtre passe-bas qui donne un son un peu sourd.

## Graphismes et ressources

Tout ce qui est dans `art/source/` a été fourni par l'auteur du jeu (planches de poses du pilote, peintures de référence, musiques). Les fichiers du jeu sont produits par deux scripts Python (numpy, scipy, Pillow) :

```bash
python3 tools/build_rider_atlas.py   # poses du pilote -> public/res/rider-atlas.webp + .json
python3 tools/build_backdrops.py     # fond peint + textures -> public/res/*.webp
```

- **Moto et pilote** : 90 poses détourées dans les deux planches. Chaque pose est alignée sur les axes de roues, les numéros et l'ombre peinte sont retirés, et les roues, le bras oscillant et le bas de fourche sont effacés : le jeu les redessine aux positions de la physique, ce qui rend la compression et la détente des suspensions visibles. La pose est choisie selon la balance, l'écrasement des suspensions et le vol, avec un fondu court entre deux poses.
- **Fond** : panorama peint (montagnes enneigées, collines boisées), rendu sans couture par miroir, avec une parallaxe très lente. Le canyon a un fond procédural (mesas, strates).
- **Textures** sans couture : terre caillouteuse, herbe, roche à facettes (grise ou rouge), pierre de taille pour les ponts.
- **Résolution adaptative** : si l'appareil n'arrive plus à suivre (moins d'environ 48 images/s), la définition du rendu baisse par paliers, puis remonte quand la marge revient.

## Architecture

```
src/
  main.ts                 boucle de jeu, écrans, paramètres, régions, PWA
  settings.ts             paramètres enregistrés (volumes, disposition, région, vibrations)
  assets.ts               chargement des images et métadonnées (public/res)
  game.ts                 règles : énergies, bidons/bouteilles, chutes, relance, fin de partie, effets
  core/math.ts            PRNG déterministe, bruit 1D (value noise, fbm, ridged), utilitaires
  physics/bike.ts         physique de la moto (voir plus bas)
  world/
    types.ts              types partagés, surfaces et leurs propriétés physiques
    world.ts              champ de hauteur infini par chunks, requêtes de collision cercle/polyligne
    regions.ts            régions (niveaux) : environnements, types de ponts, fonds
    generator.ts          génération procédurale : environnements puis structures de cross, ponts, décor, bonus
  render/
    renderer.ts           orchestration du rendu Canvas 2D : caméra, fond peint, couches, bonus, moto, particules
    terrain.ts            sol : champ, piste texturée 2,5D, surfaces, ravins, rivières
    bridges.ts            ponts en bois, en pierre (arches), en fer (treillis) et viaducs
    bikeSprite.ts         moto + pilote à partir de l'atlas de poses, roues/bras oscillant/fourche physiques
    bikeRenderer.ts       moto vectorielle de secours (affichée tant que l'atlas charge)
    background.ts         couches de parallaxe en tuiles mises en cache (rangées de pins, mesas)
    view.ts               interface écran partagée et motifs de textures ancrés au monde
    sprites.ts            sprites pré-rendus (pins peints, rochers, herbes, fleurs, nuages, bidons, bouteilles)
    particles.ts          particules en pool (poussière, mottes de terre, éclaboussures, étincelles)
    palette.ts            palettes par biome et fondus entre biomes
  ui/controls.ts          contrôles tactiles multi-touch (poignée, balance, frein) et clavier
  ui/hud.ts               compteur, jauges, progression
  audio/audio.ts          musiques en boucle, volumes, vent et effets
  audio/engineWorklet.ts  synthèse du moteur 4 temps (AudioWorklet)
tools/                    scripts de préparation des images (atlas des poses, fond, textures)
art/source/               fichiers originaux fournis (poses, peintures, musiques)
```

Le rendu est en Canvas 2D plutôt qu'en Three.js : pour une vue de côté en 2,5D faite d'images peintes et de sprites, c'est plus léger sur mobile.

### Physique (pas fixe de 300 Hz)

Valeurs mesurées sur le modèle actuel (banc d'essai hors navigateur) :

| Mesure | Résultat |
| --- | --- |
| Répartition statique avant / arrière | 740 N / 875 N (46 % sur l'avant) ; balance avant 1 145 / 472 N, arrière 340 / 1 271 N |
| Enfoncement statique (sag) | 21 % avant, 23 % arrière |
| Chute de 1 m / 3 m sur le plat | 73 % / 94 % de débattement utilisé, sans talonner, stabilisé en ~1 s |
| 0 → 50 km/h | terre 1,7 s, herbe 1,75 s, sable 1,9 s, boue 2,5 s (patinage fort dans la boue) |
| Vitesse max | ~114 km/h |
| Rotation en l'air (1 s) | 0° sans action, ±60 à 70° balance à fond |

- **Châssis rigide** (moto + pilote, masse, inertie en tangage). Le **centre de gravité se déplace** avec la balance du pilote, avec un transfert de poids progressif.
- **Deux roues indépendantes** : chacune est une masse qui coulisse sur l'axe de sa suspension (fourche avec angle de chasse, axe arrière incliné comme un bras oscillant), avec **ressort progressif + précharge**, **amortissement séparé en compression et en détente**, butée de détente et **butée de fin de course progressive**. Un talonnage transmet le choc au châssis.
- **Pneus** : contact pénalisé contre la polyligne du terrain (amortissement selon la surface) et **adhérence basée sur le glissement** ; chaque roue a sa propre rotation. Le patinage, le blocage des freins, les **wheelies dus au couple moteur** et les stoppies découlent directement du modèle.
- **Moteur** : couple limité par la puissance, rupteur, frein moteur, régime simulé (rapports virtuels) pour le son.
- **Surfaces** : terre, herbe, boue, sable, roche, bois, eau, chacune avec son adhérence, sa résistance au roulement et son rebond.
- **Contrôle aérien** : la balance applique un couple en l'air ; donner des gaz en l'air relève l'avant, freiner le fait plonger.
- **Réflexe du pilote** : au sol, un wheelie ou un stoppie involontaire est rattrapé (comme le ferait un vrai pilote) ; tirer franchement la balance permet de les faire exprès.
- **Atterrissages** : la vitesse d'impact perpendiculaire à la pente (plus un talonnage) et le désalignement avec la pente coûtent de l'énergie au pilote. Atterrir dans la pente de réception est doux, à plat c'est dur. Si le casque ou le dos touche le sol, c'est la chute : le pilote est éjecté, puis repart un peu plus loin. Une moto coincée (fond de gap, retournée) est relancée automatiquement.

### Génération procédurale

1. **Paysage** : suite de biomes (forêt, prairie, montagne, canyon, rivière) avec leur relief de base (bruit fractal, tendance de pente bornée), leurs surfaces et leur décor.
2. **Structures de cross** posées sur le relief selon des poids par biome : tabletops, doubles, gaps, step-ups, drops, whoops, rollers, berms, ponts en bois (ravin ou rivière), gués, montées, descentes, troncs, pierriers. La difficulté (hauteur des sauts, longueur des gaps, consommation) augmente avec la distance.
3. Les **bidons et bouteilles** sont placés à intervalles aléatoires mais réguliers, jamais au fond d'un gap ni sur un pont.

Le terrain est produit par chunks de 128 m devant le joueur et supprimé derrière lui.
