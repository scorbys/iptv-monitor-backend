pipeline {
  agent any

  options {
    skipDefaultCheckout(true)
  }

  triggers {
    githubPush()
  }

  environment {
    BACKEND_ENV_FILE = credentials('iptv-backend-env')
    ML_ENV_FILE = credentials('ml-service-env')
  }

  stages {
    stage('Prepare') {
      steps {
        script {
          echo "Deploying branch: ${env.BRANCH_NAME ?: 'configured SCM branch'}"
        }
        checkout scm
        sh 'rm -f .env && install -m 600 "$BACKEND_ENV_FILE" .env'
        sh 'rm -f ./ml-service/.env && install -m 600 "$ML_ENV_FILE" ./ml-service/.env'
      }
    }

    stage('Update Backend V2 (Green)') {
      steps {
        echo 'Building Backend V2 only — V1 tetap melayani traffic...'
        // --no-deps penting: jangan restart service lain saat build v2
        sh 'docker compose up -d --build --no-deps backend-v2'
      }
    }

    stage('Health Check V2') {
      steps {
        script {
          retry(10) {
            sleep 5
            // Cek langsung ke kontainer v2 (port internal 3001)
            sh "docker exec iptv-backend-v2 node -e \"require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""
          }
        }
      }
    }

    stage('Switch Traffic to V2') {
      steps {
        // V2 sudah healthy, reload nginx agar traffic dialihkan ke v2
        // V1 masih hidup dan nginx akan fallback ke v2 saja
        sh 'docker exec iptv-nginx nginx -s reload'
        sleep 5
        echo 'Traffic now handled by V2'
      }
    }

    stage('Update Backend V1') {
      steps {
        // Sekarang aman rebuild v1 karena nginx sudah pakai v2
        sh 'docker compose up -d --build --no-deps backend-v1'
        script {
          retry(12) {
            sleep 5
            sh "docker exec iptv-backend-v1 node -e \"require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""
          }
        }
        // Reload final agar load balance kembali ke v1 + v2
        sh 'docker exec iptv-nginx nginx -s reload'
        echo 'Both backends active'
      }
    }

    stage('Update Supporting Services') {
      steps {
        // Update service non-traffic satu per satu untuk hemat RAM
        sh 'docker compose up -d --build --no-deps ml-service'
        sleep 10
        sh 'docker compose up -d prometheus grafana cadvisor node-exporter'
        // Supporting services can get new container IPs after recreate.
        // Reload nginx so upstream DNS is resolved again.
        sleep 3
        sh 'docker exec iptv-nginx nginx -s reload'
      }
    }

    stage('Final Cleanup') {
      steps {
        sh 'docker image prune -f'
        echo 'Deployment Successful!'
      }
    }
  }
}
