#!/bin/sh
set -eu

version=1.12.2
sha256=5e0edbff61314f41af3c72c21ec006b363cf12047cc9cfb5bbd63a98bca3721c
url="https://github.com/mapeditor/tiled/releases/download/v${version}/Tiled-${version}_Linux_x86_64.AppImage"
install_dir=${TILED_INSTALL_DIR:-"$HOME/.local/opt/tiled/$version"}
binary="$install_dir/bin/tiled"

if [ "$(uname -m)" != x86_64 ]; then
  echo "Tiled ${version}'s pinned AppImage is x86_64-only; run parity tooling on x86_64 Linux" >&2
  exit 1
fi

if [ ! -x "$binary" ]; then
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM
  mkdir -p "$install_dir"
  curl -fL "$url" -o "$temp_dir/tiled.AppImage"
  printf '%s  %s\n' "$sha256" "$temp_dir/tiled.AppImage" | sha256sum --check
  chmod +x "$temp_dir/tiled.AppImage"
  (cd "$temp_dir" && "$temp_dir/tiled.AppImage" --appimage-extract)
  mv "$temp_dir/squashfs-root" "$install_dir/root"
fi

mkdir -p "$install_dir/bin"
printf '%s\n' \
  '#!/bin/sh' \
  'if [ -n "${DISPLAY:-}" ]; then' \
  "  exec \"$install_dir/root/AppRun\" \"\$@\"" \
  'fi' \
  "exec xvfb-run -a \"$install_dir/root/AppRun\" \"\$@\"" > "$binary"
chmod +x "$binary"

"$binary" --version | grep -F "$version"
