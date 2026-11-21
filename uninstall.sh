#!/usr/bin/env bash
# Retire les raccourcis et le démarrage automatique de Salon (la configuration est conservée).
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
AUTO="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
rm -f "$APPS/salon.desktop" "$AUTO/salon.desktop"
[ -f /usr/share/wayland-sessions/salon.desktop ] && echo "Session plein écran : supprime /usr/share/wayland-sessions/salon.desktop avec sudo."
echo "Raccourcis supprimés. Configuration conservée dans ~/.config/salon-launcher (à supprimer à la main si besoin)."
