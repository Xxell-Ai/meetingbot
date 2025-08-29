# Digital Ocean Terraform Configuration

This directory contains Terraform configuration to deploy the MeetingBot application on Digital Ocean infrastructure, converted from the original AWS setup.

## Prerequisites

1. **Digital Ocean Account** with API token
2. **Domain name** (can be managed elsewhere)
3. **GitHub OAuth App** configured
4. **Docker images** pushed to GitHub Container Registry
5. **doctl CLI** installed for Kubernetes access

## Setup

1. Copy the example variables file:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit `terraform.tfvars` with your actual values

3. Initialize and apply:
   ```bash
   make init
   make setup-dev  # or setup-prod
   make plan
   make apply
   ```

4. Setup Kubernetes tools:
   ```bash
   make get-kubeconfig
   make install-nginx-ingress
   make install-cert-manager
   ```

## Architecture Changes from AWS

### Services Migration
- **ECS → Kubernetes**: Container orchestration now uses Digital Ocean Kubernetes
- **ALB → Load Balancer**: Digital Ocean Load Balancer with Let's Encrypt
- **RDS → Managed PostgreSQL**: Digital Ocean Managed Database
- **S3 → Spaces**: Digital Ocean Spaces for object storage
- **Route53 → DNS**: Digital Ocean DNS management
- **CloudWatch → External**: No built-in logging (use ELK, Grafana, etc.)

### Key Differences

1. **Container Orchestration**: 
   - AWS uses ECS with EC2/Fargate capacity providers
   - DO uses Kubernetes with node pools

2. **Bot Execution**:
   - AWS: One-off ECS tasks triggered via API
   - DO: Kubernetes Jobs (set count=1 to run)

3. **Storage**:
   - AWS S3 environment variables → DO Spaces environment variables
   - Update application code to use Spaces SDK instead of AWS SDK

4. **Logging**:
   - AWS CloudWatch → Need external logging solution
   - Consider: ELK stack, Grafana Loki, or external SaaS

5. **Auto Scaling**:
   - AWS Auto Scaling Groups → Kubernetes Horizontal Pod Autoscaler
   - Need to configure HPA separately

## Code Changes Required

1. **Environment Variables**: Update application to use DO Spaces instead of AWS S3
2. **SDK Changes**: Replace AWS SDK calls with Digital Ocean Spaces API
3. **Logging**: Implement external logging solution
4. **Task Execution**: Replace ECS task triggering with Kubernetes Job creation

## Cost Considerations

- **Kubernetes cluster**: $12-24/month minimum (vs ECS which has no cluster cost)
- **Load Balancer**: $12/month (vs ALB $22/month)
- **Database**: $15-30/month depending on size
- **Spaces**: $5/month base + usage (vs S3 usage-only pricing)

## Manual Steps After Deployment

1. Configure DNS (if domain not managed by DO)
2. Setup external logging solution
3. Configure monitoring and alerting
4. Setup backup strategy for Spaces
5. Configure Kubernetes dashboard (optional)

## Running Bots

To run a bot task, update the count in `k8s-ingress.tf`:
```hcl
resource "kubernetes_job" "meet_bot" {
  count = 1  # Change from 0 to 1
  # ... rest of configuration
}
```

Then apply: `make apply`