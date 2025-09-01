# Kubernetes Cluster (replaces ECS)
resource "digitalocean_kubernetes_cluster" "this" {
  name         = local.name
  region       = local.region
  auto_upgrade = true
  version      = "1.29.1-do.0"
  vpc_uuid     = digitalocean_vpc.this.id

  maintenance_policy {
    start_time = "04:00"
    day        = "sunday"
  }

  node_pool {
    name       = "${local.name}-default"
    size       = var.cluster_node_size
    node_count = var.cluster_node_count
    auto_scale = true
    min_nodes  = 1
    max_nodes  = local.prod ? 5 : 3

    tags = [
      "meetingbot",
      terraform.workspace
    ]
  }

  tags = [
    "meetingbot",
    terraform.workspace
  ]
}

# Server Deployment
resource "kubernetes_deployment" "server" {
  depends_on = [digitalocean_kubernetes_cluster.this]

  metadata {
    name      = "${local.name}-server"
    namespace = "default"
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "${local.name}-server"
      }
    }

    template {
      metadata {
        labels = {
          app = "${local.name}-server"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.bot_manager.metadata[0].name
        
        container {
          name  = "server"
          image = "ghcr.io/meetingbot/server:sha-${local.current_commit_sha_short}"

          port {
            container_port = 3000
          }

          env {
            name  = "PORT"
            value = "3000"
          }

          env {
            name  = "AUTH_TRUST_HOST"
            value = "true"
          }

          env {
            name  = "AUTH_SECRET"
            value = random_password.auth_secret.result
          }

          env {
            name  = "AUTH_URL"
            value = "https://${var.domain_name}"
          }

          env {
            name  = "AUTH_GITHUB_ID"
            value = var.auth_github_id
          }

          env {
            name  = "AUTH_GITHUB_SECRET"
            value = var.auth_github_secret
          }

          env {
            name  = "DATABASE_URL"
            value = "postgresql://${digitalocean_database_user.this.name}:${digitalocean_database_user.this.password}@${digitalocean_database_cluster.this.host}:${digitalocean_database_cluster.this.port}/${digitalocean_database_cluster.this.database}?sslmode=require"
          }

          env {
            name  = "GITHUB_TOKEN"
            value = var.github_token
          }

          env {
            name  = "DO_SPACES_BUCKET"
            value = digitalocean_spaces_bucket.this.name
          }

          env {
            name  = "DO_SPACES_REGION"
            value = digitalocean_spaces_bucket.this.region
          }

          env {
            name  = "DO_SPACES_ENDPOINT"
            value = "https://${digitalocean_spaces_bucket.this.region}.digitaloceanspaces.com"
          }

          env {
            name  = "KUBE_NAMESPACE"
            value = "default"
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }

          liveness_probe {
            http_get {
              path = "/"
              port = 3000
            }
            initial_delay_seconds = 30
            period_seconds        = 10
          }

          readiness_probe {
            http_get {
              path = "/"
              port = 3000
            }
            initial_delay_seconds = 5
            period_seconds        = 5
          }
        }
      }
    }
  }
}

# Server Service
resource "kubernetes_service" "server" {
  depends_on = [kubernetes_deployment.server]

  metadata {
    name      = "${local.name}-server"
    namespace = "default"
  }

  spec {
    selector = {
      app = "${local.name}-server"
    }

    port {
      port        = 80
      target_port = 3000
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

# Random password for auth secret
resource "random_password" "auth_secret" {
  length  = 32
  special = false
}