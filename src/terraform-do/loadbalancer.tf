# Load Balancer (equivalent to ALB)
resource "digitalocean_loadbalancer" "this" {
  name     = "${local.name}-lb"
  region   = local.region
  vpc_uuid = digitalocean_vpc.this.id

  forwarding_rule {
    entry_protocol  = "http"
    entry_port      = 80
    target_protocol = "http"
    target_port     = 80
    redirect_http_to_https = true
  }

  forwarding_rule {
    entry_protocol  = "https"
    entry_port      = 443
    target_protocol = "http"
    target_port     = 80
    certificate_name = digitalocean_certificate.this.name
  }

  healthcheck {
    protocol               = "http"
    port                   = 80
    path                   = "/"
    check_interval_seconds = 10
    response_timeout_seconds = 5
    unhealthy_threshold    = 3
    healthy_threshold      = 5
  }

  droplet_ids = []

  tags = [
    "meetingbot",
    terraform.workspace
  ]
}

# Let's Encrypt Certificate
resource "digitalocean_certificate" "this" {
  name    = "${local.name}-cert"
  type    = "lets_encrypt"
  domains = [var.domain_name]

  lifecycle {
    create_before_destroy = true
  }
}