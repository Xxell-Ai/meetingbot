# Digital Ocean Terraform Makefile

.PHONY: init plan apply destroy output fmt validate

# Initialize Terraform
init:
	terraform init

# Plan the infrastructure
plan:
	terraform plan

# Apply the infrastructure
apply:
	terraform apply

# Destroy the infrastructure
destroy:
	terraform destroy

# Show outputs
output:
	terraform output

# Format Terraform files
fmt:
	terraform fmt -recursive

# Validate configuration
validate: fmt
	terraform validate

# Setup workspace for development
setup-dev:
	terraform workspace new dev || terraform workspace select dev

# Setup workspace for production
setup-prod:
	terraform workspace new prod || terraform workspace select prod

# Setup workspace for staging
setup-stage:
	terraform workspace new stage || terraform workspace select stage

# Show current workspace
show-workspace:
	terraform workspace show

# Get kubeconfig for kubectl access
get-kubeconfig:
	doctl kubernetes cluster kubeconfig save $(shell terraform output -raw cluster_name)

# Install NGINX Ingress Controller
install-nginx-ingress:
	kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/do/deploy.yaml

# Install cert-manager for Let's Encrypt
install-cert-manager:
	kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml