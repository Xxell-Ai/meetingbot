# VPC
resource "digitalocean_vpc" "this" {
  name     = local.name
  region   = local.region
  ip_range = "10.0.0.0/16"
}