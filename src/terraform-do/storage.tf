# Random string for bucket naming
resource "random_string" "this" {
  length  = 8
  numeric = true
  upper   = false
  lower   = false
  special = false
}

# Spaces Bucket (equivalent to S3)
resource "digitalocean_spaces_bucket" "this" {
  name   = "${local.name}-${random_string.this.result}-bot-data"
  region = local.region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["https://${var.domain_name}"]
    max_age_seconds = 3000
  }
}