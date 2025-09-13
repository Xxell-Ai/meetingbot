# 🚀 Kubernetes Migration Plan for MeetingBot

## 📋 **Overview**
This document outlines the comprehensive plan to migrate MeetingBot to run on Kubernetes (K8s) environment with DigitalOcean Spaces for recording storage. The migration is split into phases for better code review and incremental deployment.

## 🎯 **Goals**
- ✅ **Keep Advanced Bot Features**: All bot configuration options, multi-platform support, speaker detection
- ✅ **Keep API Key Management**: For security and troubleshooting
- ✅ **Keep API Request Logging**: For debugging and audit trails
- ✅ **Keep Documentation System**: OpenAPI documentation
- ✅ **Kubernetes Deployment**: Server can spin up bots as K8s Jobs
- ✅ **DigitalOcean Spaces**: Recording storage integration
- ❌ **Remove**: Usage analytics, community features, complex dashboards

---

## 📅 **Migration Phases**

### **Phase 1: Kubernetes Infrastructure Setup** 🏗️
**Status**: ✅ **COMPLETED**  
**Goal**: Create K8s configuration files and deployment infrastructure

#### **Deliverables**:
- [x] **Namespace Configuration**
  - `k8s/namespace.yaml` - Isolated environment for MeetingBot
- [x] **ConfigMap & Secrets**
  - `k8s/configmap.yaml` - Non-sensitive configuration
  - `k8s/secrets.yaml` - Sensitive data (API keys, DB credentials)
- [x] **Database Deployment**
  - `k8s/postgres.yaml` - PostgreSQL StatefulSet with persistent storage
- [x] **Server Deployment**
  - `k8s/server-deployment.yaml` - Main application deployment
  - `k8s/server-service.yaml` - Service for server access
- [x] **Ingress Configuration**
  - `k8s/ingress.yaml` - External access configuration
- [x] **RBAC Configuration**
  - `k8s/rbac.yaml` - Service account and permissions for bot deployment
- [x] **Deployment Script**
  - `scripts/deploy-k8s.sh` - Automated deployment script
- [x] **Documentation**
  - `k8s/README.md` - Comprehensive deployment guide

#### **Files Created**:
```
k8s/
├── namespace.yaml           ✅ Created
├── configmap.yaml          ✅ Created  
├── secrets.yaml            ✅ Created (template)
├── postgres.yaml           ✅ Created
├── server-deployment.yaml  ✅ Created
├── ingress.yaml            ✅ Created
├── rbac.yaml              ✅ Created
├── bot-job-template.yaml  ✅ Created
└── README.md              ✅ Created

scripts/
└── deploy-k8s.sh          ✅ Created
```

#### **Phase 1 Summary**:
✅ **Complete Kubernetes infrastructure** ready for deployment  
✅ **RBAC security** with minimal required permissions  
✅ **Automated deployment script** with error handling  
✅ **Comprehensive documentation** for deployment and troubleshooting  
✅ **Production-ready configuration** with security best practices

---

### **Phase 2: DigitalOcean Spaces Integration** 💾
**Status**: ✅ **COMPLETED**  
**Goal**: Replace AWS S3 with DigitalOcean Spaces for recording storage

#### **Deliverables**:
- [x] **Environment Configuration**
  - Update `src/server/src/env.js` with DO Spaces variables
  - Add `STORAGE_PROVIDER` enum (`AWS_S3`, `DO_SPACES`)
- [x] **Storage Service Abstraction**
  - Create `src/server/src/server/utils/storage.ts` - Unified storage interface
  - Support both AWS S3 and DigitalOcean Spaces
- [x] **Bot Storage Integration**
  - Update `src/bots/src/s3.ts` for DO Spaces compatibility
  - Dynamic storage client configuration
- [x] **Kubernetes Configuration**
  - Add `STORAGE_PROVIDER` to ConfigMap and deployments
  - Update bot job template with storage environment variables
- [x] **Testing Infrastructure**
  - Create comprehensive storage integration test script
  - Validate both AWS S3 and DigitalOcean Spaces functionality

#### **Environment Variables**:
```bash
# Storage Configuration
STORAGE_PROVIDER=DO_SPACES  # or AWS_S3
DO_SPACES_ACCESS_KEY_ID=your_key
DO_SPACES_SECRET_ACCESS_KEY=your_secret
DO_SPACES_BUCKET=your_bucket
DO_SPACES_REGION=sgp1
DO_SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com

# Fallback AWS S3 (optional)
AWS_ACCESS_KEY_ID=fallback_key
AWS_SECRET_ACCESS_KEY=fallback_secret
AWS_BUCKET_NAME=fallback_bucket
AWS_REGION=us-east-1
```

