#!/bin/bash

echo "🚀 Starting ADO MCP Server with MCPO for VS Code testing..."

# Check if Docker is running
if ! docker ps >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if port 8000 is available
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 8000 is already in use. Stopping existing processes..."
    docker-compose -f docker-compose.mcpo.yml down
    sleep 2
fi

echo "📦 Building and starting containers..."
docker-compose -f docker-compose.mcpo.yml up --build

# Check if the container is still running
if docker-compose -f docker-compose.mcpo.yml ps | grep -q "Up"; then
    echo "✅ ADO MCP Server with MCPO should now be running on http://localhost:8000"
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
else
    echo "❌ Failed to start ADO MCP Server with MCPO"
    echo "Check the logs above for error details"
    exit 1
fi
