output "cluster_id" {
  description = "Database cluster ID"
  value       = digitalocean_database_cluster.this.id
}

output "cluster_host" {
  description = "Database cluster host"
  value       = digitalocean_database_cluster.this.host
}

output "cluster_port" {
  description = "Database cluster port"
  value       = digitalocean_database_cluster.this.port
}

output "cluster_database" {
  description = "Database name"
  value       = digitalocean_database_cluster.this.database
}

output "user_name" {
  description = "Database user name"
  value       = digitalocean_database_user.this.name
}

output "user_password" {
  description = "Database user password"
  value       = digitalocean_database_user.this.password
  sensitive   = true
}