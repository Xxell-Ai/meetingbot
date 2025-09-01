# Kubernetes Cluster
resource "digitalocean_kubernetes_cluster" "this" {
  name         = var.name
  region       = var.region
  auto_upgrade = var.auto_upgrade
  version      = var.kubernetes_version
  vpc_uuid     = var.vpc_id

  maintenance_policy {
    start_time = "04:00"
    day        = "sunday"
  }

  node_pool {
    name       = "${var.name}-default"
    size       = var.cluster_node_size
    node_count = var.cluster_node_count
    auto_scale = var.enable_auto_scaling
    min_nodes  = var.min_nodes
    max_nodes  = var.max_nodes

    tags = [
      var.name,
      var.environment
    ]
  }

  tags = [
    var.name,
    var.environment
  ]
}

# RBAC for the server to manage bot jobs
resource "kubernetes_service_account" "bot_manager" {
  depends_on = [digitalocean_kubernetes_cluster.this]
  
  metadata {
    name      = "${var.name}-bot-manager"
    namespace = "default"
  }
}

resource "kubernetes_cluster_role" "bot_manager" {
  depends_on = [digitalocean_kubernetes_cluster.this]
  
  metadata {
    name = "${var.name}-bot-manager"
  }

  rule {
    api_groups = ["batch"]
    resources  = ["jobs"]
    verbs      = ["get", "list", "create", "update", "patch", "delete"]
  }

  rule {
    api_groups = [""]
    resources  = ["pods"]
    verbs      = ["get", "list"]
  }
}

resource "kubernetes_cluster_role_binding" "bot_manager" {
  depends_on = [digitalocean_kubernetes_cluster.this]
  
  metadata {
    name = "${var.name}-bot-manager"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.bot_manager.metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.bot_manager.metadata[0].name
    namespace = "default"
  }
}

# Server Deployment
resource "kubernetes_deployment" "server" {
  depends_on = [digitalocean_kubernetes_cluster.this]

  metadata {
    name      = "${var.name}-server"
    namespace = "default"
  }

  spec {
    replicas = var.server_replicas

    selector {
      match_labels = {
        app = "${var.name}-server"
      }
    }

    template {
      metadata {
        labels = {
          app = "${var.name}-server"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.bot_manager.metadata[0].name
        
        container {
          name  = "server"
          image = "ghcr.io/meetingbot/server:sha-${var.current_commit_sha}"

          port {
            container_port = 3000
          }

          dynamic "env" {
            for_each = var.server_environment_variables
            content {
              name  = env.key
              value = env.value
            }
          }

          resources {
            requests = {
              cpu    = var.server_cpu_request
              memory = var.server_memory_request
            }
            limits = {
              cpu    = var.server_cpu_limit
              memory = var.server_memory_limit
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
    name      = "${var.name}-server"
    namespace = "default"
  }

  spec {
    selector = {
      app = "${var.name}-server"
    }

    port {
      port        = 80
      target_port = 3000
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

# Ingress
resource "kubernetes_ingress_v1" "server" {
  depends_on = [digitalocean_kubernetes_cluster.this]

  metadata {
    name      = "${var.name}-server"
    namespace = "default"
    annotations = {
      "kubernetes.io/ingress.class"                      = "nginx"
      "cert-manager.io/cluster-issuer"                   = "letsencrypt-prod"
      "nginx.ingress.kubernetes.io/ssl-redirect"         = "true"
      "service.beta.kubernetes.io/do-loadbalancer-name"  = var.loadbalancer_name
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
      secret_name = "${var.name}-tls"
    }
  }
}