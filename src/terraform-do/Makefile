# Multi-Environment Terraform Makefile
# Usage: make <command> ENV=<environment>
# Environments: dev, staging, prod

# Default environment
ENV ?= dev

# Validate environment
VALID_ENVS := dev staging prod
ifeq ($(filter $(ENV),$(VALID_ENVS)),)
$(error Invalid environment: $(ENV). Valid options: $(VALID_ENVS))
endif

# Environment directory
ENV_DIR := environments/$(ENV)

# Check if environment directory exists
ifeq ($(wildcard $(ENV_DIR)),)
$(error Environment directory $(ENV_DIR) does not exist)
endif

.PHONY: help init plan apply destroy output fmt validate clean setup-backend get-kubeconfig install-nginx-ingress install-cert-manager

# Default target
help:
	@echo "Multi-Environment Terraform Management"
	@echo ""
	@echo "Usage: make <command> ENV=<environment>"
	@echo ""
	@echo "Environments:"
	@echo "  dev      - Development environment (minimal resources)"
	@echo "  staging  - Staging environment (moderate resources)"  
	@echo "  prod     - Production environment (high resources)"
	@echo ""
	@echo "Commands:"
	@echo "  init                 - Initialize Terraform for the environment"
	@echo "  plan                 - Plan infrastructure changes"
	@echo "  apply                - Apply infrastructure changes"
	@echo "  destroy              - Destroy infrastructure"
	@echo "  output               - Show Terraform outputs"
	@echo "  fmt                  - Format Terraform files"
	@echo "  validate             - Validate Terraform configuration"
	@echo "  clean                - Clean Terraform cache and lock files"
	@echo "  setup-backend        - Setup remote backend configuration"
	@echo ""
	@echo "Kubernetes Commands:"
	@echo "  get-kubeconfig       - Get kubeconfig for kubectl access"
	@echo "  install-nginx-ingress - Install NGINX Ingress Controller"
	@echo "  install-cert-manager  - Install cert-manager for Let's Encrypt"
	@echo ""
	@echo "Examples:"
	@echo "  make plan ENV=dev"
	@echo "  make apply ENV=staging"
	@echo "  make destroy ENV=prod"

# Initialize Terraform
init:
	@echo "🚀 Initializing Terraform for $(ENV) environment..."
	cd $(ENV_DIR) && terraform init

# Plan the infrastructure
plan:
	@echo "📋 Planning infrastructure for $(ENV) environment..."
	cd $(ENV_DIR) && terraform plan

# Apply the infrastructure
apply:
	@echo "🏗️  Applying infrastructure for $(ENV) environment..."
	cd $(ENV_DIR) && terraform apply

# Apply with auto-approve (use with caution)
apply-auto:
	@echo "⚡ Auto-applying infrastructure for $(ENV) environment..."
	cd $(ENV_DIR) && terraform apply -auto-approve

# Destroy the infrastructure
destroy:
	@echo "💥 Destroying infrastructure for $(ENV) environment..."
	cd $(ENV_DIR) && terraform destroy

# Show outputs
output:
	@echo "📊 Showing outputs for $(ENV) environment..."
	cd $(ENV_DIR) && terraform output

# Format Terraform files
fmt:
	@echo "🎨 Formatting Terraform files..."
	terraform fmt -recursive .

# Validate configuration
validate: fmt
	@echo "✅ Validating Terraform configuration for $(ENV) environment..."
	cd $(ENV_DIR) && terraform validate

# Clean Terraform cache and lock files
clean:
	@echo "🧹 Cleaning Terraform cache for $(ENV) environment..."
	cd $(ENV_DIR) && rm -rf .terraform .terraform.lock.hcl

# Setup remote backend (interactive)
setup-backend:
	@echo "🔧 Setting up remote backend for $(ENV) environment..."
	@echo "Please configure your backend settings in $(ENV_DIR)/main.tf"
	@echo "Common backends:"
	@echo "  - Terraform Cloud"
	@echo "  - AWS S3 + DynamoDB"
	@echo "  - DigitalOcean Spaces + PostgreSQL"

# Get kubeconfig for kubectl access
get-kubeconfig:
	@echo "☸️  Getting kubeconfig for $(ENV) environment..."
	cd $(ENV_DIR) && doctl kubernetes cluster kubeconfig save $$(terraform output -raw cluster_name)

# Install NGINX Ingress Controller
install-nginx-ingress:
	@echo "🌐 Installing NGINX Ingress Controller for $(ENV) environment..."
	kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/do/deploy.yaml

# Install cert-manager for Let's Encrypt
install-cert-manager:
	@echo "🔒 Installing cert-manager for $(ENV) environment..."
	kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml

# Quick deployment workflow
deploy: init plan apply get-kubeconfig
	@echo "🎉 Deployment complete for $(ENV) environment!"

# Complete setup workflow including Kubernetes tools
setup: init plan apply get-kubeconfig install-nginx-ingress install-cert-manager
	@echo "🎉 Complete setup finished for $(ENV) environment!"

# Show environment status
status:
	@echo "📋 Environment Status: $(ENV)"
	@echo "Directory: $(ENV_DIR)"
	@if [ -f $(ENV_DIR)/.terraform/terraform.tfstate ]; then echo "✅ Terraform initialized"; else echo "❌ Terraform not initialized"; fi
	@if [ -f $(ENV_DIR)/terraform.tfstate ]; then echo "✅ Infrastructure deployed"; else echo "❌ Infrastructure not deployed"; fi

# Show all environments
list-envs:
	@echo "📁 Available environments:"
	@ls -1 environments/ | sed 's/^/  - /'

# Copy tfvars example
setup-vars:
	@echo "📝 Setting up variables for $(ENV) environment..."
	@if [ ! -f $(ENV_DIR)/terraform.tfvars ]; then \
		cp $(ENV_DIR)/terraform.tfvars.example $(ENV_DIR)/terraform.tfvars; \
		echo "Created $(ENV_DIR)/terraform.tfvars from example"; \
		echo "Please edit this file with your actual values"; \
	else \
		echo "terraform.tfvars already exists in $(ENV_DIR)"; \
	fi

# Safety check for production
ifeq ($(ENV),prod)
PROD_SAFETY_CHECK := $(shell echo "Are you sure you want to modify production? [y/N]: "; read confirm; echo $$confirm)
safety-check:
	@if [ "$(PROD_SAFETY_CHECK)" != "y" ] && [ "$(PROD_SAFETY_CHECK)" != "Y" ]; then \
		echo "❌ Production operation cancelled"; \
		exit 1; \
	fi
endif

# Add safety check for production operations
ifeq ($(ENV),prod)
apply destroy: safety-check
endif