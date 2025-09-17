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
    
    # Generate timestamp-based tag
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    SERVER_TAG="local-${TIMESTAMP}"
    
    print_status "Building with tag: meetingbot-server:${SERVER_TAG}"
    
    # Build with timestamp tag
    docker build -t "meetingbot-server:${SERVER_TAG}" \
        --build-arg SKIP_ENV_VALIDATION=1 \
        --progress=plain \
        .
    
    # Also tag as latest for convenience
    docker tag "meetingbot-server:${SERVER_TAG}" "meetingbot-server:local"
    
    cd ../..
    
    print_success "Server image built: meetingbot-server:${SERVER_TAG}"
    print_success "Also tagged as: meetingbot-server:local"
    
    # Store the tag for later use
    export SERVER_IMAGE_TAG="${SERVER_TAG}"
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

# Update kustomization files with new image tag
update_kustomization() {
    print_status "Updating kustomization files with new image tag..."
    
    if [ -z "$SERVER_IMAGE_TAG" ]; then
        print_error "SERVER_IMAGE_TAG not set, cannot update kustomization"
        return 1
    fi
    
    local kustomization_file="k8s/overlays/local-simple/kustomization.yaml"
    local deployment_file="k8s/overlays/local-simple/deployment.yaml"
    
    # Update kustomization.yaml
    if [ -f "$kustomization_file" ]; then
        print_status "Updating $kustomization_file..."
        
        # Use sed to update the newTag field (only the tag part, not the full image name)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS sed
            sed -i '' "s|newTag: .*|newTag: ${SERVER_IMAGE_TAG}|g" "$kustomization_file"
        else
            # Linux sed
            sed -i "s|newTag: .*|newTag: ${SERVER_IMAGE_TAG}|g" "$kustomization_file"
        fi
        
        print_success "Updated kustomization.yaml with tag: ${SERVER_IMAGE_TAG}"
    else
        print_warning "Kustomization file not found: $kustomization_file"
    fi
    
    # Update deployment.yaml image references
    if [ -f "$deployment_file" ]; then
        print_status "Updating $deployment_file..."
        
        # Update both init container and main container image references
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS sed - update any existing meetingbot-server image references
            sed -i '' "s|image: ghcr.io/xxell-ai/meetingbot-server:.*|image: meetingbot-server:${SERVER_IMAGE_TAG}|g" "$deployment_file"
            sed -i '' "s|image: meetingbot-server:.*|image: meetingbot-server:${SERVER_IMAGE_TAG}|g" "$deployment_file"
            # Ensure imagePullPolicy is set to Never for local images (add if not exists after image lines)
            sed -i '' '/image: meetingbot-server:/{ N; /imagePullPolicy:/!s/$/\
          imagePullPolicy: Never/; }' "$deployment_file"
        else
            # Linux sed - update any existing meetingbot-server image references
            sed -i "s|image: ghcr.io/xxell-ai/meetingbot-server:.*|image: meetingbot-server:${SERVER_IMAGE_TAG}|g" "$deployment_file"
            sed -i "s|image: meetingbot-server:.*|image: meetingbot-server:${SERVER_IMAGE_TAG}|g" "$deployment_file"
            # Ensure imagePullPolicy is set to Never for local images (add if not exists after image lines)
            sed -i '/image: meetingbot-server:/{ N; /imagePullPolicy:/!s/$/\n          imagePullPolicy: Never/; }' "$deployment_file"
        fi
        
        print_success "Updated deployment.yaml with tag: meetingbot-server:${SERVER_IMAGE_TAG}"
    else
        print_warning "Deployment file not found: $deployment_file"
    fi
}

# Verify images
verify_images() {
    print_status "Verifying built images..."
    
    required_images=(
        "meetingbot-server:local"
        "meetingbot-server:${SERVER_IMAGE_TAG}"
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
    
    # Update kustomization files
    update_kustomization
    echo
    
    # List and verify images
    list_images
    verify_images
    
    echo
    print_success "🎉 All images built successfully!"
    print_success "📝 Kustomization files updated with new image tags"
    echo
    print_status "Next steps:"
    echo "  1. Run: ./scripts/setup-local-env.sh"
    echo "  2. Or deploy manually: kubectl apply -k k8s/overlays/local-simple"
    echo "  3. Image tag used: meetingbot-server:${SERVER_IMAGE_TAG}"
    echo
}

# Run main function
main "$@"
