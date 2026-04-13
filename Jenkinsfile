pipeline {
  agent any

  triggers {
    githubPush()
  }

  environment {
    // Ini akan mengambil Secret File dari Jenkins dan menyimpannya sementara
    DOTENV = credentials('iptv-backend-env')
  }

  stages {
    stage('Pull Code') {
      steps {
        // Tentukan branch agar tidak mencari 'master'
        git branch: 'main', url: 'https://github.com/scorbys/iptv-monitor-backend.git'
      }
    }

    stage('Deploy Zero Downtime') {
      steps {
        sh '''
        docker compose pull
        docker compose up -d --build --remove-orphans
        '''
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