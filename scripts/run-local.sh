#!/bin/bash
set -e

# Azure DevOps MCP Server - Containerized Stdio Mode
# Runs the MCP server in Docker container with stdio interface
# Optionally supports mcpo HTTP wrapper for remote access

# Parse command line arguments
CONFIG_PATH=""
INTERACTIVE=true
USE_MCPO=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --config) CONFIG_PATH="$2"; shift ;;
        --non-interactive) INTERACTIVE=false ;;
        --mcpo) USE_MCPO=true ;;
        --help) 
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --config PATH        Path to azuredevops.json config file"
            echo "  --non-interactive    Run without TTY allocation"
            echo "  --mcpo               Use mcpo HTTP wrapper for remote access"
            echo "  --help               Show this help message"
            exit 0
            ;;
        *) echo "Unknown parameter: $1. Use --help for usage."; exit 1 ;;
    esac
    shift
done

# Setup colored output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ "$USE_MCPO" = true ]; then
    # MCPO mode - MCP server with HTTP wrapper
    echo -e "${BLUE}Starting containerized MCP server with mcpo HTTP wrapper...${NC}"
    
    # Check if docker-compose.mcpo.yml exists
    if [ ! -f "docker-compose.mcpo.yml" ]; then
        echo -e "${YELLOW}docker-compose.mcpo.yml not found. Building mcpo container directly...${NC}"
        
        # Check if the mcpo Docker image exists
        if ! docker image inspect azure-devops-mcp:mcpo &>/dev/null; then
            echo "MCPO Docker image not found. Building it first..."
            docker build -f Dockerfile.mcpo -t azure-devops-mcp:mcpo .
        fi
        
        # Run with mcpo wrapper
        docker run --rm -it -p 8000:8000 \
            -e ADO_ORGANIZATION="${ADO_ORGANIZATION:-DFIN}" \
            -e ADO_PROJECT="${ADO_PROJECT:-Sledgehammer}" \
            -e ADO_PAT="${ADO_PAT}" \
            azure-devops-mcp:mcpo
        exit 0
    else
        echo "Using docker-compose for mcpo setup..."
        docker-compose -f docker-compose.mcpo.yml up
        exit 0
    fi
fi

# Standard Docker stdio mode
# Check if the Docker image exists
if ! docker image inspect azure-devops-mcp:local &>/dev/null; then
    echo "Local Docker image not found. Building it first..."
    ./scripts/build-local.sh
fi

# Determine config path
if [ -z "$CONFIG_PATH" ]; then
    if [ -f "./config/azuredevops.json" ]; then
        CONFIG_PATH="./config/azuredevops.json"
        echo -e "${BLUE}Using config:${NC} $CONFIG_PATH"
    else
        echo -e "${YELLOW}No config file found. Using environment variables or example config.${NC}"
    fi
else
    echo -e "${BLUE}Using config:${NC} $CONFIG_PATH"
fi

# Extract environment variables from config if it exists
if [ -n "$CONFIG_PATH" ] && [ -f "$CONFIG_PATH" ]; then
    # Use jq to extract values if available, otherwise use grep
    if command -v jq &>/dev/null; then
        ORGANIZATION=$(jq -r '.organization // "your-organization"' "$CONFIG_PATH")
        PROJECT=$(jq -r '.project // "your-project"' "$CONFIG_PATH")
        PAT=$(jq -r '.credentials.pat // "your-personal-access-token"' "$CONFIG_PATH")
    else
        ORGANIZATION=$(grep -o '"organization"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_PATH" | cut -d'"' -f4)
        PROJECT=$(grep -o '"project"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_PATH" | cut -d'"' -f4)
        PAT=$(grep -o '"pat"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_PATH" | cut -d'"' -f4)
    fi
fi

# Set environment variables for Docker
ENV_VARS=()
if [ -n "$ORGANIZATION" ] && [ "$ORGANIZATION" != "your-organization" ]; then
    ENV_VARS+=("-e" "ADO_ORGANIZATION=$ORGANIZATION")
fi
if [ -n "$PROJECT" ] && [ "$PROJECT" != "your-project" ]; then
    ENV_VARS+=("-e" "ADO_PROJECT=$PROJECT")
fi
if [ -n "$PAT" ] && [ "$PAT" != "your-personal-access-token" ]; then
    ENV_VARS+=("-e" "ADO_PAT=$PAT")
fi

# Add config volume if config path is specified
VOLUMES=()
if [ -n "$CONFIG_PATH" ] && [ -f "$CONFIG_PATH" ]; then
    CONFIG_DIR=$(dirname "$CONFIG_PATH")
    CONFIG_FILE=$(basename "$CONFIG_PATH")
    VOLUMES+=("-v" "$CONFIG_DIR:/app/config")
fi

# Run the Docker container (stdio mode)
echo -e "${GREEN}Starting Azure DevOps MCP server in Docker (stdio mode)...${NC}"

if [ "$INTERACTIVE" = true ]; then
    # Interactive mode with TTY
    docker run --rm -it "${ENV_VARS[@]}" "${VOLUMES[@]}" azure-devops-mcp:local
else
    # Non-interactive mode
    docker run --rm "${ENV_VARS[@]}" "${VOLUMES[@]}" azure-devops-mcp:local
fi