#### **Files Created/Modified**:
```
src/server/src/env.js                    ✅ Added STORAGE_PROVIDER enum
src/server/src/server/utils/storage.ts   ✅ New unified storage service
src/server/src/server/utils/s3.ts       ✅ Updated for backward compatibility
src/bots/src/s3.ts                      ✅ Updated bucket selection logic
src/bots/src/index.ts                   ✅ Updated storage provider logic
k8s/configmap.yaml                      ✅ Added STORAGE_PROVIDER
k8s/server-deployment.yaml              ✅ Added storage env vars
k8s/bot-job-template.yaml               ✅ Added storage configuration
scripts/test-storage-integration.js     ✅ New comprehensive test script
PHASE2_STORAGE_INTEGRATION.md           ✅ Complete documentation
```

#### **Phase 2 Summary**:
✅ **Unified storage interface** supporting both AWS S3 and DigitalOcean Spaces  
✅ **Dynamic provider selection** via `STORAGE_PROVIDER` environment variable  
✅ **Kubernetes-ready configuration** with proper secrets management  
✅ **Comprehensive testing** infrastructure for validation  
✅ **Backward compatibility** with existing S3 code  
✅ **Production-ready** with error handling and performance optimization

---

### **Phase 3: Kubernetes Bot Deployment Service** 🤖
**Status**: ⏳ Pending  
**Goal**: Implement K8s Job-based bot deployment

#### **Deliverables**:
- [ ] **Bot Deployment Service**
  - `src/server/src/server/api/services/botDeploymentK8s.ts` - K8s deployment logic
  - Update `src/server/src/server/api/services/botDeployment.ts` - Platform detection
- [ ] **Kubernetes Client Integration**
  - Add `@kubernetes/client-node` dependency
  - K8s API authentication and job management
- [ ] **Bot Job Template**
  - `k8s/bot-job-template.yaml` - Template for bot Jobs
  - Dynamic job creation with bot configuration
- [ ] **Job Lifecycle Management**
  - Job creation, monitoring, cleanup
  - Status reporting and error handling

#### **Key Features**:
- **Dynamic Job Creation**: Each bot runs as a separate K8s Job
- **Resource Management**: CPU/memory limits for bot containers
- **Auto-cleanup**: Completed jobs are automatically cleaned up
- **Status Monitoring**: Real-time job status tracking
- **Error Handling**: Failed job detection and reporting

#### **Files to Create/Modify**:
```
src/server/src/server/api/services/botDeploymentK8s.ts  # New K8s service
src/server/src/server/api/services/botDeployment.ts     # Update platform logic
k8s/bot-job-template.yaml                              # Bot job template
src/server/package.json                                # Add K8s client dependency
```

---

### **Phase 4: Environment & Configuration Management** ⚙️
**Status**: ⏳ Pending  
**Goal**: Proper environment configuration and secrets management

#### **Deliverables**:
- [ ] **Environment Detection**
  - Add `DEPLOYMENT_PLATFORM` environment variable (`ECS`, `KUBERNETES`)
  - Platform-specific configuration loading
- [ ] **Secrets Management**
  - K8s Secrets for sensitive data
  - ConfigMaps for non-sensitive configuration
- [ ] **Docker Images**
  - Update Dockerfiles for K8s compatibility
  - Multi-stage builds for optimization
- [ ] **Helm Charts** (Optional)
  - Helm chart for easier deployment
  - Environment-specific values files

#### **Environment Variables**:
```bash
# Deployment Configuration
DEPLOYMENT_PLATFORM=KUBERNETES  # or ECS
KUBERNETES_NAMESPACE=meetingbot
KUBERNETES_SERVICE_ACCOUNT=meetingbot-sa

# Database Configuration
DATABASE_URL=postgresql://user:pass@postgres:5432/meetingbot

# Application Configuration
BACKEND_URL=http://meetingbot-server:3000
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=https://your-domain.com
```

#### **Files to Create/Modify**:
```
src/server/src/env.js                    # Add deployment platform detection
src/bots/meet/Dockerfile                 # K8s-compatible Dockerfile
src/bots/teams/Dockerfile                # K8s-compatible Dockerfile  
src/bots/zoom/Dockerfile                 # K8s-compatible Dockerfile
helm/meetingbot/                         # Helm chart (optional)
```

---

### **Phase 5: Testing & Validation** 🧪
**Status**: ⏳ Pending  
**Goal**: Comprehensive testing of K8s deployment

