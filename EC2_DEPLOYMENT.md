# AWS EC2 Deployment Guide: Team Management System

This guide walk you through deploying the Team Management System on an AWS EC2 instance using Docker Compose.

## 1. Launching an EC2 Instance

1.  **AMI**: Select **Ubuntu 22.04 LTS**.
2.  **Instance Type**: **t3.medium** (minimum 4GB RAM recommended for running multiple microservices & Postgres).
3.  **Key Pair**: Create or select an existing key pair for SSH access.
4.  **Security Group**: Configure the following inbound rules:
    -   SSH (22): Your IP only.
    -   HTTP (80): Anywhere (0.0.0.0/0).
    -   HTTPS (443): Anywhere (optional, if setting up SSL).
    -   Custom TCP (4001, 4002, 4005): If you want to access APIs directly (not recommended for production; use Nginx instead).

## 2. Infrastructure Setup (via SSH)

Once the instance is running, connect via SSH:
```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### Install Docker and Docker Compose
```bash
# Update and install dependencies
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update

# Install Docker
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to the docker group
sudo usermod -aG docker $USER
# Logout and log back in for changes to take effect
exit
```

## 3. Application Deployment

1.  **Clone the Repository**:
    ```bash
    git clone <your-repo-url>
    cd Team_management
    ```

2.  **Environment Configuration**:
    Create a `.env` file based on `.env.example`:
    ```bash
    cp .env.example .env
    nano .env
    ```
    *Update `JWT_SECRET` and other production values.*

3.  **Start Services**:
    ```bash
    docker compose -f docker-compose.prod.yml up -d --build
    ```

## 4. Database Initialization

The database schema and business logic triggers must be initialized:
```bash
# Wait for Postgres to be healthy, then run the initialization script
cat init.sql | docker exec -i team-mgmt-db psql -U postgres -d team_management
```

## 5. Verification

-   **Frontend**: Visit `http://your-ec2-public-ip` in your browser.
-   **Logs**: Check service logs if something isn't working:
    ```bash
    docker compose -f docker-compose.prod.yml logs -f
    ```

## 6. Production Hardening (Next Steps)
-   **Reverse Proxy**: The current setup uses the built-in Nginx in the frontend container. For multi-domain or advanced setups, use a standalone Nginx proxy.
-   **SSL/TLS**: Use [Certbot](https://certbot.eff.org/) with Nginx to enable HTTPS.
-   **Secrets**: Do not commit your `.env` file. Use AWS Secrets Manager or similar for sensitive data.
