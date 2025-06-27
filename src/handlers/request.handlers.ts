/**
 * Azure DevOps MCP Server - Request Handlers
 * 
 * @copyright Copyright (c) 2025 Aaron Bockelie <aaronsb@gmail.com>
 * @license MIT
 */
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ADOApiClient } from '../api/client/index.js';
import { ToolRegistry } from '../tools/registry.js';

/**
 * Register request handlers for the server
 * @param server MCP server
 * @param apiClient API client
 */
export function registerRequestHandlers(server: Server, apiClient: ADOApiClient): void {
  // Create tool registry
  const toolRegistry = new ToolRegistry(apiClient);
  
  // Initialize handler - required for MCP protocol
  server.setRequestHandler(InitializeRequestSchema, async (_request) => {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "azure-devops-mcp-server",
        version: "0.1.0",
      },
    };
  });
  
  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolDefinitions = toolRegistry.getAllToolDefinitions();
    
    return {
      tools: toolDefinitions,
    };
  });
  
  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      return await toolRegistry.executeTool(name, args);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute tool ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
