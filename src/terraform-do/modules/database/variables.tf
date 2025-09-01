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
  description = "VPC ID for private networking"
  type        = string
}

variable "postgres_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15"
}

variable "database_size" {
  description = "Database cluster size"
  type        = string
  default     = "db-s-1vcpu-1gb"
}

variable "database_node_count" {
  description = "Number of database nodes"
  type        = number
  default     = 1
}

variable "database_user" {
  description = "Database user name"
  type        = string
  default     = "meetingbot"
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "meetingbot"
}