#!/bin/bash

# Local Environment Setup Script for MeetingBot
# This script sets up the local development environment with Docker Desktop Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if Docker Desktop is running
check_docker_desktop() {
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker Desktop is not running. Please start Docker Desktop."
        exit 1
    fi
    
    print_success "Docker Desktop is running"
}

# Function to check if Kubernetes is enabled in Docker Desktop
check_kubernetes() {
    if ! command_exists kubectl; then
        print_error "kubectl is not installed. Please install kubectl or enable Kubernetes in Docker Desktop."
        exit 1
    fi
    
    if ! kubectl cluster-info >/dev/null 2>&1; then
        print_error "Kubernetes cluster is not accessible. Please enable Kubernetes in Docker Desktop."
        exit 1
    fi
    
    print_success "Kubernetes cluster is accessible"
}

# Function to create local environment file
create_env_file() {
    print_status "Creating local environment file..."
    
    cat > .env.local << EOF
# Local Development Environment Configuration
# Copy this to .env and update with your actual values

# Database Configuration (Local PostgreSQL)
DATABASE_URL="postgresql://postgres:password@localhost:5432/meetingbot_local"

# DigitalOcean Spaces Configuration (Your actual credentials)
AWS_ACCESS_KEY_ID="DO801WY9MPLE6RJQMZJM"
AWS_SECRET_ACCESS_KEY="4VZXoXWOdSR9wTS2xQ0YS5cciidXpdSDfFGLzQJz/D4"
DO_SPACES_BUCKET="xxellbackup"
DO_SPACES_REGION="sgp1"
DO_SPACES_ENDPOINT="https://sgp1.digitaloceanspaces.com"

# Application Configuration
NODE_ENV="development"
DEPLOYMENT_PLATFORM="KUBERNETES"
KUBE_NAMESPACE="meetingbot-local"
DOMAIN_NAME="localhost:3000"
USE_EXTERNAL_SYSTEM_UPLOAD="false"

# NextAuth Configuration (Local Development)
AUTH_SECRET="local-test-secret-for-development-only"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth (You need to create a GitHub OAuth app)
# Visit: https://github.com/settings/applications/new
AUTH_GITHUB_ID="your-github-client-id-for-local-testing"
AUTH_GITHUB_SECRET="your-github-client-secret-for-local-testing"
GITHUB_TOKEN="your-github-token-for-local-testing"

# Bot Configuration
BOT_HEARTBEAT_INTERVAL="5000"
EOF

    print_success "Created .env.local file"
    print_warning "Please update .env.local with your actual GitHub OAuth credentials"
}

# Function to setup local database
setup_database() {
    print_status "Setting up local PostgreSQL database..."
    
    if ! command_exists psql; then
        print_warning "PostgreSQL client not found. Installing via Docker..."
        
        # Check if PostgreSQL container is already running
        if docker ps --format "table {{.Names}}" | grep -q "meetingbot-postgres"; then
            print_success "PostgreSQL container is already running"
        else
            print_status "Starting PostgreSQL container..."
            docker run -d \
                --name meetingbot-postgres \
                -e POSTGRES_DB=meetingbot_local \
                -e POSTGRES_USER=postgres \
                -e POSTGRES_PASSWORD=password \
                -p 5432:5432 \
                postgres:15
            
            print_status "Waiting for PostgreSQL to start..."
            sleep 10
            print_success "PostgreSQL container started"
        fi
    else
        print_success "PostgreSQL client found"
    fi
}

# Function to build Docker images
build_images() {
    print_status "Building Docker images for local testing..."
    
    # Build server image
    print_status "Building server image..."
    cd src/server
    docker build -t meetingbot-server:local .
    cd ../..
    
    # Build bot images
    print_status "Building bot images..."
    cd src/bots
    
    # Build meet bot
    cd meet
    docker build -t meetingbot-bot-meet:local .
    cd ..
    
    # Build teams bot
    cd teams
    docker build -t meetingbot-bot-teams:local .
    cd ..
    
    # Build zoom bot
    cd zoom
    docker build -t meetingbot-bot-zoom:local .
    cd ../..
    
    print_success "All Docker images built successfully"
}

# Function to deploy to Kubernetes using Kustomize
deploy_to_kubernetes() {
    print_status "Deploying to local Kubernetes using Kustomize..."
    
    # Use the fixed Kustomize overlay
    print_status "Applying Kustomize overlay for local environment"
    kubectl apply -k k8s/overlays/local
    
    print_success "Deployed to Kubernetes using Kustomize"
    
    # Wait for deployment to be ready
    print_status "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/meetingbot-server -n meetingbot-local
    
    print_success "Deployment is ready!"
}

# Function to setup port forwarding
setup_port_forward() {
    print_status "Setting up port forwarding..."
    
    # Kill any existing port forward
    pkill -f "kubectl.*port-forward.*meetingbot-server" || true
    
    # Start port forwarding in background
    kubectl port-forward -n meetingbot-local service/meetingbot-server 3000:3000 &
    
    print_success "Port forwarding setup complete"
    print_status "Application will be available at: http://localhost:3000"
}

# Function to show status
show_status() {
    print_status "Checking deployment status..."
    
    echo ""
    echo "=== Kubernetes Resources ==="
    kubectl get all -n meetingbot-local
    
    echo ""
    echo "=== Application Logs ==="
    kubectl logs -n meetingbot-local deployment/meetingbot-server --tail=10
    
    echo ""
    echo "=== Access Information ==="
    print_success "Application URL: http://localhost:3000"
    print_success "Kubernetes Dashboard: kubectl proxy"
    print_success "View logs: kubectl logs -n meetingbot-local deployment/meetingbot-server -f"
}

# Main execution
main() {
    echo "🚀 MeetingBot Local Environment Setup"
    echo "====================================="
    
    # Pre-flight checks
    print_status "Running pre-flight checks..."
    check_docker_desktop
    check_kubernetes
    
    # Setup steps
    create_env_file
    setup_database
    build_images
    deploy_to_kubernetes
    setup_port_forward
    
    # Show final status
    sleep 5
    show_status
    
    echo ""
    print_success "🎉 Local environment setup complete!"
    echo ""
    print_status "Next steps:"
    echo "1. Update .env.local with your GitHub OAuth credentials"
    echo "2. Visit http://localhost:3000 to access the application"
    echo "3. Test bot deployment functionality"
    echo ""
    print_status "Useful commands:"
    echo "  kubectl get pods -n meetingbot-local"
    echo "  kubectl logs -n meetingbot-local deployment/meetingbot-server -f"
    echo "  kubectl delete namespace meetingbot-local  # To clean up"
}

# Handle script arguments
case "${1:-}" in
    "clean")
        print_status "Cleaning up local environment..."
        kubectl delete namespace meetingbot-local --ignore-not-found=true
        docker rm -f meetingbot-postgres || true
        pkill -f "kubectl.*port-forward.*meetingbot-server" || true
        print_success "Cleanup complete"
        ;;
    "status")
        show_status
        ;;
    "logs")
        kubectl logs -n meetingbot-local deployment/meetingbot-server -f
        ;;
    *)
        main
        ;;
esac
