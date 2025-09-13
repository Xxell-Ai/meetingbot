#!/bin/bash

# MeetingBot Kubernetes Deployment Script
# This script deploys MeetingBot to a Kubernetes cluster

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="meetingbot"
K8S_DIR="$(dirname "$0")/../k8s"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if we can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_success "kubectl is available and connected to cluster"
}

# Check if required files exist
check_files() {
    local required_files=(
        "namespace.yaml"
        "configmap.yaml" 
        "secrets.yaml"
        "server-deployment.yaml"
        "ingress.yaml"
        "rbac.yaml"
        "bot-job-template.yaml"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$K8S_DIR/$file" ]]; then
            log_error "Required file not found: $K8S_DIR/$file"
            exit 1
        fi
    done
    
    log_success "All required Kubernetes files found"
}

# Deploy namespace and RBAC first
deploy_namespace() {
    log_info "Deploying namespace and RBAC..."
    kubectl apply -f "$K8S_DIR/namespace.yaml"
    kubectl apply -f "$K8S_DIR/rbac.yaml"
    log_success "Namespace and RBAC deployed"
}

# Deploy secrets and configmap
deploy_config() {
    log_info "Deploying configuration and secrets..."
    
    log_warning "Please ensure you have updated the secrets in $K8S_DIR/secrets.yaml with your actual base64-encoded values"
    read -p "Have you updated the secrets? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Please update the secrets before deploying"
        exit 1
    fi
    
    kubectl apply -f "$K8S_DIR/configmap.yaml"
    kubectl apply -f "$K8S_DIR/secrets.yaml"
    log_success "Configuration and secrets deployed"
}

# Check external database connection
check_database() {
    log_info "Checking external database configuration..."
    log_warning "Please ensure your external database is accessible and configured:"
    log_warning "1. Database is running and accessible from Kubernetes cluster"
    log_warning "2. DATABASE_URL in secrets.yaml points to your external database"
    log_warning "3. Database user has necessary permissions"
    log_warning "4. Database schema is initialized (run migrations if needed)"
    
    read -p "Is your external database ready? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Please configure your external database before deploying"
        exit 1
    fi
    log_success "External database configuration confirmed"
}

# Deploy server
deploy_server() {
    log_info "Deploying MeetingBot server..."
    
    log_warning "Please ensure you have built and pushed the server Docker image"
    log_info "Expected image: meetingbot/server:latest"
    read -p "Have you built and pushed the server image? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "Continuing anyway, but deployment may fail if image is not available"
    fi
    
    kubectl apply -f "$K8S_DIR/server-deployment.yaml"
    
    # Wait for server to be ready
    log_info "Waiting for server to be ready..."
    kubectl wait --for=condition=available deployment/meetingbot-server -n $NAMESPACE --timeout=300s
    log_success "Server deployed and ready"
}

# Deploy ingress
deploy_ingress() {
    log_info "Deploying ingress..."
    
    log_warning "Please ensure you have:"
    log_warning "1. An ingress controller installed (e.g., nginx-ingress)"
    log_warning "2. Updated the domain name in ingress.yaml"
    log_warning "3. Configured TLS certificates if needed"
    
    read -p "Deploy ingress? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl apply -f "$K8S_DIR/ingress.yaml"
        log_success "Ingress deployed"
    else
        log_info "Skipping ingress deployment"
    fi
}

# Show deployment status
show_status() {
    log_info "Deployment status:"
    echo
    kubectl get all -n $NAMESPACE
    echo
    log_info "To access the application:"
    log_info "1. Port forward: kubectl port-forward svc/meetingbot-server 3000:3000 -n $NAMESPACE"
    log_info "2. Then visit: http://localhost:3000"
    echo
    log_info "To view logs:"
    log_info "kubectl logs -f deployment/meetingbot-server -n $NAMESPACE"
}

# Main deployment function
main() {
    log_info "Starting MeetingBot Kubernetes deployment..."
    
    check_kubectl
    check_files
    
    # Deploy in order
    deploy_namespace
    sleep 2 # Give namespace time to be created
    
    deploy_config
    check_database
    deploy_server
    deploy_ingress
    
    show_status
    
    log_success "MeetingBot deployment completed!"
}

# Handle script arguments
case "${1:-}" in
    "clean")
        log_info "Cleaning up MeetingBot deployment..."
        kubectl delete namespace $NAMESPACE --ignore-not-found=true
        log_success "Cleanup completed"
        ;;
    "status")
        show_status
        ;;
    "logs")
        kubectl logs -f deployment/meetingbot-server -n $NAMESPACE
        ;;
    *)
        main
        ;;
esac
