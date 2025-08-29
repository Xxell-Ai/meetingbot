# Kubernetes Ingress for Load Balancer integration
resource "kubernetes_ingress_v1" "server" {
  depends_on = [digitalocean_kubernetes_cluster.this]

  metadata {
    name      = "${local.name}-server"
    namespace = "default"
    annotations = {
      "kubernetes.io/ingress.class"                      = "nginx"
      "cert-manager.io/cluster-issuer"                   = "letsencrypt-prod"
      "nginx.ingress.kubernetes.io/ssl-redirect"         = "true"
      "service.beta.kubernetes.io/do-loadbalancer-name"  = digitalocean_loadbalancer.this.name
    }
  }

  spec {
    rule {
      host = var.domain_name
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.server.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }

    tls {
      hosts       = [var.domain_name]
      secret_name = "${local.name}-tls"
    }
  }
}

# Bot Jobs (one-off tasks equivalent to ECS tasks)
resource "kubernetes_job" "meet_bot" {
  count = 0 # Set to 1 when you need to run the bot

  metadata {
    name      = "${local.name}-meet-bot-${random_string.this.result}"
    namespace = "default"
  }

  spec {
    template {
      metadata {
        labels = {
          app = "${local.name}-meet-bot"
        }
      }

      spec {
        restart_policy = "Never"

        container {
          name  = "bot"
          image = "ghcr.io/meetingbot/bots/meet:sha-${local.current_commit_sha_short}"

          env {
            name  = "BACKEND_URL"
            value = "https://${var.domain_name}/api/trpc"
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
            name  = "NODE_ENV"
            value = "production"
          }

          resources {
            requests = {
              cpu    = "2"
              memory = "8Gi"
            }
            limits = {
              cpu    = "4"
              memory = "16Gi"
            }
          }
        }
      }
    }

    backoff_limit = 0
  }

  wait_for_completion = false
}

resource "kubernetes_job" "zoom_bot" {
  count = 0 # Set to 1 when you need to run the bot

  metadata {
    name      = "${local.name}-zoom-bot-${random_string.this.result}"
    namespace = "default"
  }

  spec {
    template {
      metadata {
        labels = {
          app = "${local.name}-zoom-bot"
        }
      }

      spec {
        restart_policy = "Never"

        container {
          name  = "bot"
          image = "ghcr.io/meetingbot/bots/zoom:sha-${local.current_commit_sha_short}"

          env {
            name  = "BACKEND_URL"
            value = "https://${var.domain_name}/api/trpc"
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
            name  = "NODE_ENV"
            value = "production"
          }

          resources {
            requests = {
              cpu    = "2"
              memory = "8Gi"
            }
            limits = {
              cpu    = "4"
              memory = "16Gi"
            }
          }
        }
      }
    }

    backoff_limit = 0
  }

  wait_for_completion = false
}

resource "kubernetes_job" "teams_bot" {
  count = 0 # Set to 1 when you need to run the bot

  metadata {
    name      = "${local.name}-teams-bot-${random_string.this.result}"
    namespace = "default"
  }

  spec {
    template {
      metadata {
        labels = {
          app = "${local.name}-teams-bot"
        }
      }

      spec {
        restart_policy = "Never"

        container {
          name  = "bot"
          image = "ghcr.io/meetingbot/bots/teams:sha-${local.current_commit_sha_short}"

          env {
            name  = "BACKEND_URL"
            value = "https://${var.domain_name}/api/trpc"
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
            name  = "NODE_ENV"
            value = "production"
          }

          resources {
            requests = {
              cpu    = "2"
              memory = "8Gi"
            }
            limits = {
              cpu    = "4"
              memory = "16Gi"
            }
          }
        }
      }
    }

    backoff_limit = 0
  }

  wait_for_completion = false
}