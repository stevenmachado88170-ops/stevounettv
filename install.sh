#!/usr/bin/env bash
# Salon – installation universelle (Debian/Ubuntu, Fedora/RHEL, Arch, openSUSE, Void, Gentoo, Alpine, NixOS…)
# Usage : ./install.sh [--session] [--no-deps]
#   --session  crée aussi une session plein écran « Salon » (cage) dans le gestionnaire de connexion
#   --no-deps  n'installe pas les paquets système (Node.js, playerctl…)
# SALON_DRY_RUN=1 : affiche les commandes sans les exécuter.
set -u
cd "$(dirname "$0")" || exit 1
DIR="$PWD"
DRY="${SALON_DRY_RUN:-0}"
NODEPS=0; SESSION=0
for a in "$@"; do case "$a" in --no-deps) NODEPS=1;; --session) SESSION=1;; esac; done

say(){ printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
run(){ if [ "$DRY" = 1 ]; then echo "[simulation] $*"; else "$@"; fi }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; elif command -v doas >/dev/null 2>&1; then SUDO="doas"; fi
fi

detect_pm(){
  if [ -n "${SALON_PM:-}" ]; then echo "$SALON_PM"; return; fi
  for pm in apt-get dnf yum pacman zypper apk xbps-install emerge nix-env; do
    if command -v "$pm" >/dev/null 2>&1; then echo "$pm"; return; fi
  done
  echo none
}
PM="$(detect_pm)"

inst(){
  case "$PM" in
    apt-get)       run $SUDO apt-get install -y "$@" ;;
    dnf|yum)       run $SUDO "$PM" install -y "$@" ;;
    pacman)        run $SUDO pacman -S --needed --noconfirm "$@" ;;
    zypper)        run $SUDO zypper --non-interactive install "$@" ;;
    apk)           run $SUDO apk add "$@" ;;
    xbps-install)  run $SUDO xbps-install -Sy "$@" ;;
    emerge)        run $SUDO emerge --noreplace "$@" ;;
    *)             return 1 ;;
  esac
}
# Installe tout d'un coup ; si un paquet manque dans cette distribution, réessaie un par un sans bloquer.
inst_all(){
  inst "$@" && return 0
  for p in "$@"; do inst "$p" || warn "paquet « $p » non installé (peut s'appeler autrement sur cette distribution)"; done
}

install_deps(){
  say "Gestionnaire de paquets détecté : $PM"
  case "$PM" in
    apt-get)
      run $SUDO apt-get update
      inst_all nodejs npm playerctl xdg-utils libnss3 libxss1 libgbm1 libgtk-3-0
      inst libasound2t64 2>/dev/null || inst libasound2 || warn "paquet audio (libasound2) non installé" ;;
    dnf|yum)  inst_all nodejs npm playerctl xdg-utils gtk3 nss alsa-lib libXScrnSaver mesa-libgbm ;;
    pacman)   inst_all nodejs npm playerctl xdg-utils gtk3 nss alsa-lib libxss ;;
    zypper)   inst_all nodejs npm playerctl xdg-utils gtk3 mozilla-nss alsa libXss1 ;;
    apk)
      warn "Alpine (musl) : Electron demande glibc ; gcompat est installé, sinon utilise l'AppImage."
      inst_all nodejs npm playerctl xdg-utils gtk+3.0 nss alsa-lib libxscrnsaver mesa-gbm gcompat ;;
    xbps-install) inst_all nodejs playerctl xdg-utils gtk+3 nss alsa-lib libXScrnSaver mesa ;;
    emerge)   inst_all net-libs/nodejs media-sound/playerctl x11-misc/xdg-utils x11-libs/gtk+ dev-libs/nss media-libs/alsa-lib x11-libs/libXScrnSaver ;;
    *)
      warn "Gestionnaire de paquets non géré (NixOS, Guix…) : installe à la main Node.js 18+, npm et playerctl (facultatif)."
      warn "NixOS : nix-shell -p nodejs playerctl --run ./install.sh --no-deps" ;;
  esac
}

