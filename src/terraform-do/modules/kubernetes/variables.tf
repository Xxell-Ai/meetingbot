variable "name" {
  description = "Base name for resources"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "region" {
  description = "Digital Ocean region"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "domain_name" {
  description = "Domain name for ingress"
  type        = string
}

variable "loadbalancer_name" {
  description = "Load balancer name for ingress annotation"
  type        = string
}

variable "current_commit_sha" {
  description = "Current commit SHA for image tagging"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.29.1-do.0"
}

variable "auto_upgrade" {
  description = "Enable auto-upgrade for Kubernetes"
  type        = bool
  default     = true
}

variable "cluster_node_size" {
  description = "Kubernetes node size"
  type        = string
  default     = "s-2vcpu-4gb"
}

variable "cluster_node_count" {
  description = "Number of nodes in the cluster"
  type        = number
  default     = 2
}

variable "enable_auto_scaling" {
  description = "Enable auto-scaling"
  type        = bool
  default     = true
}

variable "min_nodes" {
  description = "Minimum number of nodes"
  type        = number
  default     = 1
}

variable "max_nodes" {
  description = "Maximum number of nodes"
  type        = number
  default     = 5
}

variable "server_replicas" {
  description = "Number of server replicas"
  type        = number
  default     = 1
}

variable "server_cpu_request" {
  description = "Server CPU request"
  type        = string
  default     = "100m"
}

variable "server_memory_request" {
  description = "Server memory request"
  type        = string
  default     = "256Mi"
}

variable "server_cpu_limit" {
  description = "Server CPU limit"
  type        = string
  default     = "500m"
}

variable "server_memory_limit" {
  description = "Server memory limit"
  type        = string
  default     = "512Mi"
}

variable "server_environment_variables" {
  description = "Environment variables for the server container"
  type        = map(string)
  default     = {}
}