@@ .. @@
 pipeline {
     agent any
     
     environment {
         // AWS Configuration
         AWS_REGION = 'us-west-2'
         AWS_ACCOUNT_ID = credentials('aws-account-id')
         EKS_CLUSTER_NAME = 'get-converted-exams-cluster'
         ECR_REPOSITORY = 'get-converted-exams'
         
         // Application Configuration
         APP_NAME = 'get-converted-exams'
         NAMESPACE = 'get-converted-exams'
         
         // Docker Configuration
         DOCKER_IMAGE = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"
         IMAGE_TAG = "${BUILD_NUMBER}-${GIT_COMMIT.take(7)}"
         
         // Credentials
         AWS_CREDENTIALS = credentials('aws-credentials')
         GITHUB_CREDENTIALS = credentials('github-token')
         KUBECONFIG_CREDENTIAL = credentials('kubeconfig-file')
+        SLACK_WEBHOOK = credentials('slack-webhook-url')
+        SONARQUBE_TOKEN = credentials('sonarqube-token')
     }
     
     options {
         buildDiscarder(logRotator(numToKeepStr: '10'))
         timeout(time: 30, unit: 'MINUTES')
         skipStagesAfterUnstable()
+        retry(3)
+        parallelsAlwaysFailFast()
     }
     
     triggers {
         githubPush()
         pollSCM('H/5 * * * *') // Poll every 5 minutes as backup
+        cron('H 2 * * 0') // Weekly build on Sunday at 2 AM
     }
     
     stages {
         stage('Checkout') {
             steps {
                 script {
                     echo "🔄 Checking out code from GitHub..."
                     checkout scm
                     
                     // Get commit information
                     env.GIT_COMMIT_MSG = sh(
                         script: 'git log -1 --pretty=%B',
                         returnStdout: true
                     ).trim()
+                    
+                    env.GIT_AUTHOR = sh(
+                        script: 'git log -1 --pretty=%an',
+                        returnStdout: true
+                    ).trim()
+                    
+                    env.GIT_BRANCH = sh(
+                        script: 'git rev-parse --abbrev-ref HEAD',
+                        returnStdout: true
+                    ).trim()
                     
                     echo "📝 Commit: ${env.GIT_COMMIT}"
                     echo "💬 Message: ${env.GIT_COMMIT_MSG}"
+                    echo "👤 Author: ${env.GIT_AUTHOR}"
+                    echo "🌿 Branch: ${env.GIT_BRANCH}"
                 }
             }
         }
         
+        stage('Code Quality & Security') {
+            parallel {
+                stage('SonarQube Analysis') {
+                    steps {
+                        script {
+                            echo "🔍 Running SonarQube code analysis..."
+                            withSonarQubeEnv('SonarQube') {
+                                sh '''
+                                    sonar-scanner \
+                                        -Dsonar.projectKey=get-converted-exams \
+                                        -Dsonar.sources=src \
+                                        -Dsonar.host.url=$SONAR_HOST_URL \
+                                        -Dsonar.login=$SONARQUBE_TOKEN
+                                '''
+                            }
+                        }
+                    }
+                }
+                
+                stage('Dependency Check') {
+                    steps {
+                        script {
+                            echo "🔒 Running dependency vulnerability scan..."
+                            sh '''
+                                npm audit --audit-level moderate
+                                npm audit fix --force || true
+                            '''
+                        }
+                    }
+                }
+                
+                stage('License Check') {
+                    steps {
+                        script {
+                            echo "📄 Checking license compliance..."
+                            sh '''
+                                npx license-checker --summary
+                            '''
+                        }
+                    }
+                }
+            }
+        }
+        
         stage('Build Dependencies') {
             parallel {
                 stage('Build Rust WASM') {
                     steps {
                         script {
                             echo "🦀 Building Rust WASM module..."
                             sh '''
                                 cd rust-formatter
                                 # Remove existing Cargo.lock to avoid version conflicts
                                 rm -f Cargo.lock
+                                # Update Rust toolchain
+                                rustup update stable
+                                rustup target add wasm32-unknown-unknown
                                 # Build WASM module
                                 wasm-pack build --target web --out-dir pkg
+                                # Verify WASM build
+                                ls -la pkg/
                             '''
                         }
                     }
                 }
                 
                 stage('Build Python WASM') {
                     steps {
                         script {
                             echo "🐍 Building Python WASM components..."
                             sh '''
                                 python3 scripts/build_python_wasm.py
+                                # Verify Python modules
+                                ls -la src/python_modules/
                             '''
                         }
                     }
                 }
                 
                 stage('Install Node Dependencies') {
                     steps {
                         script {
                             echo "📦 Installing Node.js dependencies..."
-                            dir('Get-Converted-Exams') {
-                                sh '''
-                                    npm ci --production=false
-                                '''
-                            }
+                            sh '''
+                                npm ci --production=false
+                                # Cache node_modules for faster builds
+                                tar -czf node_modules.tar.gz node_modules/
+                            '''
                         }
                     }
                 }
             }
         }
         
         stage('Test & Quality Checks') {
             parallel {
                 stage('Lint Code') {
                     steps {
                         script {
                             echo "🔍 Running code linting..."
-                            dir('Get-Converted-Exams') {
-                                sh '''
-                                    npm run lint
-                                '''
-                            }
+                            sh '''
+                                npm run lint
+                                # Generate lint report
+                                npm run lint -- --format json > lint-report.json || true
+                            '''
                         }
                     }
+                    post {
+                        always {
+                            publishHTML([
+                                allowMissing: false,
+                                alwaysLinkToLastBuild: true,
+                                keepAll: true,
+                                reportDir: '.',
+                                reportFiles: 'lint-report.json',
+                                reportName: 'ESLint Report'
+                            ])
+                        }
+                    }
                 }
                 
+                stage('Unit Tests') {
+                    steps {
+                        script {
+                            echo "🧪 Running unit tests..."
+                            sh '''
+                                npm test -- --coverage --watchAll=false
+                            '''
+                        }
+                    }
+                    post {
+                        always {
+                            publishTestResults testResultsPattern: 'coverage/lcov.info'
+                            publishHTML([
+                                allowMissing: false,
+                                alwaysLinkToLastBuild: true,
+                                keepAll: true,
+                                reportDir: 'coverage/lcov-report',
+                                reportFiles: 'index.html',
+                                reportName: 'Coverage Report'
+                            ])
+                        }
+                    }
+                }
+                
                 stage('Security Scan') {
                     steps {
                         script {
                             echo "🔒 Running security scan..."
                             sh '''
                                 # Scan for vulnerabilities
                                 npm audit --audit-level moderate
                                 
-                                # Scan Docker base image
-                                docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
-                                    -v $(pwd):/app aquasec/trivy:latest fs /app
+                                # Install and run Trivy for filesystem scan
+                                curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
+                                trivy fs . --format json --output trivy-report.json
                             '''
                         }
                     }
+                    post {
+                        always {
+                            archiveArtifacts artifacts: 'trivy-report.json', fingerprint: true
+                        }
+                    }
                 }
             }
         }
         
         stage('Build Application') {
             steps {
                 script {
                     echo "🏗️ Building React application..."
-                    dir('Get-Converted-Exams') {
-                        sh '''
-                            npm run build
-                        '''
-                    }
+                    sh '''
+                        # Build all components
+                        npm run build:all
+                        
+                        # Verify build output
+                        ls -la dist/
+                        
+                        # Generate build report
+                        du -sh dist/* > build-report.txt
+                    '''
                 }
             }
+            post {
+                always {
+                    archiveArtifacts artifacts: 'dist/**/*', fingerprint: true
+                    archiveArtifacts artifacts: 'build-report.txt', fingerprint: true
+                }
+            }
         }
         
         stage('Build & Push Docker Image') {
             steps {
                 script {
                     echo "🐳 Building and pushing Docker image..."
                     
                     withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', 
                                     credentialsId: 'aws-credentials']]) {
                         sh '''
                             # Login to ECR
                             aws ecr get-login-password --region ${AWS_REGION} | \
                                 docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
                             
                             # Build Docker image
                             docker build -t ${ECR_REPOSITORY}:${IMAGE_TAG} .
                             docker tag ${ECR_REPOSITORY}:${IMAGE_TAG} ${DOCKER_IMAGE}:${IMAGE_TAG}
                             docker tag ${ECR_REPOSITORY}:${IMAGE_TAG} ${DOCKER_IMAGE}:latest
+                            
+                            # Scan Docker image for vulnerabilities
+                            trivy image ${ECR_REPOSITORY}:${IMAGE_TAG} --format json --output docker-scan.json
                             
                             # Push to ECR
                             docker push ${DOCKER_IMAGE}:${IMAGE_TAG}
                             docker push ${DOCKER_IMAGE}:latest
                             
                             echo "✅ Image pushed: ${DOCKER_IMAGE}:${IMAGE_TAG}"
                         '''
                     }
                 }
             }
