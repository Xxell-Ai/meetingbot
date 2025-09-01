output "cluster_name" {
  description = "Kubernetes cluster name"
  value       = module.kubernetes.cluster_name
}

output "cluster_endpoint" {
  description = "Kubernetes cluster endpoint"
  value       = module.kubernetes.cluster_endpoint
}

output "loadbalancer_ip" {
  description = "Load balancer IP address"
  value       = module.networking.loadbalancer_ip
}

output "database_host" {
  description = "Database host"
  value       = module.database.cluster_host
}

output "spaces_bucket" {
  description = "Spaces bucket name"
  value       = module.storage.bucket_name
}

output "spaces_endpoint" {
  description = "Spaces endpoint"
  value       = module.storage.bucket_endpoint
}

output "domain_records" {
  description = "DNS records created"
  value       = module.dns.domain_records
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}