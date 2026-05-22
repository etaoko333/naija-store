# 🌍 Naija African Caribbean Store — Full Stack DevOps Project

> **Nigerian & African Caribbean e-commerce platform deployed on AWS using Terraform, ECS Fargate, and GitHub Actions CI/CD.**
> Built and maintained by TOVADEL DevOps Academy.

---

## Architecture Overview

```
Web Client → Route 53 → CloudFront → S3 (static)
                            ↓
                    API Gateway (JWT auth via Cognito)
                            ↓
                    ALB (internet-facing, dual AZ)
                         ↙      ↘
               AZ1 ECS/Fargate   AZ2 ECS/Fargate
                     ↓                  ↓
               DynamoDB (private db subnets)
                            ↕
                         ECR (images)
                         CloudWatch (observability)
```

---

## Project Structure

```
naija-store/
├── terraform/
│   ├── main.tf                         # Provider, backend config
│   ├── variables.tf                    # All input variables
│   ├── outputs.tf                      # Resource outputs (URLs, ARNs)
│   ├── vpc.tf                          # VPC, subnets, IGW, NAT, VPC endpoints
│   ├── s3_cloudfront.tf                # S3 static bucket + CloudFront CDN
│   ├── ecs.tf                          # ECR, ALB, ECS cluster, task def, service, autoscaling
│   ├── dynamodb.tf                     # Products, Orders, Users tables
│   └── cognito_apigw_route53_cw.tf     # Cognito, API Gateway, Route53, ACM, CloudWatch
│
├── app/
│   ├── src/
│   │   ├── App.jsx                     # Root component + routing
│   │   ├── hooks/useCart.js            # Cart context (React Context + useReducer)
│   │   ├── utils/products.js           # Nigerian food product catalogue
│   │   └── components/                 # Header, Hero, ProductGrid, Cart, Footer
│   ├── Dockerfile                      # Multi-stage build (Node 20 Alpine)
│   └── package.json
│
├── .github/
│   └── workflows/
│       └── deploy.yml                  # CI/CD: lint → plan → build → deploy static → deploy ECS
│
└── README.md                           # This file
```

---

## Infrastructure (Terraform)

### Resources Provisioned

| Service | Purpose | Config |
|---|---|---|
| VPC | Isolated network | 10.0.0.0/16, 2 AZs |
| Public Subnets (×2) | ALB only | 10.0.101–102.0/24 |
| Private App Subnets (×2) | ECS Fargate | 10.0.1–2.0/24 |
| Private DB Subnets (×2) | DynamoDB endpoint | 10.0.3–4.0/24 |
| NAT Gateways (×2) | Outbound from private | One per AZ (HA) |
| Amazon ECR | Container image registry | Scan on push, lifecycle 10 images |
| Amazon ECS + Fargate | Serverless compute | 512 CPU / 1024 MB, desired 2 |
| ALB | Traffic distribution | Multi-AZ, HTTPS only |
| ACM | TLS certificate | DNS-validated, wildcard |
| Route 53 | DNS routing | Apex + www → CloudFront |
| CloudFront | CDN (static content) | PriceClass_100, OAC → S3 |
| Amazon S3 | Static assets + backups | Versioned, SSE-AES256, private |
| Amazon Cognito | Authentication | Email, MFA optional, JWT |
| API Gateway v2 | API routing + auth | JWT authorizer, CORS configured |
| DynamoDB (×3) | Products, Orders, Users | PAY_PER_REQUEST, PITR, GSIs |
| CloudWatch | Monitoring + alarms | Dashboard, CPU alarm, 5xx alarm |
| SNS | Alert notifications | Email alerts |

### Deploy Infrastructure

```bash
# 1. Prerequisites
brew install terraform awscli
aws configure --profile naija-store   # set eu-west-2 as default region

# 2. Bootstrap state bucket (one-time, before backend init)
aws s3 mb s3://naija-store-terraform-state --region eu-west-2
aws s3api put-bucket-versioning \
  --bucket naija-store-terraform-state \
  --versioning-configuration Status=Enabled

# 3. Initialise Terraform
cd terraform
terraform init

# 4. Review plan
terraform plan -out=tfplan

# 5. Apply infrastructure
terraform apply tfplan

# 6. Read outputs
terraform output
```

### Key Outputs

```bash
terraform output store_url              # → https://naijaafricaribstore.co.uk
terraform output ecr_repository_url    # → 123456789.dkr.ecr.eu-west-2.amazonaws.com/naija-store-app
terraform output ecs_cluster_name      # → naija-store-cluster
terraform output cloudwatch_dashboard  # → CloudWatch console URL
```

---

## CI/CD Pipeline (GitHub Actions)

### Pipeline Flow

```
push → main
   │
   ├─ Job 1: lint-test        ← eslint + jest + coverage
   │
   ├─ Job 2: build-push       ← Docker multi-stage build → ECR push → Trivy scan
   │
   ├─ Job 3: deploy-static    ← npm build → S3 sync → CloudFront invalidation
   │
   └─ Job 4: deploy-ecs       ← ECS task def update → rolling deploy → stability wait


PR → main
   │
   └─ terraform-plan          ← fmt check + validate + plan → PR comment
```

### GitHub Secrets Required

