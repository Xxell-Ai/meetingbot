output "bucket_name" {
  description = "Spaces bucket name"
  value       = digitalocean_spaces_bucket.this.name
}

output "bucket_region" {
  description = "Spaces bucket region"
  value       = digitalocean_spaces_bucket.this.region
}

output "bucket_domain_name" {
  description = "Spaces bucket domain name"
  value       = digitalocean_spaces_bucket.this.bucket_domain_name
}

output "bucket_endpoint" {
  description = "Spaces bucket endpoint"
  value       = "https://${digitalocean_spaces_bucket.this.region}.digitaloceanspaces.com"
}

output "cdn_domain" {
  description = "CDN domain name (if enabled)"
  value       = var.enable_cdn ? digitalocean_cdn.this[0].endpoint : null
}

output "cdn_custom_domain" {
  description = "CDN custom domain (if configured)"
  value       = var.enable_cdn && var.cdn_custom_domain != null ? var.cdn_custom_domain : null
}