+            post {
+                always {
+                    archiveArtifacts artifacts: 'docker-scan.json', fingerprint: true
+                }
+            }
         }
         
+        stage('Deploy to Staging') {
+            when {
+                anyOf {
+                    branch 'develop'
+                    branch 'staging'
+                }
+            }
+            steps {
+                script {
+                    echo "🚀 Deploying to Staging Environment..."
+                    deployToEnvironment('staging', 'get-converted-exams-staging')
+                }
+            }
+        }
+        
         stage('Deploy to EKS') {
+            when {
+                branch 'main'
+            }
             steps {
                 script {
                     echo "🚀 Deploying to AWS EKS..."
-                    
-                    withCredentials([
-                        [$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-credentials'],
-                        file(credentialsId: 'kubeconfig-file', variable: 'KUBECONFIG_FILE')
-                    ]) {
-                        sh '''
-                            # Setup kubectl
-                            export KUBECONFIG=${KUBECONFIG_FILE}
-                            
-                            # Update kubeconfig for EKS
-                            aws eks update-kubeconfig --region ${AWS_REGION} --name ${EKS_CLUSTER_NAME}
-                            
-                            # Verify cluster connection
-                            kubectl cluster-info
-                            
-                            # Update deployment with new image
-                            kubectl set image deployment/${APP_NAME} \
-                                ${APP_NAME}=${DOCKER_IMAGE}:${IMAGE_TAG} \
-                                -n ${NAMESPACE}
-                            
-                            # Wait for rollout to complete
-                            kubectl rollout status deployment/${APP_NAME} -n ${NAMESPACE} --timeout=600s
-                            
-                            # Verify deployment
-                            kubectl get pods -n ${NAMESPACE}
-                            kubectl get services -n ${NAMESPACE}
-                        '''
-                    }
+                    deployToEnvironment('production', NAMESPACE)
                 }
             }
         }
         
         stage('Health Check') {
             steps {
                 script {
                     echo "🏥 Performing health checks..."
                     
                     withCredentials([file(credentialsId: 'kubeconfig-file', variable: 'KUBECONFIG_FILE')]) {
                         sh '''
                             export KUBECONFIG=${KUBECONFIG_FILE}
                             
                             # Check pod health
                             kubectl get pods -n ${NAMESPACE} -l app=${APP_NAME}
                             
                             # Check if all pods are ready
                             kubectl wait --for=condition=ready pod -l app=${APP_NAME} -n ${NAMESPACE} --timeout=300s
                             
+                            # Run smoke tests
+                            kubectl run smoke-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
+                                curl -f http://${APP_NAME}-service.${NAMESPACE}.svc.cluster.local/health
+                            
                             # Get service endpoint
-                            EXTERNAL_IP=$(kubectl get ingress ${APP_NAME}-ingress -n ${NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}\' 2>/dev/null || echo "Not configured")
+                            EXTERNAL_IP=$(kubectl get ingress ${APP_NAME}-ingress -n ${NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}\' 2>/dev/null || echo "Not configured")
                             echo "🌐 Application endpoint: ${EXTERNAL_IP}"
                             
-                            # Basic health check
+                            # External health check
                             if [ "$EXTERNAL_IP" != "Not configured" ]; then
                                 echo "⏳ Waiting for application to be ready..."
                                 sleep 30
-                                curl -f http://${EXTERNAL_IP}/health || echo "Health check endpoint not available"
+                                for i in {1..5}; do
+                                    if curl -f http://${EXTERNAL_IP}/health; then
+                                        echo "✅ Health check passed"
+                                        break
+                                    else
+                                        echo "⚠️ Health check failed, attempt $i/5"
+                                        sleep 10
+                                    fi
+                                done
                             fi
                         '''
                     }
                 }
             }
         }
+        
+        stage('Performance Tests') {
+            steps {
+                script {
+                    echo "⚡ Running performance tests..."
+                    sh '''
+                        # Install k6 for load testing
+                        curl -s https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz | tar xvz --strip-components 1
+                        
+                        # Run basic load test
+                        ./k6 run --vus 10 --duration 30s - <<EOF
+import http from 'k6/http';
+import { check } from 'k6';
+
+export default function() {
+  let response = http.get('http://${APP_NAME}-service.${NAMESPACE}.svc.cluster.local');
+  check(response, {
+    'status is 200': (r) => r.status === 200,
+    'response time < 500ms': (r) => r.timings.duration < 500,
+  });
+}
+EOF
+                    '''
+                }
+            }
+        }
+        
+        stage('Cleanup') {
+            steps {
+                script {
+                    echo "🧹 Cleaning up old resources..."
+                    sh '''
+                        # Clean up old Docker images
+                        docker image prune -f
+                        
+                        # Clean up old ECR images (keep last 10)
+                        aws ecr describe-images --repository-name ${ECR_REPOSITORY} \
+                            --query 'sort_by(imageDetails,&imagePushedAt)[:-10].[imageDigest]' \
+                            --output text | while read digest; do
+                            if [ ! -z "$digest" ]; then
+                                aws ecr batch-delete-image --repository-name ${ECR_REPOSITORY} \
+                                    --image-ids imageDigest=$digest
+                            fi
+                        done
+                        
+                        # Clean up build artifacts
+                        rm -rf node_modules/.cache
+                        rm -f node_modules.tar.gz
+                    '''
+                }
+            }
+        }
     }
     
     post {
         always {
             script {
                 echo "🧹 Cleaning up..."
-                sh '''
-                    # Clean up Docker images
-                    docker image prune -f
-                    
-                    # Clean up build artifacts
-                    rm -rf node_modules/.cache
-                '''
+                
+                // Archive important artifacts
+                archiveArtifacts artifacts: '**/*.log', allowEmptyArchive: true
+                
+                // Publish test results
+                publishTestResults testResultsPattern: 'test-results.xml'
+                
+                // Clean workspace
+                cleanWs()
             }
         }
         
         success {
             script {
                 echo "✅ Pipeline completed successfully!"
                 
-                // Send success notification
-                slackSend(
-                    channel: '#deployments',
-                    color: 'good',
-                    message: """
-                        ✅ *Deployment Successful*
-                        
-                        *Application:* ${APP_NAME}
-                        *Environment:* EKS Production
-                        *Image:* ${DOCKER_IMAGE}:${IMAGE_TAG}
-                        *Commit:* ${env.GIT_COMMIT.take(7)}
-                        *Message:* ${env.GIT_COMMIT_MSG}
-                        *Build:* ${BUILD_NUMBER}
-                        *Duration:* ${currentBuild.durationString}
-                    """
-                )
+                // Send success notification to Slack
+                sendSlackNotification('good', """
+                    ✅ *Deployment Successful*
+                    
+                    *Application:* ${APP_NAME}
+                    *Environment:* ${env.GIT_BRANCH == 'main' ? 'Production' : 'Staging'}
+                    *Image:* ${DOCKER_IMAGE}:${IMAGE_TAG}
+                    *Commit:* ${env.GIT_COMMIT.take(7)} by ${env.GIT_AUTHOR}
+                    *Message:* ${env.GIT_COMMIT_MSG}
+                    *Build:* #${BUILD_NUMBER}
+                    *Duration:* ${currentBuild.durationString}
+                    *Branch:* ${env.GIT_BRANCH}
+                """)
+                
+                // Send email notification
+                emailext (
+                    subject: "✅ Deployment Successful - ${APP_NAME} #${BUILD_NUMBER}",
+                    body: """
+                        <h2>Deployment Successful</h2>
+                        <p><strong>Application:</strong> ${APP_NAME}</p>
+                        <p><strong>Environment:</strong> ${env.GIT_BRANCH == 'main' ? 'Production' : 'Staging'}</p>
+                        <p><strong>Build:</strong> #${BUILD_NUMBER}</p>
+                        <p><strong>Commit:</strong> ${env.GIT_COMMIT.take(7)} by ${env.GIT_AUTHOR}</p>
+                        <p><strong>Duration:</strong> ${currentBuild.durationString}</p>
+                        <p><strong>Branch:</strong> ${env.GIT_BRANCH}</p>
+                    """,
+                    to: "${env.CHANGE_AUTHOR_EMAIL ?: 'team@company.com'}",
+                    mimeType: 'text/html'
+                )
             }
         }
         
         failure {
             script {
                 echo "❌ Pipeline failed!"
                 
-                // Send failure notification
-                slackSend(
-                    channel: '#deployments',
-                    color: 'danger',
-                    message: """
-                        ❌ *Deployment Failed*
-                        
-                        *Application:* ${APP_NAME}
-                        *Environment:* EKS Production
-                        *Commit:* ${env.GIT_COMMIT.take(7)}
-                        *Build:* ${BUILD_NUMBER}
-                        *Stage:* ${env.STAGE_NAME}
-                        *Duration:* ${currentBuild.durationString}
-                        
-                        Please check the build logs for details.
-                    """
-                )
+                // Rollback on production failure
+                if (env.GIT_BRANCH == 'main') {
+                    script {
+                        try {
+                            echo "🔄 Rolling back deployment..."
+                            withCredentials([file(credentialsId: 'kubeconfig-file', variable: 'KUBECONFIG_FILE')]) {
+                                sh '''
+                                    export KUBECONFIG=${KUBECONFIG_FILE}
+                                    kubectl rollout undo deployment/${APP_NAME} -n ${NAMESPACE}
+                                    kubectl rollout status deployment/${APP_NAME} -n ${NAMESPACE}
+                                '''
+                            }
+                        } catch (Exception e) {
+                            echo "❌ Rollback failed: ${e.message}"
+                        }
+                    }
+                }
+                
+                // Send failure notification
+                sendSlackNotification('danger', """
+                    ❌ *Deployment Failed*
+                    
+                    *Application:* ${APP_NAME}
+                    *Environment:* ${env.GIT_BRANCH == 'main' ? 'Production' : 'Staging'}
+                    *Commit:* ${env.GIT_COMMIT.take(7)} by ${env.GIT_AUTHOR}
+                    *Build:* #${BUILD_NUMBER}
+                    *Failed Stage:* ${env.STAGE_NAME}
+                    *Duration:* ${currentBuild.durationString}
+                    *Branch:* ${env.GIT_BRANCH}
+                    
+                    Please check the build logs for details.
+                    ${env.GIT_BRANCH == 'main' ? '🔄 Automatic rollback initiated.' : ''}
+                """)
             }
         }
         
         unstable {
             script {
                 echo "⚠️ Pipeline completed with warnings!"
+                
+                sendSlackNotification('warning', """
+                    ⚠️ *Deployment Completed with Warnings*
+                    
+                    *Application:* ${APP_NAME}
+                    *Build:* #${BUILD_NUMBER}
+                    *Branch:* ${env.GIT_BRANCH}
+                    
+                    Please review the build logs for warnings.
+                """)
             }
         }
     }
 }
