#!/bin/bash

# Start ADO MCP Stdio Server
# This script starts the stdio version of the Azure DevOps MCP Server

echo "Starting Azure DevOps MCP Stdio Server..."

# Azure DevOps configuration
export ADO_ORGANIZATION="DFIN"
export ADO_PROJECT="Sledgehammer"
export ADO_PAT="22fv3QebKTN4AwfbS36J9D3BvryTCtQp5PCvRWlLxbstr1bx3u93JQQJ99BEACAAAAAsqooHAAASAZDO4bDv"
export ADO_API_RETRY_MAX="3"
export ADO_API_RETRY_DELAY="1000"
export ADO_API_RETRY_BACKOFF="2"

echo "Configuration:"
echo "  ADO Organization: $ADO_ORGANIZATION"
echo "  ADO Project: $ADO_PROJECT"

# Start the stdio server
node build/index.js
