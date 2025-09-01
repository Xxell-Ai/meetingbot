variable "name" {
  description = "Base name for resources"
  type        = string
}

variable "region" {
  description = "Digital Ocean region"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.10.0.0/24"
}

variable "certificate_name" {
  description = "Name of the SSL certificate"
  type        = string
}