pipeline {
  agent any

  stages {
    stage('Pull Code') {
      steps {
        git 'https://github.com/scorbys/iptv-monitor-backend.git'
      }
    }

    stage('Stop Old') {
      steps {
        sh 'docker compose down'
      }
    }

    stage('Build') {
      steps {
        sh 'docker compose build --no-cache'
      }
    }

    stage('Deploy') {
      steps {
        sh 'docker compose up -d'
      }
    }

    stage('Cleanup') {
      steps {
        sh 'docker system prune -f'
      }
    }
  }
}