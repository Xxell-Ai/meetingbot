#!/bin/bash

# Deploy MeetingBot to local Kubernetes with PostgreSQL
# ====================================================

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
    
    if ! command_exists kubectl; then
        print_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    if ! kubectl cluster-info >/dev/null 2>&1; then
        print_error "kubectl cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Deploy to Kubernetes
deploy_to_kubernetes() {
    print_status "Deploying MeetingBot with PostgreSQL to local Kubernetes..."
    
    # Apply the simplified Kustomize configuration
    kubectl apply -k k8s/overlays/local-simple
    
    print_success "Deployed to Kubernetes"
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    print_status "Waiting for PostgreSQL to be ready..."
    
    kubectl wait --for=condition=available --timeout=300s deployment/postgres -n meetingbot-local
    
    print_success "PostgreSQL is ready!"
}

# Wait for server to be ready
wait_for_server() {
    print_status "Waiting for MeetingBot server to be ready..."
    
    kubectl wait --for=condition=available --timeout=300s deployment/meetingbot-server -n meetingbot-local
    
    print_success "MeetingBot server is ready!"
}

# Show deployment status
show_status() {
    print_status "Deployment status:"
    echo
    
    echo "📦 Pods:"
    kubectl get pods -n meetingbot-local
    echo
    
    echo "🔧 Services:"
    kubectl get services -n meetingbot-local
    echo
    
    echo "💾 PersistentVolumeClaims:"
    kubectl get pvc -n meetingbot-local
    echo
    
    print_status "Database connection string:"
    echo "postgresql://postgres:password@postgres:5432/meetingbot_local"
    echo
}

# Setup port forwarding
setup_port_forward() {
    print_status "Setting up port forwarding..."
    echo
    
    print_status "To access the MeetingBot server:"
    echo "kubectl port-forward -n meetingbot-local service/meetingbot-server 3000:3000"
    echo "Then open: http://localhost:3000"
    echo
    
    print_status "To access PostgreSQL directly:"
    echo "kubectl port-forward -n meetingbot-local service/postgres 5432:5432"
    echo "Then connect: postgresql://postgres:password@localhost:5432/meetingbot_local"
    echo
}

# Main execution
main() {
    echo "🚀 Deploying MeetingBot with PostgreSQL to Local Kubernetes"
    echo "==========================================================="
    echo
    
    check_prerequisites
    echo
    
    deploy_to_kubernetes
    echo
    
    wait_for_postgres
    echo
    
    wait_for_server
    echo
    
    show_status
    setup_port_forward
    
    echo
    print_success "🎉 MeetingBot deployed successfully with local PostgreSQL!"
    echo
    print_status "Next steps:"
    echo "  1. Run port-forward: kubectl port-forward -n meetingbot-local service/meetingbot-server 3000:3000"
    echo "  2. Open browser: http://localhost:3000"
    echo "  3. Create and test bots!"
    echo
}

# Run main function
main "$@"
