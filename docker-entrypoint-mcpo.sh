#!/bin/bash
set -e

echo "Starting Azure DevOps MCP Server with mcpo wrapper..."

# Set default values for environment variables
export ADO_ORGANIZATION=${ADO_ORGANIZATION:-"DFIN"}
export ADO_PROJECT=${ADO_PROJECT:-"Sledgehammer"}
export ADO_PAT=${ADO_PAT:-""}
export API_KEY=${API_KEY:-"default-key"}

# Validate required environment variables
if [ -z "$ADO_PAT" ]; then
    echo "Error: ADO_PAT environment variable is required"
    exit 1
fi

echo "Configuration:"
echo "  ADO Organization: $ADO_ORGANIZATION"
echo "  ADO Project: $ADO_PROJECT" 
echo "  API Key: [HIDDEN]"
echo "  ADO PAT: [HIDDEN]"

# Start mcpo with the stdio MCP server
echo "Starting mcpo HTTP wrapper on port 8000..."
exec mcpo \
    --port 8000 \
    --host 0.0.0.0 \
    --api-key "$API_KEY" \
    --cors-allow-origins "*" \
    node build/index.js
