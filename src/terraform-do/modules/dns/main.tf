terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

# DNS Records for the domain
resource "digitalocean_record" "this" {
  domain = var.domain_name
  type   = "A"
  name   = "@"
  value  = var.loadbalancer_ip
  ttl    = var.dns_ttl
}

resource "digitalocean_record" "www" {
  count  = var.create_www_record ? 1 : 0
  domain = var.domain_name
  type   = "CNAME"
  name   = "www"
  value  = "@"
  ttl    = var.dns_ttl
}

# Optional subdomain records
resource "digitalocean_record" "subdomains" {
  for_each = var.subdomains

  domain = var.domain_name
  type   = each.value.type
  name   = each.key
  value  = each.value.value
  ttl    = var.dns_ttl
}