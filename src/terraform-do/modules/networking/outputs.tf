output "vpc_id" {
  description = "ID of the VPC"
  value       = digitalocean_vpc.this.id
}

output "vpc_urn" {
  description = "URN of the VPC"
  value       = digitalocean_vpc.this.urn
}

output "loadbalancer_id" {
  description = "ID of the load balancer"
  value       = digitalocean_loadbalancer.this.id
}

output "loadbalancer_ip" {
  description = "IP of the load balancer"
  value       = digitalocean_loadbalancer.this.ip
}

output "loadbalancer_name" {
  description = "Name of the load balancer"
  value       = digitalocean_loadbalancer.this.name
}