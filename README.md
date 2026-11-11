# MotoXplosion

PWA de **motocross** en 2,5D (scène 3D WebGL vue de côté), jouable sur smartphone **en mode paysage uniquement** : une balade
contemplative dans de grands paysages peints, un vrai défi de pilotage grâce à une physique de moto exigeante, quatre modes de jeu,
sept motos à gagner au garage.

## Accueil

L'accueil tient sur un seul écran paysage : la carte **MODE** (Cruising, Trial, Enduro, Course, chacun avec son icône et son nombre de circuits terminés) à côté de la carte **MONDE** (Alpes, Grande Forêt, Canyon, Désert), puis en bas **GARAGE**, une phrase qui explique le mode, et le gros bouton **JOUER**. Les options sont sous l'engrenage, le porte-monnaie en haut à gauche. En Cruising, JOUER part directement ; dans les trois autres modes, il ouvre le **choix du circuit**.

## Modes de jeu

| Mode | Règles | Gains |
| --- | --- | --- |
| **Cruising** | balade infinie : garder de l'essence (bidons) et de l'eau (bouteilles). Tracé **+5 %** plus relevé qu'avant | distance × **bonus de longue balade** + pièces ramassées + sauts |
| **Trial** | **25 circuits par monde** de **gros obstacles** (pneus de chantier empilés, blocs béton, rochers, épaves, troncs géants, conteneurs, tourets, murs de palettes, pyramides de fûts, meules de foin…), de 4 à 10 zones. Le but : **arriver au bout le plus vite possible**, chaque **chute ajoute 15 secondes** et fait reprendre la zone | prime de fin de circuit + médailles |
| **Enduro** | **25 circuits par monde** avec une **ligne d'arrivée** (1,3 à 2,8 km) : **grosses collines** à monter et à descendre sans tomber (7 à 22 m de haut, de plus en plus raides, bosses et marches rocheuses sur les pentes), racines, troncs, gués ; essence et eau gérées, chrono | prime de fin de circuit + médailles |
| **Course** | **25 circuits par monde** contre **7 pilotes**, chacun jouable en **Facile, Moyen ou Difficile**. Tracés **35 % plus relevés** qu'en cruising (sauts, doubles, berms, whoops), départ arrêté (3-2-1-GO), classement en direct | prix selon la place × circuit × difficulté + médailles |

