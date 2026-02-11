#!/bin/bash

# Email Notification System Setup Script
# Generates encryption key and updates .env file

echo "📧 Email Notification System Setup"
echo "===================================="
echo ""

# Generate SMTP encryption key (32 bytes = 64 hex characters)
echo "Generating SMTP encryption key..."
SMTP_KEY=$(openssl rand -hex 32)

echo "✅ Generated encryption key: ${SMTP_KEY:0:16}...${SMTP_KEY:48:16}"
echo ""

# Check if .env file exists
if [ ! -f "../../.env" ]; then
    echo "❌ .env file not found!"
    echo "Please create .env file first"
    exit 1
fi

# Add SMTP_ENCRYPTION_KEY to .env if not already present
if grep -q "SMTP_ENCRYPTION_KEY" ../../.env; then
    echo "⚠️  SMTP_ENCRYPTION_KEY already exists in .env"
    echo "Do you want to replace it? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        # Replace existing key
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/^SMTP_ENCRYPTION_KEY=.*/SMTP_ENCRYPTION_KEY=$SMTP_KEY/" ../../.env
        else
            # Linux
            sed -i "s/^SMTP_ENCRYPTION_KEY=.*/SMTP_ENCRYPTION_KEY=$SMTP_KEY/" ../../.env
        fi
        echo "✅ Updated SMTP_ENCRYPTION_KEY in .env"
    else
        echo "Keeping existing key"
    fi
else
    # Add new key
    echo "" >> ../../.env
    echo "# SMTP Email Notification Configuration" >> ../../.env
    echo "SMTP_ENCRYPTION_KEY=$SMTP_KEY" >> ../../.env
    echo "✅ Added SMTP_ENCRYPTION_KEY to .env"
fi

echo ""
echo "📝 Next Steps:"
echo "1. Run the database migration: psql -U sanjayrana -d team_management -f ../../init_email_notifications.sql"
echo "2. Restart the resource-service: cd ../../apps/resource-service && node index.js"
echo "3. Configure SMTP settings in the UI: Administration → Email Settings"
echo ""
echo "✅ Setup complete!"
