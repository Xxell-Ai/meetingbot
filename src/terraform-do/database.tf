# Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = false
}

# PostgreSQL Database Cluster
resource "digitalocean_database_cluster" "this" {
  name       = local.name
  engine     = "pg"
  version    = "16"
  size       = local.prod ? "db-s-2vcpu-4gb" : "db-s-1vcpu-1gb"
  region     = local.region
  node_count = local.prod ? 2 : 1

  tags = [
    "meetingbot",
    terraform.workspace
  ]
}

# Database User
resource "digitalocean_database_user" "this" {
  cluster_id = digitalocean_database_cluster.this.id
  name       = "meetingbot"
}

# Database 
resource "digitalocean_database_db" "this" {
  cluster_id = digitalocean_database_cluster.this.id
  name       = "meetingbot"
}