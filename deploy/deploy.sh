#!/usr/bin/env bash
set -euo pipefail

# Deployment is environment-driven. Never commit real hosts or credentials.
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:?Set REMOTE_HOST, for example: REMOTE_HOST=203.0.113.10 ./deploy/deploy.sh}"
REMOTE_PORT="${REMOTE_PORT:-22}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa}"
REMOTE_PROJECT_DIR="${REMOTE_PROJECT_DIR:-apps}"
LOCAL_PROJECT_DIR="${LOCAL_PROJECT_DIR:-./}"

rsync -avz \
  --exclude='build' \
  --exclude='node_modules' \
  --exclude='.vagrant' \
  --exclude='.git' \
  --exclude='.idea' \
  --exclude='.env' \
  -e "ssh -i ${SSH_KEY_PATH} -p ${REMOTE_PORT}" \
  "${LOCAL_PROJECT_DIR}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PROJECT_DIR}"

# Optional remote build/restart:
# ssh -i "${SSH_KEY_PATH}" -p "${REMOTE_PORT}" "${REMOTE_USER}@${REMOTE_HOST}" \
#   "cd ${REMOTE_PROJECT_DIR} && bun install --frozen-lockfile && bun run build && pm2 restart all"
