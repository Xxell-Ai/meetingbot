variable "name" {
  description = "Base name for resources"
  type        = string
}

variable "domain_name" {
  description = "Domain name for CORS configuration"
  type        = string
}

variable "random_suffix" {
  description = "Random suffix for bucket name"
  type        = string
}

variable "spaces_region" {
  description = "DigitalOcean Spaces region"
  type        = string
  default     = "nyc3"
}

variable "enable_lifecycle_policy" {
  description = "Enable lifecycle policy for old files cleanup"
  type        = bool
  default     = true
}

variable "file_expiration_days" {
  description = "Days after which files expire"
  type        = number
  default     = 90
}

variable "noncurrent_version_expiration_days" {
  description = "Days after which non-current versions expire"
  type        = number
  default     = 30
}

variable "enable_cdn" {
  description = "Enable CDN for the spaces bucket"
  type        = bool
  default     = false
}

variable "cdn_custom_domain" {
  description = "Custom domain for CDN"
  type        = string
  default     = null
}

variable "cdn_certificate_name" {
  description = "Certificate name for CDN custom domain"
  type        = string
  default     = null
}

variable "cdn_ttl" {
  description = "CDN cache TTL in seconds"
  type        = number
  default     = 3600
}