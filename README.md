# MotoXplosion

MotoXplosion is a mobile-first 2D motocross arcade game built with TypeScript, Canvas 2D and Vite. The first playable version includes four modes, 12 stages, six riders, five bikes, local progression, garage upgrades, keyboard controls and touch controls.

## Run locally

~~~bash
npm install
npm run dev
~~~

Open the local URL printed by Vite. Use **W** to accelerate, **S** to brake, **A/D** to lean and **Q/E** to rotate in the air. On phones, use the on-screen controls in landscape orientation.

## Build

~~~bash
npm run build
npm run preview
~~~

The deployable static files are written to dist/.

## Deploy to GitHub and Vercel

1. Push the repository to GitHub (the repository is named motoXplosion).
2. In Vercel, import the GitHub repository.
3. Keep the default Vite build settings: build command npm run build, output directory dist.
4. Every push to the connected branch triggers a deployment. The app is static and does not need environment variables.

## PWA and saves

The manifest declares a landscape-first installable PWA. The service worker caches the app shell and same-origin files after the first visit. Career progress, coins and upgrades are saved in the browser's localStorage; deleting browser data resets progression.

## Project layout

- src/physics.ts — fixed-step bike and rider dynamics, suspension contacts, landing, crashes, tricks and particles.
- src/terrain.ts — deterministic terrain profile, surface grip/drag/rebound and local deformation.
- src/renderer.ts — parallax scenery, terrain, motorcycle and rider rendering, camera follow and impact effects.
- src/ui.ts — mode, stage, rider, garage, HUD and results interfaces.
- src/save.ts — versioned local progression.
- src/data.ts — rider, bike, mode and stage balance data.
- sw.js and manifest.webmanifest — install and offline shell.

## Next upgrades

Add audio synthesis and motor sound layers, more precise constraint-based suspension, controller mapping through the Gamepad API, further terrain types, original rider illustrations, ghost runs and cloud saves.
