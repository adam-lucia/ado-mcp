@echo off
REM Start ADO MCP Stdio Server
REM This script starts the stdio version of the Azure DevOps MCP Server

echo Starting Azure DevOps MCP Stdio Server...

REM Azure DevOps configuration
set ADO_ORGANIZATION=DFIN
set ADO_PROJECT=Sledgehammer
set ADO_PAT=22fv3QebKTN4AwfbS36J9D3BvryTCtQp5PCvRWlLxbstr1bx3u93JQQJ99BEACAAAAAsqooHAAASAZDO4bDv
set ADO_API_RETRY_MAX=3
set ADO_API_RETRY_DELAY=1000
set ADO_API_RETRY_BACKOFF=2

echo Configuration:
echo   ADO Organization: %ADO_ORGANIZATION%
echo   ADO Project: %ADO_PROJECT%

REM Start the stdio server
node build\index.js