+
+// Helper function for deployment
+def deployToEnvironment(String environment, String namespace) {
+    withCredentials([
+        [$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-credentials'],
+        file(credentialsId: 'kubeconfig-file', variable: 'KUBECONFIG_FILE')
+    ]) {
+        sh """
+            # Setup kubectl
+            export KUBECONFIG=\${KUBECONFIG_FILE}
+            
+            # Update kubeconfig for EKS
+            aws eks update-kubeconfig --region ${AWS_REGION} --name ${EKS_CLUSTER_NAME}
+            
+            # Verify cluster connection
+            kubectl cluster-info
+            
+            # Create namespace if it doesn't exist
+            kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -
+            
+            # Update deployment with new image
+            kubectl set image deployment/${APP_NAME} \
+                ${APP_NAME}=${DOCKER_IMAGE}:${IMAGE_TAG} \
+                -n ${namespace}
+            
+            # Wait for rollout to complete
+            kubectl rollout status deployment/${APP_NAME} -n ${namespace} --timeout=600s
+            
+            # Verify deployment
+            kubectl get pods -n ${namespace}
+            kubectl get services -n ${namespace}
+            
+            echo "✅ Deployed to ${environment} environment"
+        """
+    }
+}
+
+// Helper function for Slack notifications
+def sendSlackNotification(String color, String message) {
+    try {
+        slackSend(
+            channel: '#deployments',
+            color: color,
+            message: message
+        )
+    } catch (Exception e) {
+        echo "Failed to send Slack notification: ${e.message}"
+    }
+}