| Secret | Description |
|---|---|
| `AWS_ACCOUNT_ID` | AWS account number |
| `COGNITO_USER_POOL_ID` | From `terraform output cognito_user_pool_id` |
| `COGNITO_CLIENT_ID` | From `terraform output cognito_client_id` |
| `API_GATEWAY_URL` | From `terraform output api_gateway_endpoint` |
| `STATIC_BUCKET` | From `terraform output static_bucket_name` |
| `CLOUDFRONT_DISTRIBUTION_ID` | From AWS console / terraform output |

### IAM OIDC Role (keyless auth — no long-lived keys)

```bash
# Create OIDC provider for GitHub in your AWS account
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create the role with trust policy for your repo
# Replace YOUR_GITHUB_ORG/naija-store with your actual repo
```

---

## Docker — Multi-Stage Build

```dockerfile
# Stage 1: Build React (Vite) → optimised static dist/
FROM node:20-alpine AS frontend-build
...
RUN npm run build

# Stage 2: Lean production image (Node API + static files)
FROM node:20-alpine AS production
...
COPY --from=frontend-build /build/dist ./public
CMD ["node", "server/index.js"]
```

### Build & Push Manually

```bash
# Authenticate to ECR
aws ecr get-login-password --region eu-west-2 | \
  docker login --username AWS \
  --password-stdin 123456789.dkr.ecr.eu-west-2.amazonaws.com

# Build
docker build -t naija-store-app ./app

# Tag
docker tag naija-store-app:latest \
  123456789.dkr.ecr.eu-west-2.amazonaws.com/naija-store-app:latest

# Push
docker push \
  123456789.dkr.ecr.eu-west-2.amazonaws.com/naija-store-app:latest
```

---

## DynamoDB — Data Schema

### Products Table

```json
{
  "productId": "yam-001",            // PK (S)
  "name": "Premium Puna Yam",
  "category": "Vegetables & Tubers", // GSI hash key
  "price": 8.99,
  "unit": "per tuber",
  "description": "...",
  "origin": "Benue State, Nigeria",
  "inStock": true,
  "rating": 4.9,
  "reviews": 312,
  "createdAt": "2024-01-15T10:00:00Z" // GSI range key
}
```

### Sample Products Seeded

| ID | Name | Category | Price |
|---|---|---|---|
| yam-001 | Premium Puna Yam | Vegetables & Tubers | £8.99 |
| okro-001 | Fresh Okro | Vegetables & Tubers | £2.99 |
| chk-001 | Whole Broiler Chicken | Meat & Poultry | £12.99 |
| beef-001 | Beef Chuck Cut | Meat & Poultry | £10.99 |
| goat-001 | Goat Meat (Asun) | Meat & Poultry | £14.99 |
| egusi-001 | Egusi Melon Seeds | Spices & Condiments | £5.99 |
| suya-001 | Suya Spice Mix | Spices & Condiments | £3.99 |
| garri-001 | Yellow Garri | Grains & Flour | £3.49 |

---

## Monitoring & Observability

```bash
# View ECS service logs
aws logs tail /ecs/naija-store --follow --region eu-west-2

# Check ECS service status
aws ecs describe-services \
  --cluster naija-store-cluster \
  --services naija-store-service \
  --region eu-west-2 \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# View recent CloudWatch alarms
aws cloudwatch describe-alarms \
  --state-value ALARM \
  --region eu-west-2

# List running tasks
aws ecs list-tasks \
  --cluster naija-store-cluster \
  --service-name naija-store-service \
  --region eu-west-2
```

### Alarm Thresholds

| Alarm | Threshold | Action |
|---|---|---|
| ECS CPU High | > 85% for 4 min | SNS email alert |
| ALB 5xx Errors | > 10 in 60s | SNS email alert |
| ECS Auto-scaling | CPU > 70% | Scale out (max 10 tasks) |

---

## Key DevOps Metrics

- **Deployment time**: < 8 minutes end-to-end (build → live)
- **Zero-downtime deployments**: Rolling update with circuit breaker + rollback
- **Infrastructure drift**: 100% IaC — no manual changes
- **Security**: No long-lived AWS keys, OIDC ONLY, Trivy image scanning, Cognito JWT auth
- **HA**: Dual-AZ ECS + DynamoDB, NAT per AZ, ALB multi-AZ

---

## Troubleshooting

| Issue | Fix |
|---|---|
| ECS task not starting | `aws ecs describe-tasks` — check image URI + IAM roles |
| ALB 502/504 | Check health check path `/api/health` — verify app port 3000 |
| CloudFront serving stale content | Run `aws cloudfront create-invalidation --paths "/*"` |
| Terraform state lock | `terraform force-unlock <LOCK_ID>` |
| ECR push access denied | Re-run `aws ecr get-login-password` — token expires in 12h |
| DynamoDB throttling | Table is PAY_PER_REQUEST — contact AWS if consistent |

---

## Next Steps

- [ ] Add Stripe / Paystack payment integration
- [ ] Implement full order management in DynamoDB
- [ ] Add product search with OpenSearch
- [ ] Enable WAF on CloudFront for DDoS protection
- [ ] Set up AWS Backup for DynamoDB PITR snapshots
- [ ] Add staging environment with Terraform workspaces
- [ ] Implement Blue/Green deployment with CodeDeploy

---

*Project by TOVADEL DevOps Academy — training the next generation of UK DevOps engineers.*
