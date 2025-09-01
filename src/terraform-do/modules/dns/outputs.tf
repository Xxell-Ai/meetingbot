output "domain_records" {
  description = "List of created DNS records"
  value = {
    main = {
      name  = digitalocean_record.this.name
      type  = digitalocean_record.this.type
      value = digitalocean_record.this.value
    }
    www = var.create_www_record ? {
      name  = digitalocean_record.www[0].name
      type  = digitalocean_record.www[0].type
      value = digitalocean_record.www[0].value
    } : null
    subdomains = {
      for k, v in digitalocean_record.subdomains : k => {
        name  = v.name
        type  = v.type
        value = v.value
      }
    }
  }
}