# Multi-Environment DigitalOcean Infrastructure

This directory contains a multi-environment Terraform setup for deploying MeetingBot on DigitalOcean with proper environment isolation.

## 🏗️ Architecture Overview

```
terraform-do/
├── modules/                    # Reusable infrastructure modules
│   ├── networking/            # VPC, Load Balancer
│   ├── database/             # PostgreSQL cluster
│   ├── kubernetes/           # K8s cluster, deployments, ingress
│   ├── storage/              # Spaces bucket, CDN
│   └── dns/                  # DNS records
├── environments/             # Environment-specific configurations
│   ├── dev/                 # Development (minimal resources)
│   ├── staging/             # Staging (moderate resources)
│   └── prod/                # Production (high availability)
├── Makefile                 # Environment management commands
└── README.md               # This file
```

## 🚀 Quick Start

### 1. Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) >= 1.0
- [DigitalOcean CLI](https://docs.digitalocean.com/reference/doctl/) (`doctl`)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) for Kubernetes management

### 2. Setup Environment

```bash
# Choose your environment
export ENV=dev  # or staging, prod

# Set up variables file
make setup-vars ENV=$ENV

# Edit the variables file with your actual values
vim environments/$ENV/terraform.tfvars
```

### 3. Deploy Infrastructure

```bash
# Quick deployment
make deploy ENV=$ENV

# Or step by step
make init ENV=$ENV
make plan ENV=$ENV
make apply ENV=$ENV
```

### 4. Configure Kubernetes

```bash
# Get kubeconfig
make get-kubeconfig ENV=$ENV

# Install required components
make install-nginx-ingress ENV=$ENV
make install-cert-manager ENV=$ENV
```

## 🌍 Environments

### Development (`dev`)
- **Purpose**: Local development and testing
- **Resources**: Minimal (1 node, smallest database)
- **Domain**: `dev.your-domain.com`
- **Auto-scaling**: Disabled
- **Storage**: 30-day lifecycle policy

### Staging (`staging`)
- **Purpose**: Pre-production testing
- **Resources**: Moderate (2 nodes, medium database)
- **Domain**: `staging.your-domain.com`
- **Auto-scaling**: Limited (1-3 nodes)
- **Storage**: 60-day lifecycle policy

### Production (`prod`)
- **Purpose**: Live production environment
- **Resources**: High availability (3+ nodes, HA database)
- **Domain**: `your-domain.com`
- **Auto-scaling**: Full (2-10 nodes)
- **Storage**: 365-day lifecycle policy
- **CDN**: Enabled
- **Safety**: Extra confirmation required for changes

## 📋 Available Commands

### Basic Operations
```bash
# Show help
make help

# List environments
make list-envs

# Check environment status
make status ENV=dev

# Format code
make fmt

# Validate configuration
make validate ENV=dev
```

### Infrastructure Management
```bash
# Initialize
make init ENV=dev

# Plan changes
make plan ENV=staging

# Apply changes
make apply ENV=prod

# Destroy infrastructure (with confirmation)
make destroy ENV=dev

# Show outputs
make output ENV=prod
```

### Kubernetes Operations
```bash
# Get kubeconfig for kubectl
make get-kubeconfig ENV=prod

# Install NGINX Ingress Controller
make install-nginx-ingress ENV=prod

# Install cert-manager for SSL
make install-cert-manager ENV=prod
```

### Workflows
```bash
# Complete deployment workflow
make setup ENV=staging

# Quick deployment (without K8s tools)
make deploy ENV=dev

# Clean up Terraform cache
make clean ENV=dev
```

## ⚙️ Configuration

### Required Variables

Each environment needs these variables in `terraform.tfvars`:

```hcl
# DigitalOcean
do_token = "your-digitalocean-api-token"
do_region = "nyc1"

# Domain
domain_name = "your-domain.com"
certificate_name = "your-ssl-certificate"

# GitHub Auth
auth_github_id = "github-oauth-app-id"
auth_github_secret = "github-oauth-app-secret"
github_token = "github-personal-access-token"
```

### Environment-Specific Defaults

| Setting | Dev | Staging | Prod |
|---------|-----|---------|------|
| **Kubernetes Nodes** | 1 x s-1vcpu-1gb | 2 x s-2vcpu-2gb | 3 x s-4vcpu-8gb |
| **Database** | 1 x db-s-1vcpu-1gb | 1 x db-s-1vcpu-2gb | 3 x db-s-2vcpu-4gb |
| **Server Replicas** | 1 | 2 | 3 |
| **Auto-scaling** | Disabled | 1-3 nodes | 2-10 nodes |
| **Storage Lifecycle** | 30 days | 60 days | 365 days |
| **CDN** | Disabled | Optional | Enabled |

### Backend Configuration

Configure remote state storage in each environment's `main.tf`:

```hcl
terraform {
  backend "s3" {
    bucket = "your-terraform-state-bucket"
    key    = "meetingbot/dev/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
  }
}
```

## 🔒 Security Features

### Production Safety
- Extra confirmation required for production changes
- Higher resource allocations for availability
- Longer data retention periods
- CDN and SSL enabled by default

### Network Security
- Private VPC for all resources
- Database in private network only
- Load balancer handles SSL termination
- Ingress controller for internal routing

### Access Control
- RBAC configured for bot job management
- Service accounts with minimal permissions
- SSL certificates via Let's Encrypt

## 🔧 Customization

### Adding New Environments

1. Create new directory: `environments/new-env/`
2. Copy from existing environment
3. Modify variables and configuration
4. Update Makefile if needed

### Adding New Modules

1. Create module directory: `modules/new-module/`
2. Add `main.tf`, `variables.tf`, `outputs.tf`
3. Reference from environment configurations

### Environment-Specific Overrides

Each environment can override any module variable:

```hcl
module "kubernetes" {
  source = "../../modules/kubernetes"
  
  # Override defaults
  cluster_node_count = 5
  server_replicas = 4
  # ... other overrides
}
```

## 🚨 Troubleshooting

### Common Issues

1. **Terraform Init Fails**
   ```bash
   make clean ENV=dev
   make init ENV=dev
   ```

2. **Resource Conflicts**
   - Check resource naming in different environments
   - Ensure unique bucket names with random suffixes

3. **Kubernetes Connection Issues**
   ```bash
   make get-kubeconfig ENV=prod
   kubectl get nodes
   ```

4. **SSL Certificate Issues**
   - Verify certificate exists in DigitalOcean
   - Check domain DNS configuration
   - Install cert-manager for automatic certificates

### Getting Help

```bash
# Show detailed help
make help

# Check environment status
make status ENV=your-env

# Validate configuration
make validate ENV=your-env
```

## 📝 Migration from Old Structure

If migrating from the old single-environment setup:

1. **Backup existing state**
   ```bash
   terraform state pull > backup.tfstate
   ```

2. **Choose target environment** (usually `prod`)

3. **Import existing resources**
   ```bash
   cd environments/prod
   terraform import digitalocean_kubernetes_cluster.this existing-cluster-id
   # ... import other resources
   ```

4. **Verify and apply**
   ```bash
   make plan ENV=prod
   make apply ENV=prod
   ```

This multi-environment setup provides better isolation, easier management, and safer deployments across development, staging, and production environments.