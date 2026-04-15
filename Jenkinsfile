pipeline {
  agent any

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
        git branch: 'main', url: 'https://github.com/scorbys/iptv-monitor-backend.git'
        sh 'cp $BACKEND_ENV_FILE .env'
        sh 'cp $ML_ENV_FILE ./ml-service/.env'
      }
    }

    stage('Update Backend V2 (Green)') {
      steps {
        echo 'Updating Backend V2...'
        // Hanya build dan jalankan v2 agar v1 tetap melayani trafik
        sh 'docker compose up -d --build backend-v2'
      }
    }

    stage('Health Check V2') {
      steps {
        script {
          // Tunggu sampai V2 benar-benar siap
          retry(10) {
            sleep 5
            // Cek langsung ke kontainer v2 (port internal 3001)
            sh "docker exec iptv-backend-v2 node -e \"require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""
          }
        }
      }
    }

    stage('Switch & Update Backend V1 (Blue)') {
      steps {
        echo 'Updating remaining services...'
        // Build satu per satu jika RAM terbatas, atau gunakan satu perintah ini
        sh 'docker compose up -d --build nginx ml-service backend-v1 prometheus grafana cadvisor node-exporter'
        
        script {
            echo 'Waiting for Nginx stability...'
            sleep 20 // Jeda lebih lama karena banyak kontainer baru naik
            retry(3) {
                sh 'docker exec iptv-nginx nginx -s reload'
            }
        }
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