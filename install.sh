#!/bin/sh
set -eu

REPO="d0whc3r/node-gdrive"
BIN_NAME="node-gdrive"
VERSION="${VERSION:-latest}"

log() {
  printf '[%s] %s\n' "$BIN_NAME" "$1"
}

fail() {
  printf '[%s] Error: %s\n' "$BIN_NAME" "$1" >&2
  exit 1
}

detect_os() {
  os="$(uname -s)"
  case "$os" in
    Linux)  printf 'linux' ;;
    Darwin) printf 'macos' ;;
    *)      fail "Unsupported OS: $os. Use npm (npm install -g @d0whc3r/node-gdrive) or Docker (d0whc3r/gdrive)." ;;
  esac
}

detect_arch() {
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)  printf 'x64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *)             fail "Unsupported architecture: $arch. Use npm (npm install -g @d0whc3r/node-gdrive) or Docker (d0whc3r/gdrive)." ;;
  esac
}

resolve_asset() {
  target="${1}-${2}"
  case "$target" in
    linux-x64)   printf '%s-linux-x64' "$BIN_NAME" ;;
    macos-arm64) printf '%s-macos-arm64' "$BIN_NAME" ;;
    *)           fail "No prebuilt binary for ${target}. Available: linux-x64, macos-arm64, win-x64. Use npm (npm install -g @d0whc3r/node-gdrive) or Docker (d0whc3r/gdrive)." ;;
  esac
}

resolve_install_dir() {
  if [ -n "${INSTALL_DIR:-}" ]; then
    printf '%s' "$INSTALL_DIR"
    return
  fi
  if [ -w "/usr/local/bin" ]; then
    printf '/usr/local/bin'
  else
    printf '%s/.local/bin' "$HOME"
  fi
}

download_file() {
  url="$1"
  dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --retry-delay 1 "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    fail "Neither curl nor wget is installed."
  fi
}

main() {
  os="$(detect_os)"
  arch="$(detect_arch)"
  asset="$(resolve_asset "$os" "$arch")"
  install_dir="$(resolve_install_dir)"

  if [ "$VERSION" = "latest" ]; then
    download_url="https://github.com/${REPO}/releases/latest/download/${asset}"
  else
    case "$VERSION" in
      v*) tag="$VERSION" ;;
      *)  tag="v${VERSION}" ;;
    esac
    download_url="https://github.com/${REPO}/releases/download/${tag}/${asset}"
  fi

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT INT TERM
  tmp_bin="${tmp_dir}/${BIN_NAME}"

  log "Downloading ${asset} (${VERSION})..."
  download_file "$download_url" "$tmp_bin" || fail "Failed to download ${download_url}"
  chmod 0755 "$tmp_bin"

  mkdir -p "$install_dir"
  dest="${install_dir}/${BIN_NAME}"
  mv -f "$tmp_bin" "$dest"

  installed_version="$("$dest" --version 2>/dev/null || printf 'unknown')"
  log "Installed ${BIN_NAME} v${installed_version} to ${dest}"

  case ":${PATH}:" in
    *":${install_dir}:"*) ;;
    *)
      log "Note: ${install_dir} is not in your PATH. Add it with:"
      printf '  export PATH="%s:$PATH"\n' "$install_dir"
      ;;
  esac
}

main "$@"
