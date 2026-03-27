targetScope = 'resourceGroup'

param environmentName string
param location string = resourceGroup().location
param tags object = {}

var resourceSuffix = take(uniqueString(subscription().id, resourceGroup().id, environmentName), 6)
var registryName = replace('crdaveball${resourceSuffix}', '-', '')
var storageName = replace('stdaveball${resourceSuffix}', '-', '')
var flaskSecretKey = '${uniqueString(subscription().id, environmentName, 'flask-secret')}${uniqueString(resourceGroup().id, environmentName, 'flask-key')}'

// ─── Azure Container Registry (Basic – cheapest tier) ───────────────────────

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ─── Log Analytics Workspace (required by Container Apps) ───────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-${environmentName}-${resourceSuffix}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ─── Storage Account + File Share (highscores persistence) ──────────────────

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: 'highscores'
  properties: {
    shareQuota: 1
  }
}

// ─── Container Apps Environment ─────────────────────────────────────────────

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${environmentName}-${resourceSuffix}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource envStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppsEnv
  name: 'highscores'
  properties: {
    azureFile: {
      accountName: storageAccount.name
      accountKey: storageAccount.listKeys().keys[0].value
      shareName: fileShare.name
      accessMode: 'ReadWrite'
    }
  }
}

// ─── Backend Container App (internal ingress, WebSocket game server) ────────

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-backend-${resourceSuffix}'
  location: location
  tags: union(tags, { 'azd-service-name': 'backend' })
  properties: {
    environmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 5000
        transport: 'auto'
        allowInsecure: true
      }
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
        {
          name: 'flask-secret-key'
          value: flaskSecretKey
        }
      ]
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'FLASK_ENV'
              value: 'production'
            }
            {
              name: 'FLASK_DEBUG'
              value: '0'
            }
            {
              name: 'SECRET_KEY'
              secretRef: 'flask-secret-key'
            }
          ]
          probes: [
            {
              type: 'startup'
              httpGet: {
                path: '/health'
                port: 5000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 10
            }
            {
              type: 'liveness'
              httpGet: {
                path: '/health'
                port: 5000
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              failureThreshold: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// ─── Frontend Container App (external ingress, public-facing) ───────────────

resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-frontend-${resourceSuffix}'
  location: location
  tags: union(tags, { 'azd-service-name': 'frontend' })
  properties: {
    environmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
      }
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
      ]
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'BACKEND_FQDN'
              value: backendApp.properties.configuration.ingress.fqdn
            }
          ]
          probes: [
            {
              type: 'liveness'
              httpGet: {
                path: '/'
                port: 80
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// ─── Outputs ────────────────────────────────────────────────────────────────

output containerRegistryEndpoint string = containerRegistry.properties.loginServer
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
