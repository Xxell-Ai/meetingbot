# Project Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "meetingbot"
}

# Digital Ocean Configuration
variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "do_region" {
  description = "DigitalOcean region"
  type        = string
  default     = "nyc1"
}

variable "do_spaces_access_id" {
  description = "DigitalOcean Spaces access key ID"
  type        = string
  sensitive   = true
}

variable "do_spaces_secret_key" {
  description = "DigitalOcean Spaces secret access key"
  type        = string
  sensitive   = true
}

variable "spaces_region" {
  description = "DigitalOcean Spaces region"
  type        = string
  default     = "nyc3"
}

# Domain Configuration
variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

variable "certificate_name" {
  description = "SSL certificate name in DigitalOcean"
  type        = string
}

# Authentication Configuration
variable "auth_github_id" {
  description = "GitHub OAuth application ID"
  type        = string
  sensitive   = true
}

variable "auth_github_secret" {
  description = "GitHub OAuth application secret"
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
}

# Networking Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.10.0.0/24"
}

# Database Configuration
variable "postgres_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15"
}

variable "database_size" {
  description = "Database cluster size"
  type        = string
  default     = "db-s-1vcpu-1gb" # Smallest for dev
}

variable "database_node_count" {
  description = "Number of database nodes"
  type        = number
  default     = 1
}

# Kubernetes Configuration
variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.29.1-do.0"
}

variable "kubernetes_auto_upgrade" {
  description = "Enable Kubernetes auto-upgrade"
  type        = bool
  default     = true
}

variable "cluster_node_size" {
  description = "Kubernetes node size"
  type        = string
  default     = "s-1vcpu-1gb" # Smaller for dev
}

variable "cluster_node_count" {
  description = "Number of Kubernetes nodes"
  type        = number
  default     = 1 # Single node for dev
}

variable "enable_auto_scaling" {
  description = "Enable cluster auto-scaling"
  type        = bool
  default     = false # Disabled for dev
}

variable "min_nodes" {
  description = "Minimum number of nodes"
  type        = number
  default     = 1
}

variable "max_nodes" {
  description = "Maximum number of nodes"
  type        = number
  default     = 2 # Limited for dev
}

# Server Configuration
variable "server_replicas" {
  description = "Number of server replicas"
  type        = number
  default     = 1
}

variable "server_cpu_request" {
  description = "Server CPU request"
  type        = string
  default     = "50m" # Lower for dev
}

variable "server_memory_request" {
  description = "Server memory request"
  type        = string
  default     = "128Mi" # Lower for dev
}

variable "server_cpu_limit" {
  description = "Server CPU limit"
  type        = string
  default     = "250m" # Lower for dev
}

variable "server_memory_limit" {
  description = "Server memory limit"
  type        = string
  default     = "256Mi" # Lower for dev
}

# Storage Configuration
variable "enable_storage_lifecycle" {
  description = "Enable storage lifecycle policies"
  type        = bool
  default     = true
}

variable "storage_file_expiration_days" {
  description = "Days after which files expire"
  type        = number
  default     = 30 # Shorter for dev
}

variable "storage_noncurrent_version_expiration_days" {
  description = "Days after which non-current versions expire"
  type        = number
  default     = 7 # Shorter for dev
}

# CDN Configuration
variable "enable_cdn" {
  description = "Enable CDN"
  type        = bool
  default     = false # Disabled for dev
}

variable "cdn_custom_domain" {
  description = "Custom domain for CDN"
  type        = string
  default     = null
}

variable "cdn_certificate_name" {
  description = "Certificate name for CDN"
  type        = string
  default     = null
}

variable "cdn_ttl" {
  description = "CDN cache TTL"
  type        = number
  default     = 300 # Shorter for dev
}

# DNS Configuration
variable "dns_ttl" {
  description = "DNS record TTL"
  type        = number
  default     = 300
}

variable "create_www_record" {
  description = "Create www CNAME record"
  type        = bool
  default     = false # Not needed for dev
}

variable "subdomains" {
  description = "Additional subdomains to create"
  type = map(object({
    type  = string
    value = string
  }))
  default = {}
}