# Azure DevOps MCP Server with mcpo Integration Guide

## Summary

✅ **a) Will it work?** YES! Your ADO MCP server supports stdio mode and is ready for mcpo integration.

✅ **b) Config updates completed** - Your server now runs with stdio transport wrapped by mcpo for HTTP access.

✅ **c) Simplified architecture** - Clean stdio interface with mcpo HTTP wrapper.

✅ **d) Getting started** - Follow the steps below!

## Architecture Overview

```
MCP Client ←→ mcpo (HTTP proxy) ←→ ADO MCP Server (stdio) ←→ Azure DevOps API
              (port 8000)            (stdio transport)
```

The server runs in **stdio mode only**, with mcpo providing HTTP access for remote clients.

## Supported Modes

### Mode 1: Local stdio (Direct)
```bash
# Direct stdio communication (local only)
./scripts/start-stdio.sh
# OR
node build/index.js
```

### Mode 2: Containerized stdio with mcpo HTTP wrapper
```bash
# Using main run script with mcpo flag
./scripts/run.sh --mcpo

# OR using run-local script with mcpo flag  
./scripts/run-local.sh --mcpo

# OR using docker-compose
docker-compose -f docker-compose.mcpo.yml up
```

## Getting Started

### Step 1: Install mcpo (if running manually)

```bash
# Option 1: Using uv (recommended)
pip install uv
uvx mcpo

# Option 2: Using pip
pip install mcpo
```

### Step 2: Choose your deployment mode

#### Option A: Quick Start with Docker Compose
```bash
# Easiest option - everything configured
docker-compose -f docker-compose.mcpo.yml up
```

#### Option B: Using run scripts
```bash
# Start containerized server with mcpo wrapper
./scripts/run.sh --mcpo

# OR for local container development
./scripts/run-local.sh --mcpo
```

#### Option C: Manual setup
```bash
# Start stdio server locally
./scripts/start-stdio.sh

# In another terminal, start mcpo (pointing to the stdio process)
mcpo --port 8000 --api-key "your-secret-key" node build/index.js
```

### Step 3: Access the MCP server

Once running with mcpo, your server will be available at:
- HTTP API: http://localhost:8000
- Health check: http://localhost:8000/health
- OpenAPI docs: http://localhost:8000/docs

## Configuration

### Environment Variables

Required for all modes:
```bash
ADO_ORGANIZATION=your-organization
ADO_PROJECT=your-project  
ADO_PAT=your-personal-access-token
```

Optional for mcpo mode:
```bash
API_KEY=your-api-key            # Default: "default-key"
MCPO_PORT=8000                  # Default: 8000
MCPO_HOST=0.0.0.0              # Default: 0.0.0.0
```

### Docker Compose Configuration

Edit `docker-compose.mcpo.yml` to customize:
```yaml
version: '3.8'
services:
  ado-mcp-mcpo:
    build:
      context: .
      dockerfile: Dockerfile.mcpo
    ports:
      - "8000:8000"
    environment:
      - ADO_ORGANIZATION=your-organization
      - ADO_PROJECT=your-project
      - ADO_PAT=your-personal-access-token
      - API_KEY=your-secret-key
```

## Testing the Integration

### Test stdio mode (local)
```bash
# Start the server
./scripts/start-stdio.sh

# Test with MCP inspector
npx @modelcontextprotocol/inspector build/index.js
```

### Test mcpo HTTP mode
```bash
# Start with mcpo wrapper
./scripts/run.sh --mcpo

# Test HTTP endpoint
curl http://localhost:8000/health

# Test with HTTP client libraries or MCP clients
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Check what's using port 8000
   lsof -i :8000
   # Or use a different port
   API_KEY=test mcpo --port 8001 node build/index.js
   ```

2. **Permission errors with Docker**
   ```bash
   # Make sure Docker is running
   docker --version
   # Check Docker permissions
   docker ps
   ```

3. **Environment variables not set**
   ```bash
   # Create a .env file or use config file
   export ADO_ORGANIZATION="your-org"
   export ADO_PROJECT="your-project"  
   export ADO_PAT="your-token"
   ```

4. **Build not found**
   ```bash
   # Make sure to build first
   npm run build
   ```

## Advanced Configuration

### Custom mcpo Options

When running manually, you can customize mcpo behavior:
```bash
mcpo \
  --port 8000 \
  --host 0.0.0.0 \
  --api-key "secure-key" \
  --cors-allow-origins "*" \
  --log-level info \
  node build/index.js
```

### Using with Different MCP Clients

The mcpo wrapper makes your server compatible with:
- LLM tools that expect HTTP APIs
- Web-based MCP clients  
- API testing tools (Postman, curl, etc.)
- Custom integrations via HTTP

## Available MCP Tools (via REST API)

Your ADO server exposes these tools via mcpo:
- `projects` - List and search Azure DevOps projects
- `repositories` - Manage repositories  
- `workItems` - Query and manage work items
- `pullRequests` - Handle pull requests
- `pipelines` - Manage build pipelines
- `releaseNotes` - Generate release notes
- `wiqlQuery` - Execute WIQL queries

## Migration Notes

If you were previously using HTTP/SSE mode:
1. All HTTP/SSE functionality has been removed
2. Use mcpo wrapper for HTTP access instead
3. Update your client configurations to use port 8000 (mcpo) instead of 8001
4. The underlying MCP server now only supports stdio transport

This new architecture is simpler, more reliable, and follows MCP best practices.

Your ADO MCP server is now ready for production use with mcpo! 🚀
