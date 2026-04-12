pipeline {
  agent any

  stages {
    stage('Pull Code') {
      steps {
        git 'https://github.com/scorbys/iptv-monitor-backend.git'
      }
    }

    stage('Build') {
      steps {
        sh 'docker compose build'
      }
    }

    stage('Deploy New Version') {
      steps {
        sh 'docker compose up -d iptv-backend-v2'
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
        sh 'docker compose restart nginx'
      }
    }

    stage('Stop Old Version') {
      steps {
        sh 'docker stop iptv-backend-v1 || true'
      }
    }
  }
}