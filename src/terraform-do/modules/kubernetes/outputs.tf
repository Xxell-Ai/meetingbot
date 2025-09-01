output "cluster_id" {
  description = "Kubernetes cluster ID"
  value       = digitalocean_kubernetes_cluster.this.id
}

output "cluster_name" {
  description = "Kubernetes cluster name"
  value       = digitalocean_kubernetes_cluster.this.name
}

output "cluster_endpoint" {
  description = "Kubernetes cluster endpoint"
  value       = digitalocean_kubernetes_cluster.this.endpoint
}

output "cluster_status" {
  description = "Kubernetes cluster status"
  value       = digitalocean_kubernetes_cluster.this.status
}

output "kube_config" {
  description = "Kubernetes configuration"
  value       = digitalocean_kubernetes_cluster.this.kube_config
  sensitive   = true
}

output "service_account_name" {
  description = "Bot manager service account name"
  value       = kubernetes_service_account.bot_manager.metadata[0].name
}