#!/bin/bash
# ═══════════════════════════════════════════════════════════
# MIMIR — Start Script
# Starts Mimir with the local data directory
# ═══════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"

echo "🐦 Starting Mimir..."
echo "   Data: ${DATA_DIR}"
echo ""

node "${SCRIPT_DIR}/dist/index.js" "${DATA_DIR}"
