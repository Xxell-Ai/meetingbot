terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

# VPC Module
resource "digitalocean_vpc" "this" {
  name     = "${var.name}-vpc"
  region   = var.region
  ip_range = var.vpc_cidr
}

# Load Balancer
resource "digitalocean_loadbalancer" "this" {
  name   = "${var.name}-lb"
  region = var.region
  vpc_uuid = digitalocean_vpc.this.id

  forwarding_rule {
    entry_port     = 443
    entry_protocol = "https"

    target_port     = 80
    target_protocol = "http"

    certificate_name = var.certificate_name
  }

  forwarding_rule {
    entry_port     = 80
    entry_protocol = "http"

    target_port     = 80
    target_protocol = "http"
  }

  healthcheck {
    port     = 22
    protocol = "tcp"
  }

  depends_on = [digitalocean_vpc.this]
}