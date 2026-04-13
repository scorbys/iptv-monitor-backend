pipeline {
  agent any

  triggers {
    githubPush()
  }

  environment {
    // Mengambil file rahasia dari Jenkins Credentials
    BACKEND_ENV_FILE = credentials('iptv-backend-env')
    ML_ENV_FILE = credentials('ml-service-env')
  }

  stages {
    stage('Pull Code') {
      steps {
        // Tentukan branch agar tidak mencari 'master'
        git branch: 'main', url: 'https://github.com/scorbys/iptv-monitor-backend.git'
      }
    }

    stage('Prepare Environment Files') {
      steps {
        // Salin .env ke root folder (untuk backend-v1 & v2)
        sh 'cp $BACKEND_ENV_FILE .env'
        
        // Salin .env ke dalam folder ml-service
        sh 'cp $ML_ENV_FILE ./ml-service/.env'
        
        echo 'Environment files have been prepared.'
      }
    }

    stage('Deploy Zero Downtime') {
      steps {
        // Gabungkan pull & up agar efisien
        sh 'docker compose pull'
        sh 'docker compose up -d --build --remove-orphans'
      }
    }

    stage('Build') {
      steps {
        sh 'docker compose build'
      }
    }

    stage('Deploy New Version') {
      steps {
        sh 'docker compose up -d iptv-backend-v2-1'
      }
    }

    stage('Wait for Health') {
      steps {
        script {
          retry(5) {
            sleep 5
            sh 'curl -f http://localhost:3000/health'
          }
        }
      }
    }

    stage('Switch Traffic') {
      steps {
        sh 'docker compose restart iptv-nginx-1'
      }
    }

    stage('Stop Old Version') {
      steps {
        sh 'docker stop iptv-backend-v1-1 || true'
      }
    }
  }
}