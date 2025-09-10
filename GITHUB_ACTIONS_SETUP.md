# GitHub Actions Setup for Forked Repository

This guide will help you set up GitHub Actions in your forked MeetingBot repository to build, test, and deploy your project.

## 🔧 Required Changes

### 1. Update Docker Image Names

The current workflows push Docker images to `ghcr.io/meetingbot/*`. You need to update these to use your GitHub username.

#### Update `.github/workflows/docker.yml`

**Replace line 35:**
```yaml
# FROM:
images: ${{ env.REGISTRY }}/meetingbot/server

# TO:
images: ${{ env.REGISTRY }}/${{ github.repository_owner }}/meetingbot-server
```

**Replace line 76:**
```yaml
# FROM:
images: ${{ env.REGISTRY }}/meetingbot/bots/${{ matrix.bot }}

# TO:
images: ${{ env.REGISTRY }}/${{ github.repository_owner }}/meetingbot-bots-${{ matrix.bot }}
```

#### Alternative: Use Your Username Directly
```yaml
# If your GitHub username is "yourusername"
images: ${{ env.REGISTRY }}/yourusername/meetingbot-server
images: ${{ env.REGISTRY }}/yourusername/meetingbot-bots-${{ matrix.bot }}
```

### 2. Update Funding Configuration (Optional)

Update `.github/FUNDING.yml` to point to your GitHub username:
```yaml
# Replace:
github: [meetingbot]

# With:
github: [yourusername]
```

## 🔐 Required GitHub Secrets

### Automatic Secrets (No Setup Required)
These are automatically provided by GitHub:
- `GITHUB_TOKEN` - Used for Docker registry authentication

### Manual Secrets Setup

Go to your repository → Settings → Secrets and Variables → Actions, then add:

#### For Server Build & Test
```bash
# Authentication
AUTH_GITHUB_ID="your-github-oauth-app-client-id"
AUTH_GITHUB_SECRET="your-github-oauth-app-client-secret"  
AUTH_SECRET="your-super-secret-auth-key"

# AWS Configuration  
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_BUCKET_NAME="your-test-bucket"
AWS_REGION="us-east-1"

# Database (for tests)
DATABASE_URL="postgresql://user:pass@localhost:5432/testdb"

# GitHub API
FEED_GITHUB_TOKEN="your-github-personal-access-token"

# Test Configuration
TEST_AUTH_SECRET="test-auth-secret"
TEST_EMAIL="test@example.com" 
TEST_PASSWORD="test-password"
```

#### Minimal Setup (Just for Building)
If you only want to build (not run tests), you need minimum secrets:
```bash
AUTH_GITHUB_ID="fake-id"
AUTH_GITHUB_SECRET="fake-secret"
AUTH_SECRET="fake-secret-key"
AWS_ACCESS_KEY_ID="fake-key"
AWS_SECRET_ACCESS_KEY="fake-secret"
AWS_BUCKET_NAME="fake-bucket"
AWS_REGION="us-east-1"
DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
FEED_GITHUB_TOKEN="fake-token"
TEST_AUTH_SECRET="fake-test-secret"
TEST_EMAIL="fake@example.com"
TEST_PASSWORD="fake-password"
```

## 🚀 Quick Setup Script

Here's what you need to change in your forked repository:

### Step 1: Update Docker Workflow
```bash
# Edit .github/workflows/docker.yml
sed -i 's|meetingbot/server|${{ github.repository_owner }}/meetingbot-server|g' .github/workflows/docker.yml
sed -i 's|meetingbot/bots|${{ github.repository_owner }}/meetingbot-bots|g' .github/workflows/docker.yml
```

### Step 2: Update Funding (Optional)
```bash
# Edit .github/FUNDING.yml  
sed -i 's|meetingbot|yourusername|g' .github/FUNDING.yml
```

### Step 3: Enable GitHub Actions
1. Go to your forked repository on GitHub
2. Click "Actions" tab
3. Click "I understand my workflows, go ahead and enable them"

