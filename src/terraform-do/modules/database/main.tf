# Database Cluster
resource "digitalocean_database_cluster" "this" {
  name       = "${var.name}-db"
  engine     = "pg"
  version    = var.postgres_version
  size       = var.database_size
  region     = var.region
  node_count = var.database_node_count

  private_network_uuid = var.vpc_id

  tags = [
    var.name,
    var.environment
  ]
}

# Database User
resource "digitalocean_database_user" "this" {
  cluster_id = digitalocean_database_cluster.this.id
  name       = var.database_user
}

# Database
resource "digitalocean_database_db" "this" {
  cluster_id = digitalocean_database_cluster.this.id
  name       = var.database_name
}