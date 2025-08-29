output "database_url" {
  description = "The PostgreSQL connection string for the database"
  value       = "postgresql://${digitalocean_database_user.this.name}:${digitalocean_database_user.this.password}@${digitalocean_database_cluster.this.host}:${digitalocean_database_cluster.this.port}/${digitalocean_database_cluster.this.database}"
  sensitive   = true
}

output "cluster_endpoint" {
  description = "Kubernetes cluster endpoint"
  value       = digitalocean_kubernetes_cluster.this.endpoint
  sensitive   = true
}

output "load_balancer_ip" {
  description = "Load balancer IP address"
  value       = digitalocean_loadbalancer.this.ip
}

output "spaces_bucket" {
  description = "Spaces bucket name"
  value       = digitalocean_spaces_bucket.this.name
}

output "spaces_endpoint" {
  description = "Spaces endpoint URL"
  value       = "https://${digitalocean_spaces_bucket.this.region}.digitaloceanspaces.com"
}