#!/bin/bash
set -e

#=============================================================================
# Configuration - modify these to match your environment
#=============================================================================
IMAGE_NAME="free-cert-issuer"
IMAGE_TAG="latest"
CONTAINER_NAME="free-cert-issuer"
CONTAINER_PORT="3000"
HOST_PORT="3000"

# Remote server SSH config
REMOTE_HOST="${DEPLOY_HOST:-your-server.com}"
REMOTE_USER="${DEPLOY_USER:-root}"
REMOTE_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
SSH_KEY="${DEPLOY_SSH_KEY:-}"  # e.g. ~/.ssh/id_rsa, leave empty to use default

# Local image archive path
ARCHIVE_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"
ARCHIVE_FILE="${ARCHIVE_DIR}/${IMAGE_NAME}-${IMAGE_TAG}.tar.gz"

#=============================================================================
# Helper functions
#=============================================================================
info() { echo -e "\033[1;34m[INFO]\033[0m $*"; }
success() { echo -e "\033[1;32m[OK]\033[0m $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; exit 1; }

ssh_cmd() {
  local ssh_opts="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${REMOTE_SSH_PORT}"
  if [ -n "$SSH_KEY" ]; then
    ssh_opts="$ssh_opts -i $SSH_KEY"
  fi
  ssh $ssh_opts "${REMOTE_USER}@${REMOTE_HOST}" "$@"
}

scp_cmd() {
  local scp_opts="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -P ${REMOTE_SSH_PORT}"
  if [ -n "$SSH_KEY" ]; then
    scp_opts="$scp_opts -i $SSH_KEY"
  fi
  scp $scp_opts "$@"
}

#=============================================================================
# Pre-flight checks
#=============================================================================
if [ "$REMOTE_HOST" = "your-server.com" ]; then
  echo ""
  echo "Usage: DEPLOY_HOST=<ip> DEPLOY_USER=<user> $0"
  echo ""
  echo "Environment variables:"
  echo "  DEPLOY_HOST      - Remote server hostname/IP (required)"
  echo "  DEPLOY_USER      - SSH user (default: root)"
  echo "  DEPLOY_SSH_PORT  - SSH port (default: 22)"
  echo "  DEPLOY_SSH_KEY   - Path to SSH private key (optional)"
  echo ""
  echo "Example:"
  echo "  DEPLOY_HOST=192.168.1.100 DEPLOY_USER=ubuntu DEPLOY_SSH_KEY=~/.ssh/id_rsa $0"
  echo ""
  error "DEPLOY_HOST is not set"
fi

command -v docker >/dev/null 2>&1 || error "docker is not installed"

#=============================================================================
# Step 1: Build Docker image
#=============================================================================
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

info "Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}"
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" "$PROJECT_ROOT"
success "Image built successfully"

#=============================================================================
# Step 2: Save image to local archive
#=============================================================================
mkdir -p "$ARCHIVE_DIR"

info "Saving image to ${ARCHIVE_FILE}"
docker save "${IMAGE_NAME}:${IMAGE_TAG}" | gzip > "$ARCHIVE_FILE"
ARCHIVE_SIZE=$(du -h "$ARCHIVE_FILE" | cut -f1)
success "Image saved (${ARCHIVE_SIZE})"

#=============================================================================
# Step 3: Transfer to remote server
#=============================================================================
info "Transferring image to ${REMOTE_USER}@${REMOTE_HOST}..."
scp_cmd "$ARCHIVE_FILE" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/${IMAGE_NAME}-${IMAGE_TAG}.tar.gz"
success "Transfer complete"

#=============================================================================
# Step 4: Load image and deploy on remote server
#=============================================================================
info "Deploying on remote server..."

ssh_cmd bash -s <<EOF
set -e

echo "Loading Docker image..."
docker load < /tmp/${IMAGE_NAME}-${IMAGE_TAG}.tar.gz

echo "Stopping existing container (if any)..."
docker stop ${CONTAINER_NAME} 2>/dev/null || true
docker rm ${CONTAINER_NAME} 2>/dev/null || true

echo "Starting new container..."
docker run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  -p ${HOST_PORT}:${CONTAINER_PORT} \
  ${IMAGE_NAME}:${IMAGE_TAG}

echo "Cleaning up archive..."
rm -f /tmp/${IMAGE_NAME}-${IMAGE_TAG}.tar.gz

echo "Pruning old images..."
docker image prune -f

echo "Container status:"
docker ps --filter name=${CONTAINER_NAME} --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

success "Deployment complete!"
echo ""
info "Application is running at http://${REMOTE_HOST}:${HOST_PORT}"
