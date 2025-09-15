#!/bin/bash

# Build Local Docker Images for MeetingBot
# ========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists docker; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Build server image
build_server_image() {
    print_status "Building server Docker image..."
    
    cd src/server
    
    # Build with local tag
    docker build -t meetingbot-server:local \
        --build-arg SKIP_ENV_VALIDATION=1 \
        --progress=plain \
        .
    
    cd ../..
    
    print_success "Server image built: meetingbot-server:local"
}

# Build bot images (Meet bot only for initial testing)
build_bot_images() {
    print_status "Building Meet bot image..."
    
    cd src/bots
    
    # Build Meet bot (from bots directory using meet/Dockerfile)
    print_status "Building Meet bot image..."
    docker build -f meet/Dockerfile -t meetingbot-meet-bot:local \
        --progress=plain \
        .
    
    cd ../..
    
    print_success "Meet bot image built successfully"
    print_status "Skipping Teams and Zoom bots for initial testing"
}

# List built images
list_images() {
    print_status "Listing built images..."
    echo
    docker images | grep -E "(meetingbot|REPOSITORY)" | head -10
    echo
}

# Verify images
verify_images() {
    print_status "Verifying built images..."
    
    required_images=(
        "meetingbot-server:local"
        "meetingbot-meet-bot:local"
    )
    
    for image in "${required_images[@]}"; do
        if docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "^$image$"; then
            print_success "✓ $image"
        else
            print_error "✗ $image - NOT FOUND"
        fi
    done
}

# Main execution
main() {
    echo "🏗️  Building MeetingBot Docker Images Locally"
    echo "=============================================="
    echo
    
    check_prerequisites
    echo
    
    # Build server image
    build_server_image
    echo
    
    # Build bot images
    build_bot_images
    echo
    
    # List and verify images
    list_images
    verify_images
    
    echo
    print_success "🎉 All images built successfully!"
    echo
    print_status "Next steps:"
    echo "  1. Run: ./scripts/setup-local-env.sh"
    echo "  2. Or deploy manually: kubectl apply -k k8s/overlays/local"
    echo
}

# Run main function
main "$@"
