variable "do_token" {
  type        = string
  description = "Digital Ocean API token"
  sensitive   = true
}

variable "do_region" {
  type        = string
  description = "The Digital Ocean region to deploy resources"
  default     = "nyc1"
}

variable "domain_name" {
  type        = string
  description = "The domain name to use for the website"
}

variable "auth_github_id" {
  type        = string
  description = "The GitHub ID for authentication"
  sensitive   = true
}

variable "auth_github_secret" {
  type        = string
  description = "The GitHub secret for authentication"
  sensitive   = true
}

variable "github_token" {
  type        = string
  description = "GitHub token for API access"
  sensitive   = true
}

variable "cluster_node_size" {
  type        = string
  description = "Digital Ocean Kubernetes node size"
  default     = "s-2vcpu-4gb"
}

variable "cluster_node_count" {
  type        = number
  description = "Number of nodes in the Kubernetes cluster"
  default     = 2
}