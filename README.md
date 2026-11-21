# Salon – launcher TV pour Linux

<img width="2200" height="1288" alt="stevounettv_accueil" src="https://github.com/user-attachments/assets/4e3a899b-a9d9-4065-b4b3-28107b9e5af5" /> <img width="2200" height="1288" alt="stevounettv_Bibliotheque" src="https://github.com/user-attachments/assets/3e5b000e-adef-4a8b-96f8-f37cbd15fd21" /><img width="2200" height="1288" alt="stevounettv_jeux" src="https://github.com/user-attachments/assets/4ed53a6d-f621-4ae1-8f89-1f14f55ea291" /><img width="2200" height="1288" alt="stevounettv_parametres" src="https://github.com/user-attachments/assets/94c2df87-1f23-4cfd-8584-811b5ef43799" />

## Installation (toutes distributions)
    chmod +x install.sh run.sh && ./install.sh
Le script détecte ta distribution (apt, dnf/yum, pacman, zypper, apk, xbps, emerge), installe Node.js 18+, `playerctl` et les bibliothèques
d'Electron, puis `npm install`, crée le raccourci « Salon » dans les applis et le démarrage automatique de session.
- `./run.sh` : lance Salon (relance sans sandbox si Electron est refusé : AppArmor, espaces de noms utilisateur désactivés…).
- `./install.sh --session` : crée aussi une session plein écran « Salon » (cage) dans le gestionnaire de connexion.
- `./install.sh --no-deps` : n'installe pas les paquets système. `SALON_DRY_RUN=1 ./install.sh` : simulation sans rien modifier.
- `./uninstall.sh` : retire les raccourcis (la configuration est conservée).
- `install-fedora.sh` est conservé et appelle `install.sh`.

## Configuration
Tout se règle dans **Réglages** (barre latérale) : serveur Jellyfin, clés API, applis.
Le fichier est `~/.config/salon-launcher/config.json` :
- `jellyfin.url` / `jellyfin.key` (Tableau de bord > Clés API) / `jellyfin.tmdb` (optionnel, commentaires)
- `apps` : id, nom, sous-titre, commande, arguments (4 cartes affichées)
  - Flatpak : `"cmd":"flatpak","args":["run","tv.kodi.Kodi"]`
  - Appli installée par .desktop : `"cmd":"gtk-launch","args":["nom-du-desktop"]`

## Télécommande
Bigscreen traduit déjà la télécommande (CEC, IR, Bluetooth) en touches clavier :
flèches, Entrée, Retour (Échap). Salon utilise ces touches ; depuis Jellyfin, Échap ramène au launcher.

## Problèmes courants
- Erreur de sandbox Electron au lancement : lancer une fois avec `--no-sandbox`.
- Une appli déjà ouverte rend la main tout de suite : la fermer avant de la lancer depuis Salon.

## Jellyfin, carrousel et jeux (Réglages)
- **Tester la connexion** : vérifie le serveur, la clé API Jellyfin (et le nombre de bibliothèques) et la clé TMDB.
- **Carrousel** : choix des bibliothèques (cases à cocher) et du classement :
  derniers ajouts, mieux notés TMDB, populaires TMDB ou tendances de la semaine TMDB (clé TMDB requise).
- **Jeux** : l'entrée « Jeux » de la barre latérale affiche 8 jeux tirés au hasard dans les playlists RetroArch
  (`~/.config/retroarch/playlists`, ou la version Flatpak), avec leurs pochettes si elles sont téléchargées.
  « Autres jeux » retire de nouveaux titres. Pour le Flatpak, mettre `flatpak run org.libretro.RetroArch` comme commande.

## Fermer une application, ajouter des applis, bibliothèque TMDB
- **Fermer l'appli ouverte** : Échap (réglable dans Réglages, section « Fermer une application ») ou la croix en haut à droite,
  qui s'efface après quelques secondes et réapparaît quand la souris s'approche du coin.
  Le raccourci n'est actif que pendant qu'une appli lancée depuis Salon tourne.
  Cela demande XWayland (activé par défaut, `SALON_OZONE=wayland` pour le désactiver) : sous Wayland pur, Electron ne peut ni
  placer la croix ni capter un raccourci global.
- **Ajouter des applis** : tuile « + » sur l'accueil (liste des applis installées) ou section Applications des Réglages.
- **Dossier RetroArch** : sélection par navigation dans les dossiers, sans saisie.
- **Bibliothèque** (barre latérale) : films et séries TMDB (tendances, populaires, mieux notés). Les titres présents dans
  Jellyfin sont marqués ; sinon, un clic lit la bande-annonce dans le navigateur.

## Panneau vertical, contrôleur de média, applis en arrière-plan
- **Jellyfin** est une appli comme les autres (tuile déplaçable, redimensionnable, retirable ; « + » pour la remettre).
- **Panneau vertical** à gauche : Accueil, Bibliothèque, Jeux, Réglages, séparé des tuiles.
- **Contrôleur de média** (en bas du panneau, avant Réglages) : titre, artiste, pochette, précédent / lecture-pause / suivant
  pour le lecteur MPRIS actif (Spotify, navigateur, VLC…). Demande `playerctl` (installé par `install-fedora.sh`).
  Désactivable dans Réglages > Autres paramètres.
