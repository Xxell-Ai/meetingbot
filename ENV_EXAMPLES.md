# Environment Variables Configuration

This document provides example environment configurations for both the **MeetingBot Server** and **Bot Runtime**.

## 🖥️ Server Environment (.env for server)

```bash
# ========================================
# MEETINGBOT SERVER CONFIGURATION
# ========================================

# ----------------------------------------
# APPLICATION SETTINGS
# ----------------------------------------
# Environment: development, test, or production
NODE_ENV="development"

# ----------------------------------------
# DATABASE CONFIGURATION
# ----------------------------------------
# PostgreSQL connection string
# Format: postgresql://username:password@host:port/database
DATABASE_URL="postgresql://username:password@localhost:5432/meetingbot"

# ----------------------------------------
# AUTHENTICATION & SECURITY
# ----------------------------------------
# Secret key for NextAuth.js (generate with: openssl rand -base64 32)
AUTH_SECRET="your-super-secret-auth-key-here"

# GitHub OAuth credentials (for user authentication)
AUTH_GITHUB_ID="your-github-oauth-app-client-id"
AUTH_GITHUB_SECRET="your-github-oauth-app-client-secret"

# GitHub API token (for repository access if needed)
GITHUB_TOKEN="ghp_your_github_personal_access_token"

# ----------------------------------------
# CLOUD PROVIDER SELECTION
# ----------------------------------------
# Choose your cloud provider: "AWS" or "DIGITAL_OCEAN"
CLOUD_PROVIDER="AWS"

# ----------------------------------------
# AWS CONFIGURATION (if CLOUD_PROVIDER="AWS")
# ----------------------------------------
# AWS credentials (leave empty to use IAM roles in production)
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"

# AWS S3 storage settings
AWS_BUCKET_NAME="your-s3-bucket-for-recordings"
AWS_REGION="us-east-1"

# ----------------------------------------
# AWS ECS CONFIGURATION (if using ECS deployment)
# ----------------------------------------
# ECS cluster and task definitions for different platforms
ECS_CLUSTER_NAME="meetingbot-cluster"
ECS_TASK_DEFINITION_MEET="arn:aws:ecs:region:account:task-definition/meetingbot-meet:1"
ECS_TASK_DEFINITION_TEAMS="arn:aws:ecs:region:account:task-definition/meetingbot-teams:1"
ECS_TASK_DEFINITION_ZOOM="arn:aws:ecs:region:account:task-definition/meetingbot-zoom:1"

# ECS networking (comma-separated values)
ECS_SUBNETS="subnet-12345678,subnet-87654321"
ECS_SECURITY_GROUPS="sg-12345678,sg-87654321"

# ----------------------------------------
# DIGITAL OCEAN CONFIGURATION (if CLOUD_PROVIDER="DIGITAL_OCEAN")
# ----------------------------------------
# DigitalOcean Spaces (S3-compatible storage)
DO_SPACES_BUCKET="your-do-spaces-bucket"
DO_SPACES_REGION="nyc3"
DO_SPACES_ENDPOINT="https://nyc3.digitaloceanspaces.com"

# ----------------------------------------
# DEPLOYMENT PLATFORM SELECTION
# ----------------------------------------
# Choose deployment platform: "AWS_ECS" or "KUBERNETES"
DEPLOYMENT_PLATFORM="KUBERNETES"

# ----------------------------------------
# KUBERNETES CONFIGURATION (if DEPLOYMENT_PLATFORM="KUBERNETES")
# ----------------------------------------
# Kubernetes namespace for bot jobs
KUBE_NAMESPACE="meetingbot"

# Domain name for the application
DOMAIN_NAME="your-domain.com"

# Current commit SHA for Docker image tags (auto-populated in CI/CD)
CURRENT_COMMIT_SHA="latest"

# ----------------------------------------
# EXTERNAL SYSTEM INTEGRATION
# ----------------------------------------
# Enable external system upload instead of S3/Spaces
USE_EXTERNAL_SYSTEM_UPLOAD=false

# External system API configuration
EXTERNAL_SYSTEM_BASE_URL="https://your-external-system.com"
EXTERNAL_SYSTEM_API_KEY="your-external-api-key"

# ----------------------------------------
# DOCKER REGISTRY CONFIGURATION
# ----------------------------------------
# Docker registry owner (defaults to your GitHub username)
DOCKER_REGISTRY_OWNER="Xxell-Ai"

# ----------------------------------------
# DEVELOPMENT & TESTING
# ----------------------------------------
# Skip environment validation (useful for Docker builds)
SKIP_ENV_VALIDATION=false
```

## 🤖 Bot Runtime Environment (.env for bots)

