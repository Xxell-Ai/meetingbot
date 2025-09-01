variable "domain_name" {
  description = "Domain name for DNS records"
  type        = string
}

variable "loadbalancer_ip" {
  description = "Load balancer IP address"
  type        = string
}

variable "dns_ttl" {
  description = "DNS record TTL"
  type        = number
  default     = 300
}

variable "create_www_record" {
  description = "Create www CNAME record"
  type        = bool
  default     = true
}

variable "subdomains" {
  description = "Map of subdomains to create"
  type = map(object({
    type  = string
    value = string
  }))
  default = {}
}