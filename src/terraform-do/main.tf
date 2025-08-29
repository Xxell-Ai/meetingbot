terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

provider "kubernetes" {
  host  = digitalocean_kubernetes_cluster.this.endpoint
  token = digitalocean_kubernetes_cluster.this.kube_config[0].token
  cluster_ca_certificate = base64decode(
    digitalocean_kubernetes_cluster.this.kube_config[0].cluster_ca_certificate
  )
}

data "digitalocean_regions" "available" {
  filter {
    key    = "available"
    values = ["true"]
  }
}

locals {
  name   = "meetingbot-${terraform.workspace}"
  region = var.do_region

  current_commit_sha_short = substr(trimspace(file("../../.git/${trimspace(trimprefix(file("../../.git/HEAD"), "ref:"))}")), 0, 7)

  prod = terraform.workspace == "prod"
}

terraform {
  backend "s3" {
    encrypt = true
    # Note: You'll need to configure this to use Spaces as backend
    # or use Terraform Cloud/Enterprise
  }
}