#### **Deliverables**:
- [ ] **Local K8s Testing**
  - Docker Desktop Kubernetes setup
  - Local deployment scripts
- [ ] **Integration Tests**
  - Bot deployment end-to-end tests
  - Storage integration tests
- [ ] **Performance Testing**
  - Resource usage monitoring
  - Scaling tests
- [ ] **Documentation**
  - Deployment guides
  - Troubleshooting documentation

#### **Test Scenarios**:
- ✅ **Bot Creation**: API creates bot successfully
- ✅ **K8s Job Deployment**: Bot deploys as K8s Job
- ✅ **Meeting Join**: Bot joins meeting successfully
- ✅ **Recording Upload**: Recording uploads to DO Spaces
- ✅ **Status Monitoring**: Real-time status updates
- ✅ **Error Handling**: Failed deployments are handled gracefully
- ✅ **Resource Cleanup**: Completed jobs are cleaned up

#### **Files to Create**:
```
scripts/deploy-local-k8s.sh             # Local deployment script
scripts/test-bot-deployment.sh          # Bot deployment test
tests/k8s-integration.test.ts           # Integration tests
docs/KUBERNETES_DEPLOYMENT.md           # Deployment guide
docs/TROUBLESHOOTING.md                 # Troubleshooting guide
```

---

## 🏗️ **Architecture Overview**

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "MeetingBot Namespace"
            Server[Server Deployment]
            DB[(PostgreSQL)]
            ConfigMap[ConfigMap]
            Secrets[Secrets]
            
            subgraph "Bot Jobs"
                BotJob1[Google Meet Bot]
                BotJob2[Teams Bot]
                BotJob3[Zoom Bot]
            end
        end
    end
    
    subgraph "External Services"
        DO[DigitalOcean Spaces]
        Meet[Google Meet]
        Teams[Microsoft Teams]
        Zoom[Zoom]
    end
    
    User --> Server
    Server --> DB
    Server --> BotJob1
    Server --> BotJob2
    Server --> BotJob3
    
    BotJob1 --> Meet
    BotJob2 --> Teams
    BotJob3 --> Zoom
    
    BotJob1 --> DO
    BotJob2 --> DO
    BotJob3 --> DO
    
    Server --> ConfigMap
    Server --> Secrets
```

---

## 📦 **Technology Stack**

### **Core Technologies**
- **Kubernetes**: Container orchestration
- **Docker**: Containerization
- **Node.js/TypeScript**: Application runtime
- **PostgreSQL**: Database
- **Next.js**: Web framework

### **New Dependencies**
- **@kubernetes/client-node**: Kubernetes API client
- **@aws-sdk/client-s3**: S3-compatible storage (DO Spaces)

### **Storage**
- **DigitalOcean Spaces**: Primary recording storage
- **AWS S3**: Fallback option (configurable)

---

## 🔒 **Security Considerations**

### **Secrets Management**
- Database credentials in K8s Secrets
- DigitalOcean Spaces keys in K8s Secrets
- API keys encrypted in database
- NextAuth secrets in K8s Secrets

### **RBAC (Role-Based Access Control)**
- Service account for bot deployment
- Minimal permissions for job creation
- Namespace isolation

### **Network Security**
- Internal service communication
- Ingress for external access only
- No direct database access from outside

---

## 📊 **Success Metrics**

### **Functional Requirements**
- ✅ Bots deploy successfully as K8s Jobs
- ✅ Recordings upload to DigitalOcean Spaces
- ✅ API key management works
- ✅ Real-time status monitoring
- ✅ Multi-platform support (Meet, Teams, Zoom)

### **Performance Requirements**
- ⚡ Bot deployment time < 30 seconds
- 📈 Support for concurrent bot deployments
- 💾 Efficient resource usage
- 🔄 Automatic cleanup of completed jobs

### **Reliability Requirements**
- 🛡️ Graceful error handling
- 📝 Comprehensive logging
- 🔄 Job retry mechanisms
- 📊 Health checks and monitoring

---

## 📝 **Next Steps**

1. **Start Phase 1**: Create Kubernetes configuration files
2. **Review & Test**: Each phase independently
3. **Incremental Deployment**: Deploy phase by phase
4. **Documentation**: Update this plan as we progress
5. **Testing**: Comprehensive testing after each phase

---

## 📚 **References**

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [DigitalOcean Spaces API](https://docs.digitalocean.com/products/spaces/)
- [@kubernetes/client-node](https://github.com/kubernetes-client/javascript)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

---

**Last Updated**: $(date)  
**Status**: Phase 1 In Progress  
**Next Review**: After Phase 1 completion
