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

# Kubernetes RBAC for the server to manage bot jobs
resource "kubernetes_service_account" "bot_manager" {
  depends_on = [digitalocean_kubernetes_cluster.this]
  
  metadata {
    name      = "${local.name}-bot-manager"
    namespace = "default"
  }
}

resource "kubernetes_cluster_role" "bot_manager" {
  depends_on = [digitalocean_kubernetes_cluster.this]
  
  metadata {
    name = "${local.name}-bot-manager"
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
    name = "${local.name}-bot-manager"
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