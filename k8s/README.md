# 🚀 MeetingBot Kubernetes Deployment

This directory contains Kubernetes manifests organized using **Kustomize** for managing multiple environments efficiently.

## 📁 Directory Structure

```
k8s/
├── base/                           # Base configuration (common across environments)
│   ├── kustomization.yaml         # Base kustomization config
│   ├── namespace.yaml              # Namespace and ServiceAccount
│   ├── rbac.yaml                   # Role-based access control
│   ├── configmap.yaml              # Non-sensitive configuration
│   ├── secrets.yaml                # Secrets template
│   ├── server-deployment.yaml      # Server deployment
│   └── server-service.yaml         # Server service
├── overlays/                       # Environment-specific overrides
│   ├── local/                      # Local development environment
│   │   ├── kustomization.yaml      # Local customizations
│   │   ├── configmap-patch.yaml    # Local config overrides
│   │   └── deployment-patch.yaml   # Local deployment overrides
│   └── production/                 # Production environment
│       ├── kustomization.yaml      # Production customizations
│       ├── configmap-patch.yaml    # Production config overrides
│       └── deployment-patch.yaml   # Production deployment overrides
└── legacy/                         # Legacy individual manifests (deprecated)
    ├── configmap.yaml
    ├── secrets.yaml
    └── ...
```

## 🎯 Benefits of Kustomize Structure

### ✅ **Reduced Redundancy**
- **Base configuration** shared across environments
- **Environment-specific patches** only override what's different
- **DRY principle** - Don't Repeat Yourself

### ✅ **Environment Management**
- **Local development** - Optimized for Docker Desktop
- **Production** - Scaled and secured configuration
- **Easy to add** staging, testing, or other environments

### ✅ **Maintainability**
- **Single source of truth** for base configuration
- **Clear separation** of environment-specific settings
- **Version control friendly** - track changes per environment

## 🚀 Usage

### **Local Development**
```bash
# Deploy to local environment
kubectl apply -k k8s/overlays/local

# Or using kustomize directly
kustomize build k8s/overlays/local | kubectl apply -f -

# View generated manifests (without applying)
kubectl kustomize k8s/overlays/local
```

### **Production Deployment**
```bash
# Deploy to production
kubectl apply -k k8s/overlays/production

# View production manifests
kubectl kustomize k8s/overlays/production
```

### **Automated Setup (Local)**
```bash
# Use the automated setup script
./scripts/setup-local-env.sh

# This automatically uses Kustomize for deployment
```

## 🔧 Environment Configurations

### **Local Environment (`overlays/local/`)**
- **Namespace**: `meetingbot-local`
- **Image**: `meetingbot-server:local` (local build)
- **Resources**: Reduced for development (512Mi RAM, 250m CPU)
- **Database**: Local PostgreSQL via Docker
- **Domain**: `localhost:3000`
- **Secrets**: Embedded in kustomization (development only)

### **Production Environment (`overlays/production/`)**
- **Namespace**: `meetingbot`
- **Image**: `ghcr.io/your-org/meetingbot-server:latest`
- **Resources**: Production scale (2-8Gi RAM, 1-4 CPU)
- **Replicas**: 3 for high availability
- **Domain**: `meetingbot.yourdomain.com`
- **Secrets**: External secret files (secure)

## 📝 Customizing Environments

### **Adding a New Environment**
1. Create new overlay directory: `k8s/overlays/staging/`
2. Create `kustomization.yaml`:
   ```yaml
   apiVersion: kustomize.config.k8s.io/v1beta1
   kind: Kustomization
   resources:
     - ../../base
   commonLabels:
     environment: staging
   # Add your customizations...
   ```
3. Add environment-specific patches as needed

### **Modifying Base Configuration**
- Edit files in `k8s/base/` to change common configuration
- Changes automatically apply to all environments
- Test in local environment first

### **Environment-Specific Changes**
- Create patch files in the overlay directory
- Reference patches in `kustomization.yaml`
- Use strategic merge or JSON patches as needed

## 🔒 Secrets Management

### **Local Development**
Secrets are embedded in `kustomization.yaml` for convenience:
```yaml
secretGenerator:
  - name: meetingbot-secrets
    literals:
      - DATABASE_URL=postgresql://...
      - AWS_ACCESS_KEY_ID=DO801WY9MPLE6RJQMZJM
```

### **Production**
Use external secret files (not committed to git):
```yaml
secretGenerator:
  - name: meetingbot-secrets
    files:
      - DATABASE_URL=secrets/database-url
      - AWS_ACCESS_KEY_ID=secrets/aws-access-key-id
```

**Security Best Practices:**
- Never commit production secrets to git
- Use external secret management (Sealed Secrets, External Secrets Operator)
- Rotate secrets regularly

## 🧪 Testing Configurations

### **Validate Manifests**
```bash
# Check local configuration
kubectl kustomize k8s/overlays/local --validate

# Check production configuration  
kubectl kustomize k8s/overlays/production --validate
```

### **Dry Run Deployment**
```bash
# Test local deployment without applying
kubectl apply -k k8s/overlays/local --dry-run=client

# Test production deployment
kubectl apply -k k8s/overlays/production --dry-run=server
```

### **Compare Environments**
```bash
# Compare local vs production
diff <(kubectl kustomize k8s/overlays/local) <(kubectl kustomize k8s/overlays/production)
```

## 🔄 Migration from Legacy

The old individual manifest files are preserved in `k8s/legacy/` for reference. To migrate:

1. **Use Kustomize** for new deployments
2. **Test thoroughly** in local environment
3. **Gradually migrate** production deployments
4. **Remove legacy files** once migration is complete

## 📚 Useful Commands

```bash
# View all resources in an environment
kubectl kustomize k8s/overlays/local

# Apply with server-side validation
kubectl apply -k k8s/overlays/local --validate=true

# Force update all resources
kubectl replace -k k8s/overlays/local --force

# Delete environment
kubectl delete -k k8s/overlays/local

# Watch deployment status
kubectl get pods -n meetingbot-local -w
```

## 🆘 Troubleshooting

### **Kustomize Not Found**
```bash
# Install kustomize
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash

# Or use kubectl built-in kustomize
kubectl apply -k k8s/overlays/local
```

### **Validation Errors**
```bash
# Check kustomization syntax
kubectl kustomize k8s/overlays/local --validate

# Check individual resources
kubectl apply -k k8s/overlays/local --dry-run=client -o yaml
```

### **Secret Issues**
```bash
# View generated secrets (base64 encoded)
kubectl kustomize k8s/overlays/local | grep -A 20 "kind: Secret"

# Decode secret values for debugging
echo "base64-value" | base64 -d
```

This Kustomize structure provides a scalable, maintainable approach to managing MeetingBot deployments across multiple environments! 🎉

