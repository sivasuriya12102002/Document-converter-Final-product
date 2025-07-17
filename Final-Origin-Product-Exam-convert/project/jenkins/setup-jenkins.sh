#!/bin/bash

# Jenkins Setup Script for AWS EKS CI/CD Pipeline

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up Jenkins for AWS EKS CI/CD Pipeline${NC}"

# Configuration
JENKINS_NAMESPACE="jenkins"
JENKINS_SERVICE_ACCOUNT="jenkins"
EKS_CLUSTER_NAME="get-converted-exams-cluster"
AWS_REGION="us-west-2"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

if ! command_exists kubectl; then
    echo -e "${RED}❌ kubectl is not installed${NC}"
    exit 1
fi

if ! command_exists helm; then
    echo -e "${RED}❌ Helm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Create Jenkins namespace
echo -e "${YELLOW}📦 Creating Jenkins namespace...${NC}"
kubectl create namespace $JENKINS_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create Jenkins service account with EKS permissions
echo -e "${YELLOW}🔑 Creating Jenkins service account...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: $JENKINS_SERVICE_ACCOUNT
  namespace: $JENKINS_NAMESPACE
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: jenkins-admin
rules:
- apiGroups: [""]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["apps"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["extensions"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["networking.k8s.io"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["batch"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["autoscaling"]
  resources: ["*"]
  verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: jenkins-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: jenkins-admin
subjects:
- kind: ServiceAccount
  name: $JENKINS_SERVICE_ACCOUNT
  namespace: $JENKINS_NAMESPACE
EOF

# Add Jenkins Helm repository
echo -e "${YELLOW}📚 Adding Jenkins Helm repository...${NC}"
helm repo add jenkins https://charts.jenkins.io
helm repo update

# Create Jenkins values file
echo -e "${YELLOW}📝 Creating Jenkins configuration...${NC}"
cat > jenkins-values.yaml <<EOF
controller:
  serviceAccount:
    create: false
    name: $JENKINS_SERVICE_ACCOUNT
  
  adminUser: "admin"
  # Generate random password
  adminPassword: "$(openssl rand -base64 32)"
  
  resources:
    requests:
      cpu: "1000m"
      memory: "2Gi"
    limits:
      cpu: "2000m"
      memory: "4Gi"
  
  installPlugins:
    - kubernetes:4246.v5a_12b_1fe120e
    - workflow-aggregator:596.v8c21c963d92d
    - git:5.2.2
    - github:1.39.0
    - github-branch-source:1791.vb_11d93c62f9c
    - pipeline-github-lib:61.v629f2cc41d83
    - pipeline-stage-view:2.34
    - docker-workflow:580.vc0c340686b_54
    - aws-credentials:191.vcb_f183ce58b_9
    - amazon-ecr:1.76.v04c9dceeb_31d
    - kubernetes-cli:1.12.1
    - slack:631.v40deea_40323b
    - build-timeout:1.32
    - timestamper:1.27
    - ws-cleanup:0.45
    - ant:475.vf34069fef73c
    - gradle:2.12
    - workflow-support:907.v6713a_ed8a_573
    - pipeline-milestone-step:111.v449306f708b_7
    - matrix-project:822.824.v14451b_c0fd42
    - resource-disposer:0.23
    - ssh-slaves:2.973.v0fa_8c0dea_f9f
    - ldap:682.v7b_544c9d1512
    - email-ext:2.102
    - mailer:463.vedf8358e006b_
    - sonar:2.15
    - htmlpublisher:1.31
    - junit:1.60
    - jacoco:3.3.2
    - performance:3.20
    - blueocean:1.25.2
    - pipeline-utility-steps:2.13.0
    - http_request:1.16
    - build-user-vars-plugin:1.9
  
  serviceType: LoadBalancer
  
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: alb
      alb.ingress.kubernetes.io/scheme: internet-facing
      alb.ingress.kubernetes.io/target-type: ip
      alb.ingress.kubernetes.io/ssl-redirect: '443'
      alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    hosts:
      - host: jenkins.your-domain.com  # Update with your domain
        paths:
          - path: /
            pathType: Prefix
  
  # JCasC Configuration
  JCasC:
    defaultConfig: true
    configScripts:
      welcome-message: |
        jenkins:
          systemMessage: "Welcome to Jenkins CI/CD for getConvertedExams.io"
        
        security:
          globalJobDslSecurityConfiguration:
            useScriptSecurity: false
        
        unclassified:
          location:
            url: "https://jenkins.your-domain.com"
          
          slackNotifier:
            teamDomain: "your-team"
            token: "${SLACK_TOKEN}"
            room: "#deployments"

persistence:
  enabled: true
  size: 20Gi
  storageClass: gp2

agent:
  enabled: true
  image: "jenkins/inbound-agent"
  tag: "latest"
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "1000m"
      memory: "2Gi"
  
  # Custom agent with additional tools
  customJenkinsLabels:
    - "docker"
    - "kubernetes"
    - "aws"
    - "nodejs"
    - "rust"
    - "python"

# Additional tools
additionalAgents:
  maven:
    podName: maven
    customJenkinsLabels: maven
    image: maven:3.8.1-jdk-11
    privileged: false
    resources:
      requests:
        cpu: "500m"
        memory: "1Gi"
      limits:
        cpu: "1000m"
        memory: "2Gi"
EOF

# Install Jenkins
echo -e "${YELLOW}🚀 Installing Jenkins...${NC}"
helm upgrade --install jenkins jenkins/jenkins \
  --namespace $JENKINS_NAMESPACE \
  --values jenkins-values.yaml \
  --wait

# Wait for Jenkins to be ready
echo -e "${YELLOW}⏳ Waiting for Jenkins to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=jenkins-controller -n $JENKINS_NAMESPACE --timeout=600s

# Install additional tools in Jenkins
echo -e "${YELLOW}🔧 Installing additional tools...${NC}"
kubectl exec -n $JENKINS_NAMESPACE deployment/jenkins -- bash -c "
  # Install Node.js
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
  
  # Install Rust
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source ~/.cargo/env
  rustup target add wasm32-unknown-unknown
  cargo install wasm-pack
  
  # Install Python
  apt-get update && apt-get install -y python3 python3-pip
  
  # Install Docker CLI
  curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add -
  echo 'deb [arch=amd64] https://download.docker.com/linux/debian bullseye stable' > /etc/apt/sources.list.d/docker.list
  apt-get update && apt-get install -y docker-ce-cli
  
  # Install kubectl
  curl -LO 'https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl'
  chmod +x kubectl && mv kubectl /usr/local/bin/
  
  # Install Helm
  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  
  # Install AWS CLI
  curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o 'awscliv2.zip'
  unzip awscliv2.zip && ./aws/install
  
  # Install Trivy
  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
  
  # Install SonarScanner
  wget https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-4.8.0.2856-linux.zip
  unzip sonar-scanner-cli-4.8.0.2856-linux.zip
  mv sonar-scanner-4.8.0.2856-linux /opt/sonar-scanner
  ln -s /opt/sonar-scanner/bin/sonar-scanner /usr/local/bin/sonar-scanner
" || echo "Some tools installation failed, continuing..."

# Get Jenkins URL and credentials
echo -e "${YELLOW}📋 Getting Jenkins access information...${NC}"
JENKINS_URL=$(kubectl get svc jenkins -n $JENKINS_NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
JENKINS_PASSWORD=$(kubectl get secret jenkins -n $JENKINS_NAMESPACE -o jsonpath="{.data.jenkins-admin-password}" | base64 --decode)

echo -e "${GREEN}🎉 Jenkins installation completed!${NC}"
echo -e "${BLUE}📱 Jenkins Access Information:${NC}"
echo -e "   URL: http://$JENKINS_URL:8080"
echo -e "   Username: admin"
echo -e "   Password: $JENKINS_PASSWORD"

# Create kubeconfig secret for Jenkins
echo -e "${YELLOW}🔑 Creating kubeconfig secret for Jenkins...${NC}"
kubectl config view --raw > /tmp/kubeconfig
kubectl create secret generic kubeconfig-file \
  --from-file=config=/tmp/kubeconfig \
  -n $JENKINS_NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -
rm /tmp/kubeconfig

# Create additional secrets for CI/CD
echo -e "${YELLOW}🔐 Creating additional secrets...${NC}"

# Create Docker registry secret
kubectl create secret docker-registry docker-registry-secret \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=your-docker-username \
  --docker-password=your-docker-password \
  --docker-email=your-email@example.com \
  -n $JENKINS_NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f - || echo "Docker secret creation skipped"

# Create GitHub webhook secret
kubectl create secret generic github-webhook-secret \
  --from-literal=secret=$(openssl rand -hex 20) \
  -n $JENKINS_NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

echo -e "${BLUE}📝 Next Steps:${NC}"
echo -e "1. Access Jenkins at the URL above"
echo -e "2. Configure AWS credentials in Jenkins"
echo -e "3. Add GitHub webhook for automatic builds"
echo -e "4. Create a new Pipeline job using the provided Jenkinsfile"
echo -e "5. Configure SonarQube server (if using code quality checks)"
echo -e "6. Set up Slack notifications (optional)"
echo -e "7. Configure email notifications"

# Cleanup
rm jenkins-values.yaml

echo -e "${GREEN}✅ Jenkins setup completed successfully!${NC}"