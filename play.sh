#!/bin/sh
# SOL 500 launcher for macOS and Linux: starts the LAN server and opens the game in your browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "SOL 500 needs Node.js to host games. Install it from https://nodejs.org and run this again."
  exit 1
fi
node server.js --open
