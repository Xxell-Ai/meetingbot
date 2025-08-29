# DNS Domain (if managed by Digital Ocean)
resource "digitalocean_domain" "this" {
  name = var.domain_name
}

# A Record pointing to load balancer
resource "digitalocean_record" "root" {
  domain = digitalocean_domain.this.name
  type   = "A"
  name   = "@"
  value  = digitalocean_loadbalancer.this.ip
  ttl    = 300
}