```bash
# ========================================
# MEETINGBOT RUNTIME CONFIGURATION
# ========================================

# ----------------------------------------
# APPLICATION SETTINGS
# ----------------------------------------
# Environment: development or production
NODE_ENV="development"

# ----------------------------------------
# BOT CONFIGURATION (Injected at Runtime)
# ----------------------------------------
# Bot configuration JSON (automatically injected by the server)
# Contains: botId, meetingInfo, settings, etc.
# BOT_DATA='{"id":123,"meetingInfo":{"platform":"google",...},...}'

# ----------------------------------------
# BACKEND COMMUNICATION
# ----------------------------------------
# URL for bot to communicate back to the server
BACKEND_URL="https://your-domain.com/api/trpc"

# ----------------------------------------
# CLOUD PROVIDER SELECTION
# ----------------------------------------
# Choose your cloud provider: "AWS" or "DIGITAL_OCEAN"
CLOUD_PROVIDER="AWS"

# ----------------------------------------
# AWS CONFIGURATION (if CLOUD_PROVIDER="AWS")
# ----------------------------------------
# AWS credentials for S3 upload
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"

# AWS S3 storage settings
AWS_BUCKET_NAME="your-s3-bucket-for-recordings"
AWS_REGION="us-east-1"

# ----------------------------------------
# DIGITAL OCEAN CONFIGURATION (if CLOUD_PROVIDER="DIGITAL_OCEAN")
# ----------------------------------------
# DigitalOcean Spaces settings
DO_SPACES_BUCKET="your-do-spaces-bucket"
DO_SPACES_REGION="nyc3"
DO_SPACES_ENDPOINT="https://nyc3.digitaloceanspaces.com"

# ----------------------------------------
# EXTERNAL SYSTEM INTEGRATION
# ----------------------------------------
# Enable external system upload instead of S3/Spaces
USE_EXTERNAL_SYSTEM_UPLOAD=false

# External system API configuration
EXTERNAL_SYSTEM_BASE_URL="https://your-external-system.com"
EXTERNAL_SYSTEM_API_KEY="your-external-api-key"

# ----------------------------------------
# PLATFORM-SPECIFIC SETTINGS
# ----------------------------------------
# Docker image platform identifier (auto-set in containers)
DOCKER_MEETING_PLATFORM="meet"  # or "teams" or "zoom"

# ----------------------------------------
# DEVELOPMENT & DEBUGGING
# ----------------------------------------
# Enable additional logging in development
DEBUG="meetingbot:*"

# Display settings for headless browser (in containerized environments)
DISPLAY=":99"
XVFB_WHD="1920x1080x24"
```

## 📋 Configuration Scenarios

### Scenario 1: AWS + ECS Deployment
```bash
# Server
CLOUD_PROVIDER="AWS"
DEPLOYMENT_PLATFORM="AWS_ECS"
AWS_BUCKET_NAME="meetingbot-recordings"
ECS_CLUSTER_NAME="meetingbot-prod"

# Bot Runtime
CLOUD_PROVIDER="AWS"
AWS_BUCKET_NAME="meetingbot-recordings"
USE_EXTERNAL_SYSTEM_UPLOAD=false
```

### Scenario 2: DigitalOcean + Kubernetes + External System
```bash
# Server
CLOUD_PROVIDER="DIGITAL_OCEAN"
DEPLOYMENT_PLATFORM="KUBERNETES"
USE_EXTERNAL_SYSTEM_UPLOAD=true
EXTERNAL_SYSTEM_BASE_URL="https://api.mycompany.com"

# Bot Runtime
CLOUD_PROVIDER="DIGITAL_OCEAN"
USE_EXTERNAL_SYSTEM_UPLOAD=true
EXTERNAL_SYSTEM_BASE_URL="https://api.mycompany.com"
EXTERNAL_SYSTEM_API_KEY="your-api-key"
```

### Scenario 3: Local Development
```bash
# Server
NODE_ENV="development"
CLOUD_PROVIDER="AWS"
DEPLOYMENT_PLATFORM="KUBERNETES"
DATABASE_URL="postgresql://postgres:password@localhost:5432/meetingbot_dev"

# Bot Runtime
NODE_ENV="development"
CLOUD_PROVIDER="AWS"
AWS_BUCKET_NAME="meetingbot-dev-recordings"
```

## 🔐 Security Notes

1. **Never commit .env files** to version control
2. **Use strong secrets** for AUTH_SECRET (32+ characters)
3. **Rotate API keys** regularly
4. **Use IAM roles** in production instead of hardcoded AWS credentials
5. **Validate external system certificates** (HTTPS only)
6. **Limit scope** of GitHub tokens and AWS permissions

## 🚀 Quick Setup

1. Copy the appropriate example above to your `.env` file
2. Replace all placeholder values with your actual credentials
3. Generate AUTH_SECRET: `openssl rand -base64 32`
4. Set up your cloud provider credentials
5. Configure your database connection
6. Test with a simple bot deployment

## 🔧 Environment Variable Validation

The system validates required environment variables on startup:
- **Server**: Validates based on CLOUD_PROVIDER and DEPLOYMENT_PLATFORM
- **Bot Runtime**: Validates based on CLOUD_PROVIDER and USE_EXTERNAL_SYSTEM_UPLOAD

Missing required variables will cause startup failures with clear error messages.