- **Croix de fermeture** : zone de 10 px en haut à droite (réglable) qui reste active ; au survol, elle affiche
  « Accueil » (retour à Salon, l'appli continue, par exemple la musique) et « Fermer ».
- **Reprendre** : quand une appli tourne en arrière-plan, une pastille « ▶ Reprendre » apparaît dans le panneau vertical ;
  cliquer sur la tuile de cette appli la reprend aussi (pas de second lancement).
- **Nombre de tuiles par écran** : calculé en pixels à chaque affichage, il reste correct quand on ajoute des applis.

## Styles du panneau films et séries, logos des applications
- **Réglages > Accueil > Style du panneau** : quatre styles avec aperçu (Cinéma, Affiches, Immersif, Classique).
  Cinéma et Affiches affichent sous le titre les vignettes ou affiches des titres suivants (cliquables).
- **Réglages > Applications** : chaque appli, webapp ou Jellyfin a un bouton « Logo » (Automatique, Image de mon ordinateur,
  Initiale, Aucun). L'image choisie est copiée dans le dossier de config (5 Mo max).

## Éteindre et redémarrer
Deux boutons-icônes (sans texte) sous « Réglages » dans le panneau vertical. Ils demandent une confirmation (« Annuler » est présélectionné)
puis lancent `systemctl poweroff` ou `systemctl reboot` (autorisés pour la session locale active).

## Logo à côté du nom
Réglages > Style > « Nom et logo » : nom de l'interface, logo (rond orange, initiale, image de ton ordinateur ou aucun),
taille du logo (petit, moyen, grand), position (à gauche ou à droite du nom) et affichage du nom (désactivable pour un logo seul).

## Bibliothèque : catégories
Trois catégories en haut de la vue Bibliothèque : **Derniers films ajoutés** et **Dernières séries ajoutées** (Jellyfin, 10 par page,
flèches ‹ ›) et **Top TMDB** (tendances, populaires, mieux notés ; titres déjà dans Jellyfin marqués).
L'entrée **Jeux** de la barre latérale ne montre que des jeux (tirage au hasard dans RetroArch).
Catégorie affichée au départ : Réglages > Bibliothèques > Vue Bibliothèque.

## Vues affichées
Réglages > Autres paramètres > « Vues affichées » : Bibliothèque (panneau de gauche), Recherche (barre du haut)
et Tout voir (accueil) sont affichées par défaut ; chacune peut être masquée dans ce menu.

## Continuer à regarder
Une ligne « Continuer à regarder » s'affiche sur l'accueil, au-dessus de la ligne des applis : films et séries en cours sur Jellyfin
(miniature, titre, saison et épisode, pourcentage vu, barre de progression). Un clic ouvre la fiche du titre dans Jellyfin.
La ligne disparaît s'il n'y a rien à reprendre. Réglages > Bibliothèques > Jellyfin : utilisateur (par défaut le premier utilisateur actif),
affichage oui/non et nombre de titres (2 à 5). Mise à jour toutes les 90 secondes et au retour dans le launcher.

## Forme des tuiles
Réglages > Style > « Forme des tuiles » : forme (libre, carré, rectangle 4:3, large 16:9, portrait 3:4), bords arrondis
(aucun à pilule) avec réglage fin − / +, et aperçu en direct. En forme fixe, les tuiles gardent leur proportion et ne dépassent
pas la hauteur de la rangée ; la taille de chaque tuile (onglet Accueil) élargit la tuile sans changer sa hauteur.

## Couleurs des boutons et contour de sélection
Réglages > Style > Couleurs : « Couleur des boutons et éléments actifs » (boutons Enregistrer, onglet actif, éléments sélectionnés…)
et « Contour de sélection » (cadre autour de l'élément sélectionné sur l'accueil et dans les menus), avec palette, code couleur et aperçu.

## Styles de la météo
Réglages > Style > Heure et météo : cinq styles avec aperçu — Compact (icône et température), Minimal (température seule),
Détaillé (conditions et ville), Pastille (bulle avec ville, minimum et maximum) et Prévisions (aujourd'hui et trois jours suivants).
Données Open-Meteo, actualisées toutes les 30 minutes ; la ville se règle au même endroit.

## Compatibilité Linux
- **Distributions** : Debian, Ubuntu et dérivés (Mint, Pop!_OS…), Fedora/RHEL (Rocky, Alma), Arch (Manjaro, EndeavourOS), openSUSE, Void, Gentoo ;
  NixOS et Guix en installation manuelle (`nix-shell -p nodejs playerctl --run "./install.sh --no-deps"`). Alpine (musl) : Electron demande glibc
  (paquet gcompat) ou passe par l'AppImage (`npm run dist`). Architectures : x86_64, arm64 (Raspberry Pi 4/5…) et armv7l.
- **Node.js trop ancien** (Debian 11, Ubuntu 20.04…) : l'installateur télécharge Node.js 20 officiel dans `~/.local/share/salon-node`.
- **Applis et icônes** : lues dans tous les dossiers XDG (`XDG_DATA_DIRS`, `XDG_DATA_HOME`), Flatpak, Snap, Nix, Guix ; tous les thèmes d'icônes présents.
- **Navigateur** (bandes-annonces, webapps) : détecté au premier lancement (Firefox, Firefox ESR, LibreWolf, Chromium, Chrome, Brave, Vivaldi, Edge,
  Epiphany, puis Flatpak) ; modifiable dans Réglages > Autres paramètres.
- **Éteindre / redémarrer** : `systemctl`, puis `loginctl` (elogind), puis `poweroff` / `reboot` / `shutdown` pour OpenRC, runit, s6…
- **RetroArch** : paquet natif, Flatpak, Snap, `XDG_CONFIG_HOME` et `~/.retroarch`.
- **Affichage** : X11/XWayland utilisé si disponible (croix flottante et raccourci de fermeture) ; Wayland pur sinon (ces deux fonctions sont alors limitées).
  `SALON_OZONE=x11|wayland` force un mode. Sous i3, sway, Openbox, Hyprland… ajoute `exec /chemin/vers/run.sh` à ta configuration pour le démarrage automatique.

## Bandes-annonces : plein écran et lecture automatique
Réglages > Autres paramètres > Bandes-annonces : **Plein écran** (seul le lecteur YouTube remplit l'écran) et **Lecture automatique**
(la vidéo démarre sans clic). Pour Firefox, Salon crée un profil dédié (`~/.config/salon-launcher/firefox-trailer`) qui autorise la lecture automatique
et ajoute `--new-instance` ; pour Chromium, Chrome, Brave, Vivaldi et Edge, l'option `--autoplay-policy=no-user-gesture-required` est ajoutée.
Si ta commande de navigateur n'a pas `--kiosk`, il est ajouté (Firefox) ou remplacé par `--start-fullscreen` (Chromium…). Avec Firefox en Flatpak,
la lecture automatique dépend des réglages de ton Firefox. Échap ou la croix en haut à droite ferment la vidéo.

## Lecteur de musique : Feishin, autres logiciels et téléphone
Le lecteur du panneau de gauche pilote tout lecteur compatible MPRIS (Feishin, Spotify, VLC, Firefox, Kodi…) grâce à `playerctl`.
- **Téléphone** : en Bluetooth, le service `mpris-proxy` de BlueZ expose la musique du téléphone (l'installateur l'active s'il est présent :
  `systemctl --user enable --now mpris-proxy`). Avec KDE Connect ou GSConnect, le lecteur du téléphone apparaît aussi (module « Contrôle multimédia »).
- **Plusieurs lecteurs** : le bouton ⇄ passe de l'un à l'autre ; par défaut, c'est celui qui joue qui s'affiche.
- **Lecteur préféré** : Réglages > Autres paramètres > Lecteur de musique (par exemple `feishin`) : il s'affiche même en pause ou sans titre.
- **Appli de musique** : choisis Feishin (ou une autre) dans la liste des applis installées ; sans lecture en cours, le panneau propose « Ouvrir Feishin ».

## Panneau latéral en icônes
Réglages > Style > Panneau latéral : **Icônes** (par défaut) — panneau étroit, comme sur une télé, qui se déploie quand on s'en approche ou qu'on le sélectionne
à la télécommande — ou **Large** (toujours déployé, avec les noms). Replié, il montre les icônes, la pochette et lecture/pause du lecteur, « Reprendre » et les boutons d'alimentation.

## Lecteur dans la barre du haut
Le lecteur de média est maintenant à droite de la barre de recherche : pochette, titre, lecture/pause et une petite flèche qui déroule le panneau de contrôle
(source ⇄, progression, précédent/suivant, volume). Échap, un clic ailleurs ou la sélection d'un autre élément le referment.

## Alimentation et icône des réglages
Un seul bouton d'alimentation (en bas du panneau latéral) ouvre un menu : Annuler, Éteindre, Redémarrer. L'icône des réglages se choisit dans
Réglages > Style > Panneau latéral (curseurs par défaut, engrenage ou trois points).

## Fond d'écran, transparence et flou du panneau
Réglages > Style > Fond d'écran : couleur unie, image de ton ordinateur, dossier d'images (au hasard), ou une source dans l'esprit télé —
affiches de ta médiathèque Jellyfin, films et séries du moment (TMDB, clé requise), photo du jour Bing, images de l'espace (NASA APOD),
Wallhaven (cinéma, paysages, espace, villes la nuit, nature ; contenu tout public uniquement). Changement à chaque démarrage ou toutes les
10 min à 6 h, assombrissement réglable pour garder l'interface lisible. Les sources en ligne demandent une connexion internet.
Réglages > Style > Transparence et flou du panneau : transparence de 0 à 70 % (réglage fin par 5 %) et flou de 0 à 40 px derrière le panneau.
En choisissant une source de fond d'écran, la transparence passe automatiquement à 30 % et le flou à 12 px (modifiables).
