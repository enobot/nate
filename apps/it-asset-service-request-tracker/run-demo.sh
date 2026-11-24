#!/usr/bin/env bash
# One-command local demo for macOS, Linux or Git Bash on Windows:
#   ./run-demo.sh
# Builds the React client into the API's wwwroot folder, then starts the API on http://localhost:5201.
# Press Ctrl+C to stop the server.
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing client packages (npm ci)..."
(cd client && npm ci)

echo "Building the React client..."
(cd client && npm run build)

echo "Starting the app at http://localhost:5201 (Ctrl+C to stop)..."
dotnet run --project src/ItAssetTracker.Api
