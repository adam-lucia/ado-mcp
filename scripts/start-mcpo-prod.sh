#!/bin/bash
set -e

echo "🚀 Starting ADO MCP Server with MCPO (Production Build)..."

# Check if port 8000 is available
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 8000 is already in use. Stopping existing processes..."
    docker-compose -f docker-compose.mcpo.prod.yml down
    sleep 2
fi

echo "📦 Building production container (self-contained)..."
docker-compose -f docker-compose.mcpo.prod.yml up --build

# Check if the container is still running
if docker-compose -f docker-compose.mcpo.prod.yml ps | grep -q "Up"; then
    echo "✅ ADO MCP Server with MCPO (Production) is running on http://localhost:8000"
    echo "🔍 Health check: curl http://localhost:8000/docs"
    echo "📖 API docs: http://localhost:8000/docs"
    echo "🛠️  Available endpoints:"
    echo "   - /projects - List Azure DevOps projects"
    echo "   - /repositories - List repositories"
    echo "   - /workItems - Query work items"
    echo "   - /pipelines - List pipelines"
    echo "   - /pullRequests - List pull requests"
    echo "   - /releaseNotes - Generate release notes"
    echo "   - /wiqlQuery - Execute WIQL queries"
    echo ""
    echo "🔐 API Key: Use 'Authorization: Bearer ${API_KEY:-vscode-test-key}' header"
    echo "📋 Example:"
    echo "   curl -X POST -H 'Authorization: Bearer ${API_KEY:-vscode-test-key}' \\"
    echo "        -H 'Content-Type: application/json' \\"
    echo "        -d '{\"operation\": \"list\", \"listParams\": {\"maxResults\": 5}}' \\"
    echo "        http://localhost:8000/projects"
else
    echo "❌ Failed to start ADO MCP Server with MCPO (Production)"
    echo "Check the logs above for error details"
    exit 1
fi