### Circuits et médailles
- Chaque circuit est toujours le même (graine fixe par mode, monde et numéro) et devient plus dur avec son numéro : obstacles plus gros en trial, collines plus hautes en enduro, rivaux plus forts et piste plus longue en course.
- Écran de choix : grille de **5 × 5** circuits (numéro, médaille, meilleur temps ou meilleure place, cadenas). Terminer un circuit débloque le suivant ; le panneau de droite donne les objectifs.
- **Médailles** : en trial et enduro, Or et Argent sous des temps cibles, Bronze en arrivant au bout ; en course, Or/Argent/Bronze pour la 1re/2e/3e place. Une médaille obtenue pour la première fois rapporte un bonus unique (Bronze 20, Argent 45, Or 90).
- En fin de circuit : **REJOUER**, **SUIVANT** (circuit d'après), GARAGE ou ACCUEIL.

### Course : IA et difficulté
- Les 7 rivaux roulent sur **de vraies motos simulées** (même physique que le joueur). Chacun a son **niveau de 1 à 10**, affiché au-dessus de lui (« Léo Niv.7 »), qui règle sa vitesse visée, sa discipline avant les sauts, sa précision d'équilibre en l'air, son temps de réaction et ses hésitations. Les meilleurs pilotes ont aussi les meilleures motos.
- Le niveau moyen du plateau dépend du **numéro du circuit** et de la **difficulté** choisie (Facile reste gagnable jusqu'au circuit 25, Difficile finit avec des pilotes presque parfaits) ; autour, les niveaux sont étalés.

## Garage et économie

Le **garage** est accessible depuis l'accueil (bouton GARAGE à côté d'OPTIONS) et depuis l'écran de fin de partie, pour dépenser juste après avoir gagné. Deux onglets :
- **MOTOS** : vitrine 3D qui tourne (on peut la faire pivoter du doigt), barres de caractéristiques (en vert quand c'est mieux que la moto actuelle), achat et choix de la moto.
- **TENUES** : 10 tenues de pilote de couleurs différentes (maillot, pantalon, gants, casque), essayées sur la moto en vitrine : Rouge Feu 300, Bleu Océan 400, Jaune Citron 500, Vert Jungle 650, Orange Volcan 800, Violet Galaxie 1 000, Rose Flash 1 250, Blanc Arctique 1 500, Noir Minuit 2 000, Or Champion 3 000. La tenue « aux couleurs de la moto » est offerte.

| Moto | Style | Prix | Points forts |
| --- | --- | --- | --- |
| Explorer 98 | scrambler vintage | offerte | douce et lourde, idéale en balade |
| Sprint 125 | cross 2 temps (jaune/bleu) | 1 200 | légère, tourne vite en l'air, boit plus |
| Ridge T300 | trial (rouge/blanc) | 2 800 | très légère, gros couple, pneus collants ; lente (77 km/h) |
| Trailblazer 250 | enduro (bleu/blanc, phare) | 4 500 | confortable, sobre, polyvalente |
| Fury 450 | cross 4 temps (orange/noir) | 7 000 | puissante, suspensions de course |
| Volt X | électrique (turquoise/noir) | 10 000 | couple instantané, sifflement électrique, autonomie correcte |
| Dakar 690 | rallye-raid (blanc/rouge/bleu, tête de fourche) | 15 000 | la plus rapide (125 km/h), énorme autonomie, lourde en l'air |

Chaque moto change vraiment la physique (puissance, couple, rupteur, masse, raideur et débattement des suspensions, adhérence, contrôle aérien, consommation, freins).

**Gagner des pièces** sans que ce soit rébarbatif : des pièces dorées sont posées en lignes et en arcs **au-dessus des sauts** (il faut sauter pour les attraper), les beaux sauts rapportent (« BIG AIR » +3 au-delà d'1,1 s de vol, réception « PARFAIT » +2), et chaque partie paie selon le mode.

**L'astuce du cruising** : la distance paie de plus en plus. Chaque kilomètre fait monter le **bonus de longue balade** de ×0,25 (×1 au départ, jusqu'à ×4 au 12e km), affiché en haut à droite ; une chute fait redescendre d'un cran. Les circuits rapportent environ 90 à 120 pièces par minute, alors que le cruising démarre à ce niveau puis dépasse largement (environ 2 300 pièces pour 10 minutes de balade sans chute) : **c'est le mode qui rapporte le plus, à condition de cruiser longtemps**. Les gains d'une partie arrêtée depuis la pause sont gardés, ainsi que le record.

Chaque partie (niveau) se déroule dans **une région**, dont on traverse les différents environnements :

| Région | Environnements | Ponts |
| --- | --- | --- |
| **Alpes** | alpages, forêts de pins, montagne rocheuse, gorges et rivières | bois, pierre, fer, viaducs |
| **Grande Forêt** | sous-bois, rivières, clairières | surtout bois et pierre |
| **Canyon** | mesas, sable rouge, roche, oued | treillis en fer, viaducs |
| **Désert** | grandes dunes, oueds secs, oasis à palmiers, dalles de grès (et un peu de canyon) | bois, fer |

Le **Désert** a son propre jeu de décor (saguaros, palmiers, buissons secs, arbres morts, boules d'herbe sèche, blocs de grès, texture de sable ridé par le vent, panorama de dunes) et ses propres structures, générées au hasard selon des règles qui gardent la partie juste :

- **dunes** asymétriques : longue montée douce (pente 12 à 17 %), crête arrondie, redescente sous le vent ≤ 32 % ;
- **oued sec** : berges en pente douce (≤ 28 %) vers un lit caillouteux de 0,9 à 1,5 m de profondeur, jamais un trou ;
- **oasis** : gué peu profond entouré de palmiers, terre tassée autour ;
- **dalles de grès** : 2 ou 3 marches de 35 à 60 cm avec rampes, puis une longue descente ;
- pas de gaps ni de ponts au-dessus de l'eau ; la chaleur fait baisser l'énergie du pilote 45 % plus vite : il faut viser les bouteilles d'eau.

Sur la piste : sauts, tabletops, doubles, gaps, step-ups, drops, whoops, berms, gués, troncs, pierriers, montées
et descentes, et des ponts **en bois** (pont de corde), **en pierre** (arches, dos d'âne), **en fer** (treillis riveté)
ou de grands **viaducs** au-dessus d'une vallée. Le record est gardé pour chaque mode et chaque région.

But du jeu : **aller le plus loin possible** en gérant deux énergies :

| Jauge | Se vide… | Se recharge avec… |
| --- | --- | --- |
| ⛽ Essence (moto) | en continu, plus vite quand on accélère | les **bidons d'essence** rouges |
| 💧 Énergie du pilote | avec le temps, les terrains cassants, les atterrissages durs et les chutes | les **bouteilles d'eau** |

Quand l'une des deux jauges tombe à zéro, la partie est terminée. Le record est enregistré dans le navigateur.

## Contrôles

- **Balance ARRIÈRE / AVANT** (en bas à gauche) : déplace le poids du pilote. Au sol, elle change le centre de gravité (balance à moitié en arrière = wheelie, tout en arrière plein gaz = on se retourne). En l'air, elle fait tourner la moto pour préparer l'atterrissage. Elle revient au centre quand on la lâche.
- **Disque de frein** (juste à gauche de l'accélérateur) : freins avant + arrière.
- **Poignée d'accélérateur** (à droite) : faire glisser vers le bas pour accélérer (plus c'est bas, plus ça pousse). On relâche : gaz coupés, frein moteur.
- **Pause** en haut à droite. Compteur de vitesse en haut à gauche, progression vers le prochain drapeau (tous les 1 000 m) en haut au centre.
- **Options** (accueil et menu pause) : volume de la musique, volume du moteur et des effets, disposition des commandes (*Balance à gauche* par défaut, *Balance au centre*, *Gaucher* en miroir), **qualité graphique** (*Haute* : pleine définition, ombres 2048, forêts denses ; *Moyenne* ; *Basse* : définition 1×, sans ombres portées, moins d'arbres), vibrations.
- Le numéro de version est affiché en tout petit en bas à gauche de l'accueil (`public/version.json`, incrémenté automatiquement, voir CLAUDE.md).
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
- Le jeu se joue **en paysage uniquement** : au lancement il demande le plein écran et le verrouillage paysage quand la plateforme le permet ; en portrait, un écran « Tournez votre téléphone » recouvre le jeu et la partie se met en pause.
- La musique d'accueil démarre dès l'ouverture du jeu ; si le navigateur bloque la lecture automatique, elle démarre au premier toucher. Elle revient à chaque retour dans les menus.

## Retour haptique (Android)

Vibrations à l'atterrissage (proportionnelles à l'impact), au talonnage des suspensions, aux chutes, aux bidons, pièces et cascades, aux fautes et zones réussies en trial, au compte à rebours et à l'arrivée d'une course. Réglables dans les Options. (Les navigateurs iPhone ne permettent pas la vibration.)

## Son

- **Pause** : la musique et tous les sons s'arrêtent, ils reprennent au retour en jeu.
- **Accueil** : on entend le moteur de la moto de démonstration derrière la musique.
- **Musiques** : `public/audio/music-menu.mp3` (accueil, pause, fin de partie) et `music-game.mp3` (en course, en boucle). La boucle saute le silence du début et de la fin et enchaîne avec un fondu de 4 s, sans coupure. Les musiques passent de l'une à l'autre en fondu.
- **Moteur** : synthétisé en temps réel (AudioWorklet, `src/audio/engineWorklet.ts`), modèle d'un monocylindre 4 temps de cross : une explosion tous les deux tours, avec des irrégularités aléatoires, excitant deux résonateurs (échappement et carter). S'y ajoutent le claquement de combustion sous charge et des pétarades à la décélération, puis un filtre passe-bas qui donne un son un peu sourd.

## Catalogue d'assets (1 097 éléments)

Tous les décors et obstacles sont dessinés par le code (`src/catalog/`), en familles paramétrées : chaque élément est une variante distincte (espèce, taille, saison, couleur, forme), dessinée au premier usage puis mise en cache.

| Groupe | Nombre | Exemples |
| --- | --- | --- |
| Cartes (Alpes, Forêt, partagés) | 204 | épicéas, mélèzes, bouleaux, feuillus d'automne, sapins, pins sylvestres, buissons, fleurs, fougères, champignons, rochers moussus, chalets, granges, bottes de foin, chapelle, refuges, vaches, chèvres, cerfs, randonneurs… |
| Cartes (Canyon) | 92 | cheminées de fée, buttes, arches, falaises striées, genévriers, peupliers, yuccas, wagonnets, château d'eau, chariots, rochers gravés… |
| Cartes (Désert) | 111 | saguaros, cactus tonneaux, agaves, arbres de Josué, palmiers, dromadaires, tentes nomades, maisons en adobe, ruines, 4x4, balises de rallye… |
| Trial | 101 | 85 obstacles physiques (la piste suit exactement leur forme) + portes de zone, juges, tableau des points, spectateurs, conteneurs… |
| Enduro | 103 | racines, arbres tombés, pierriers, troncs moussus (physiques) + flèches, contrôles, commissaires, ravitaillement, bornes kilométriques… |
| v2.6 — Alpes | 60 | pylônes de télésiège, cabanes à drapeau, marmottes, bouquetins, névés, blocs erratiques, fontaines, fromageries, téléphériques, croix de sommet, paravalanches, rhododendrons, guirlandes de fanions… |
| v2.6 — Grande Forêt | 55 | rochers moussus géants, troncs à champignons, souches au lierre, miradors, cabanes de bûcheron, chouettes, renards, sangliers, écureuils, cabane dans l'arbre, balançoire, passerelles… |
| v2.6 — Canyon | 55 | mouflons, coyotes, géocoucous, façades de saloon, pont ferroviaire en bois, chevalement de mine, épaves, station-service, dômes de grès, ruines troglodytes, yuccas… |
| v2.6 — Désert | 55 | caravanes de dromadaires, mares d'oasis, étals de marché, poteries, tapis, feux de camp, fennecs, piliers de roche, acacias, fort en ruine, obélisques, camions de rallye… |
| v2.6 — Trial | 80 | 64 **gros obstacles** physiques (0,4 à 1,3 m) avec rampes de terre tassée + arches de chrono, banderoles, fanions, spectateurs, mécaniciens |
| v2.6 — Enduro | 70 | grosses racines, marches en rondins et en pierre (physiques), drapeaux et panneaux de colline, rochers de crête, arbres penchés, arches d'arrivée, photographes, quad de secours… |
| Course | 111 | arche d'arrivée, grille de départ, banderoles de sponsors inventés, tribunes, tentes et camions d'équipe, murs de pneus, foule, tours TV… |

Le générateur tire une « palette » d'une vingtaine d'éléments tous les 100 à 150 m : chaque portion de route a son caractère et le décor ne se répète jamais à l'identique.

## Graphismes et ressources

Moteur : **Three.js (WebGL)**. La version précédente dessinait tout en Canvas 2D sur le processeur, ce qui saccadait sur téléphone (en plus, le son programmait 6 automatisations audio par image, qui s'accumulaient). Tout passe maintenant par la carte graphique.

- **Moto « Explorer 98 »** : modèle 3D procédural d'après les planches fournies (cadre double berceau et réservoir laiton/olive à flancs verts, selle cuir marron, plaques « 98 », roues à rayons et pneus à crampons, échappement haut, fourche télescopique, deux amortisseurs arrière à ressorts dorés). Les roues, les fourreaux de fourche (qui coulissent sur les tubes chromés), le bras oscillant (qui pivote sur le cadre) et les deux amortisseurs (qui se compriment entre cadre et bras) suivent la physique.
- **Pilote** : un vrai motard équipé — maillot (panneaux verts et marron, liserés dorés, « 98 » et « EXPLORER » dans le dos), pantalon de cross, genouillères, bottes hautes à boucles et coques, coudières, gants à coques, pare-pierres, minerve, casque cross texturé avec visière, mentonnière et masque à verre orange. Squelette articulé (bassin, colonne, tête, cuisses, tibias, bras, avant-bras). Le bassin et le buste sont des masses sur ressorts qui réagissent aux accélérations de la moto (poussés en arrière à l'accélération, tassés à l'atterrissage) et à la balance (assis reculé ↔ debout penché sur le guidon). Bras et jambes sont résolus en cinématique inverse : mains sur les poignées, bottes sur les repose-pieds, la tête garde l'horizon. En cas de chute, le pilote est éjecté.
- **Collines** basses et qui s'abaissent au loin, arbres proches et lointains limités en hauteur : le relief du fond (montagnes, mesas, dunes) reste toujours visible.
- **Décor 3D** : piste texturée, champ, collines et forêts en vraie profondeur (perspective), arbres et rochers en billboards instanciés, ponts 3D (pont de corde, arches de pierre, treillis riveté sur piles, viaducs), rivières, brouillard de distance, ombres portées, fond peint très lointain. L'accueil montre la scène en direct, à l'heure dorée, avec la moto qui roule seule.
- **Ressources** : `python3 tools/build_backdrops.py` (numpy, scipy, Pillow) produit le fond peint et les textures sans couture de `public/res/` à partir de `art/source/`.
- **Sécurité de fluidité** : si l'appareil descend sous ~45 images/s pendant 2 s, la définition baisse d'un cran, puis remonte quand la marge revient.

## Architecture

```
src/
  main.ts                 boucle de jeu, écrans, modes, garage, gains, haptique, PWA
  modes.ts                modes de jeu et leurs constantes
  circuits.ts             25 circuits par mode et par monde : graines, longueurs, temps cibles, médailles
  outfits.ts              tenues du pilote vendues au garage
  bikes.ts                les 7 motos : style, couleurs, caractéristiques, prix
  profile.ts              progression sauvegardée : pièces, motos, tenues, records, circuits et médailles
  ai.ts                   pilotes IA de la course (niveaux 1-10)
  catalog/                catalogue d'assets procéduraux (nature, trial, enduro, course, extra v2.6)
  ui/garage.ts            garage avec vitrine 3D (motos et tenues)
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
  gl/
    glRenderer.ts         scène Three.js : caméra, lumières, qualité, fond, streaming des chunks, bonus, particules
    terrain.ts            maillages par chunk : piste, champ, collines, sol avant, billboards instanciés
    bridges.ts            ponts 3D : bois, pierre (arches), fer (treillis), viaducs
    bike3d.ts             moto 3D Explorer 98 + pilote articulé (ressorts, cinématique inverse)
    textures.ts           textures du sol et des sprites
  render/
    background.ts         panorama procédural du canyon
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


### Physique (pas fixe de 300 Hz)

Valeurs mesurées sur le modèle actuel (banc d'essai hors navigateur) :

| Mesure | Résultat |
| --- | --- |
| Masse | 178 kg de moto + pilote (+ 2 roues de 11 kg) : une scrambler lourde |
| Répartition statique avant / arrière | 888 N / 1 050 N ; balance avant 1 394 / 547 N, arrière 389 / 1 545 N |
| Enfoncement statique (sag) | 20 % avant, 23 % arrière |
| Chute de 1 m / 3 m sur le plat | 73 % / 94 % de débattement utilisé, sans talonner, stabilisé en ~1 s |
| 0 → 50 km/h | terre 2,2 s, herbe 2,2 s, sable 2,4 s, boue 2,6 s (patinage fort dans la boue) |
| Vitesse max | ~97 km/h (rupteur) |
| Rotation en l'air (1 s) | 0° sans action, ±53° balance à fond |
| Sauts | tremplins à ~14°, réceptions longues : la plupart des vols durent moins de 1,2 s |

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
2. **Structures de cross** posées sur le relief selon des poids par biome : tabletops, petits doubles franchissables même trop court, step-ups doux, drops modestes, whoops, rollers, berms, ponts, gués, montées, descentes, petits troncs, pierriers bas. Pas de gaps ni de crevasses : rien ne piège le pilote. La difficulté (hauteur des sauts, longueur des gaps, consommation) augmente avec la distance.
3. Les **bidons et bouteilles** sont placés à intervalles aléatoires mais réguliers, jamais au fond d'un gap ni sur un pont.

Le terrain est produit par chunks de 128 m devant le joueur et supprimé derrière lui.