node_ok(){
  command -v node >/dev/null 2>&1 || return 1
  [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]
}
# Si Node.js est absent ou trop ancien (Debian 11, Ubuntu 20.04…), télécharge la version officielle dans ~/.local/share/salon-node
get_node(){
  local arch A V T dest
  arch="$(uname -m)"
  case "$arch" in x86_64) A=x64;; aarch64|arm64) A=arm64;; armv7l) A=armv7l;; *) warn "architecture $arch non gérée pour Node.js"; return 1;; esac
  V="v20.18.1"; T="node-$V-linux-$A"; dest="$HOME/.local/share/salon-node"
  say "Téléchargement de Node.js $V ($A)"
  if [ "$DRY" = 1 ]; then echo "[simulation] téléchargement https://nodejs.org/dist/$V/$T.tar.xz vers $dest"; return 0; fi
  mkdir -p "$dest" || return 1
  if command -v curl >/dev/null 2>&1; then curl -fsSL "https://nodejs.org/dist/$V/$T.tar.xz" | tar -xJ -C "$dest" --strip-components=1
  elif command -v wget >/dev/null 2>&1; then wget -qO- "https://nodejs.org/dist/$V/$T.tar.xz" | tar -xJ -C "$dest" --strip-components=1
  else warn "ni curl ni wget : impossible de télécharger Node.js"; return 1; fi
  export PATH="$dest/bin:$PATH"
}

[ "$NODEPS" = 1 ] || install_deps
if [ "$DRY" != 1 ] && ! node_ok; then
  warn "Node.js 18 ou plus est requis."
  get_node || { warn "Installe Node.js 18+ puis relance ce script."; exit 1; }
fi
[ "$DRY" = 1 ] && ! node_ok && get_node

say "Installation des dépendances de Salon (Electron)"
run npm install --no-audit --no-fund || { warn "npm install a échoué (réseau ? architecture non supportée ?)"; exit 1; }
chmod +x "$DIR/run.sh" 2>/dev/null

say "Raccourcis"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
AUTO="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
if [ "$DRY" = 1 ]; then
  echo "[simulation] écriture de $APPS/salon.desktop et $AUTO/salon.desktop (Exec=$DIR/run.sh)"
else
  mkdir -p "$APPS" "$AUTO"
  cat > "$APPS/salon.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Salon
Comment=Launcher TV
Exec=$DIR/run.sh
Path=$DIR
Icon=applications-multimedia
Categories=AudioVideo;Video;
Terminal=false
DESK
  cp "$APPS/salon.desktop" "$AUTO/salon.desktop"
fi

# Musique d'un téléphone connecté en Bluetooth : BlueZ expose le lecteur du téléphone via mpris-proxy
if command -v mpris-proxy >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1; then
  say "Musique du téléphone (Bluetooth) : activation du service mpris-proxy"
  run systemctl --user enable --now mpris-proxy.service || warn "mpris-proxy non activé (BlueZ ou systemd utilisateur indisponible)"
fi

if [ "$SESSION" = 1 ]; then
  say "Session plein écran « Salon » (cage)"
  case "$PM" in
    apt-get|dnf|yum|pacman|zypper|apk|xbps-install|emerge) inst cage || warn "cage non installé : installe-le puis relance avec --session" ;;
  esac
  if [ "$DRY" = 1 ]; then echo "[simulation] écriture de /usr/share/wayland-sessions/salon.desktop"
  else
    printf '[Desktop Entry]\nName=Salon (plein écran)\nComment=Launcher TV en session dédiée\nExec=cage -s -- %s/run.sh\nType=Application\n' "$DIR" | $SUDO tee /usr/share/wayland-sessions/salon.desktop >/dev/null \
      || warn "impossible d'écrire /usr/share/wayland-sessions/salon.desktop"
  fi
fi

say "Terminé."
echo "  Lancer maintenant : $DIR/run.sh"
echo "  Démarrage automatique : activé pour les bureaux compatibles XDG (KDE, GNOME, Xfce, LXQt, Cinnamon, MATE…)."
echo "  i3 / sway / openbox / Hyprland… : ajoute « exec $DIR/run.sh » à ta configuration."
echo "  Réglages de Salon : ~/.config/salon-launcher/config.json (créé au premier lancement)."
