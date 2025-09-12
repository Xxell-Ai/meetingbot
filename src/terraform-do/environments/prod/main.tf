terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    # Configure your backend here
    # bucket = "your-terraform-state-bucket"
    # key    = "meetingbot/prod/terraform.tfstate"
    # region = "us-east-1"
    # encrypt = true
  }
}

provider "digitalocean" {
  token = var.do_token
}

provider "kubernetes" {
  host  = module.kubernetes.cluster_endpoint
  token = module.kubernetes.kube_config[0].token
  cluster_ca_certificate = base64decode(
    module.kubernetes.kube_config[0].cluster_ca_certificate
  )
}

locals {
  environment = "prod"
  name        = "${var.project_name}-${local.environment}"

  current_commit_sha_short = substr(
    trimspace(
      file("../../../../.git/${trimspace(trimprefix(file("../../../../.git/HEAD"), "ref:"))}")
    ), 0, 7
  )

  # Base server environment variables
  base_server_environment_variables = {
    PORT               = "3000"
    AUTH_TRUST_HOST    = "true"
    AUTH_SECRET        = random_password.auth_secret.result
    AUTH_URL           = "https://${var.domain_name}"
    AUTH_GITHUB_ID     = var.auth_github_id
    AUTH_GITHUB_SECRET = var.auth_github_secret
    DATABASE_URL       = "postgresql://${module.database.user_name}:${module.database.user_password}@${module.database.cluster_host}:${module.database.cluster_port}/${module.database.cluster_database}?sslmode=require"
    GITHUB_TOKEN       = var.github_token
    DO_SPACES_BUCKET   = module.storage.bucket_name
    DO_SPACES_REGION   = module.storage.bucket_region
    DO_SPACES_ENDPOINT = module.storage.bucket_endpoint
    KUBE_NAMESPACE     = "default"
    NODE_ENV           = "production"

    # Cloud Provider Configuration
    CLOUD_PROVIDER      = "DIGITAL_OCEAN"
    DEPLOYMENT_PLATFORM = "KUBERNETES"

    # External System Integration
    USE_EXTERNAL_SYSTEM_UPLOAD = tostring(var.use_external_system_upload)

    # Docker Registry Configuration
    DOCKER_REGISTRY_OWNER = var.docker_registry_owner
    CURRENT_COMMIT_SHA    = local.current_commit_sha_short
  }

  # Optional external system variables
  external_system_variables = var.external_system_base_url != null ? {
    EXTERNAL_SYSTEM_BASE_URL = var.external_system_base_url
  } : {}

  external_system_api_key_variables = var.external_system_api_key != null ? {
    EXTERNAL_SYSTEM_API_KEY = var.external_system_api_key
  } : {}

  # Merge all environment variables
  server_environment_variables = merge(
    local.base_server_environment_variables,
    local.external_system_variables,
    local.external_system_api_key_variables
  )
}

# Random password for auth secret
resource "random_password" "auth_secret" {
  length  = 32
  special = false
}

# Random string for resource naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Networking module
module "networking" {
  source = "../../modules/networking"

  name             = local.name
  region           = var.do_region
  vpc_cidr         = var.vpc_cidr
  certificate_name = var.certificate_name
}

# Database module
module "database" {
  source = "../../modules/database"

  name        = local.name
  environment = local.environment
  region      = var.do_region
  vpc_id      = module.networking.vpc_id

  postgres_version    = var.postgres_version
  database_size       = var.database_size
  database_node_count = var.database_node_count
}

# Storage module
module "storage" {
  source = "../../modules/storage"

  name          = local.name
  domain_name   = var.domain_name
  random_suffix = random_string.suffix.result
  spaces_region = var.spaces_region

  enable_lifecycle_policy            = var.enable_storage_lifecycle
  file_expiration_days               = var.storage_file_expiration_days
  noncurrent_version_expiration_days = var.storage_noncurrent_version_expiration_days

  enable_cdn           = var.enable_cdn
  cdn_custom_domain    = var.cdn_custom_domain
  cdn_certificate_name = var.cdn_certificate_name
  cdn_ttl              = var.cdn_ttl
}

# Kubernetes module
module "kubernetes" {
  source = "../../modules/kubernetes"

  name               = local.name
  environment        = local.environment
  region             = var.do_region
  vpc_id             = module.networking.vpc_id
  domain_name        = var.domain_name
  loadbalancer_name  = module.networking.loadbalancer_name
  current_commit_sha = local.current_commit_sha_short

  kubernetes_version  = var.kubernetes_version
  auto_upgrade        = var.kubernetes_auto_upgrade
  cluster_node_size   = var.cluster_node_size
  cluster_node_count  = var.cluster_node_count
  enable_auto_scaling = var.enable_auto_scaling
  min_nodes           = var.min_nodes
  max_nodes           = var.max_nodes

  server_replicas              = var.server_replicas
  server_cpu_request           = var.server_cpu_request
  server_memory_request        = var.server_memory_request
  server_cpu_limit             = var.server_cpu_limit
  server_memory_limit          = var.server_memory_limit
  server_environment_variables = local.server_environment_variables
}

# DNS module
module "dns" {
  source = "../../modules/dns"

  domain_name       = var.domain_name
  loadbalancer_ip   = module.networking.loadbalancer_ip
  dns_ttl           = var.dns_ttl
  create_www_record = var.create_www_record
  subdomains        = var.subdomains
}