### Step 4: Add Required Secrets
1. Go to Settings → Secrets and Variables → Actions
2. Click "New repository secret"
3. Add the secrets listed above

## 🔄 Workflow Triggers

### Current Triggers
- **Push to main branch**: Runs all workflows
- **Pull requests**: Runs all workflows  
- **Manual trigger**: Can be triggered manually from Actions tab

### Customize Triggers
You can modify the `on:` section in each workflow:

```yaml
on:
  push:
    branches: ["main", "develop"]  # Add more branches
  pull_request:
    branches: ["main"]
  workflow_dispatch:  # Enable manual trigger
```

## 📦 What Each Workflow Does

### 1. `docker.yml` - Docker Build and Push
- **Server**: Builds and pushes server Docker image
- **Bots**: Builds and pushes bot images for Teams, Meet, and Zoom
- **Registry**: Uses GitHub Container Registry (ghcr.io)
- **Tags**: Creates tags based on branch, PR, and commit SHA

### 2. `test.yml` - Server Unit Tests  
- **Build**: Compiles the server application
- **Tests**: Currently commented out (can be enabled)
- **E2E Tests**: Playwright tests (currently commented out)

### 3. `test-bot.yml` - Bot Unit Tests
- **Bot Tests**: Runs unit tests for bot functionality
- **Simple**: Just installs deps and runs `pnpm test`

### 4. `typecheck.yml` - TypeScript Type Checking
- **Validation**: Ensures all TypeScript code compiles
- **Recursive**: Checks all packages in the monorepo

## 🎯 Recommended Customizations

### 1. Branch Protection
Add branch protection rules for `main`:
1. Go to Settings → Branches
2. Add rule for `main` branch
3. Require status checks:
   - `test` (Server Unit Tests)
   - `test` (Bot Unit Tests) 
   - `typecheck` (Typecheck)
   - `server` (Docker Build)
   - `bots` (Docker Build)

### 2. Environment-Specific Workflows
Create separate workflows for different environments:

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging
on:
  push:
    branches: ["develop"]

# .github/workflows/deploy-production.yml  
name: Deploy to Production
on:
  push:
    tags: ["v*"]
```

### 3. Enable Tests
Uncomment the test sections in `test.yml` once you have:
- A test database set up
- All required secrets configured
- Playwright configured for E2E tests

## 🔍 Troubleshooting

### Common Issues

#### 1. Docker Push Permission Denied
**Problem**: `permission denied` when pushing Docker images

**Solution**: 
- Ensure `GITHUB_TOKEN` has `packages: write` permission (automatic)
- Check if GitHub Container Registry is enabled for your account

#### 2. Missing Secrets Error
**Problem**: Workflow fails with "secret not found"

**Solution**:
- Add all required secrets in repository settings
- Use fake values for secrets you don't need

#### 3. Build Fails with Environment Validation
**Problem**: `Missing required environment variable`

**Solution**:
- Add `SKIP_ENV_VALIDATION=1` to build steps
- Or provide all required environment variables

#### 4. Tests Fail
**Problem**: Tests fail due to missing database/services

**Solution**:
- Set up test database in GitHub Actions
- Use Docker services for dependencies
- Mock external services

### Debug Workflow
Add debug information to workflows:

```yaml
- name: Debug Environment
  run: |
    echo "Repository: ${{ github.repository }}"
    echo "Owner: ${{ github.repository_owner }}"
    echo "Actor: ${{ github.actor }}"
    echo "Event: ${{ github.event_name }}"
```

## ✅ Verification Steps

1. **Push a commit** to main branch
2. **Check Actions tab** - all workflows should trigger
3. **Verify Docker images** are pushed to your container registry
4. **Check build logs** for any errors
5. **Test manual workflow dispatch** from Actions tab

## 🎉 Success Indicators

- ✅ All workflows show green checkmarks
- ✅ Docker images appear in your GitHub Packages
- ✅ Build artifacts are created successfully
- ✅ No permission or authentication errors

Your GitHub Actions should now be fully configured for your forked repository! 🚀
