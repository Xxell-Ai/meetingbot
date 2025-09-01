# Spaces bucket for bot data storage
resource "digitalocean_spaces_bucket" "this" {
  name   = "${var.name}-${var.random_suffix}-bot-data"
  region = var.spaces_region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = ["https://${var.domain_name}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }

  lifecycle_rule {
    id      = "cleanup-incomplete-uploads"
    enabled = true

    abort_incomplete_multipart_upload_days = 1
  }

  lifecycle_rule {
    id      = "cleanup-old-files"
    enabled = var.enable_lifecycle_policy

    expiration {
      days = var.file_expiration_days
    }

    noncurrent_version_expiration {
      days = var.noncurrent_version_expiration_days
    }
  }
}

# CDN endpoint for the spaces bucket (optional)
resource "digitalocean_cdn" "this" {
  count  = var.enable_cdn ? 1 : 0
  origin = digitalocean_spaces_bucket.this.bucket_domain_name

  custom_domain = var.cdn_custom_domain
  certificate_name = var.cdn_certificate_name

  ttl = var.cdn_ttl
}