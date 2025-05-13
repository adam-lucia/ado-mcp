import { z } from 'zod';
import { ADOApiClient } from '../api/index.js';
import { Tool, ToolDefinition } from './registry.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { createError, ErrorCategory, handleApiError } from '../api/utils/error.utils.js';

/**
 * Base class for entity tools
 * Provides common functionality for all entity tools
 */
export abstract class EntityTool implements Tool {
  protected apiClient: ADOApiClient;
  protected name: string;
  protected description: string;
  protected operations: Record<string, (params: any) => Promise<any>>;
  protected schemas: Record<string, z.ZodType<any>>;

  /**
   * Create a new entity tool
   * @param apiClient API client
   * @param name Tool name
   * @param description Tool description
   */
  constructor(apiClient: ADOApiClient, name: string, description: string) {
    this.apiClient = apiClient;
    this.name = name;
    this.description = description;
    this.operations = {};
    this.schemas = {};
  }

  /**
   * Get the tool definition with enhanced descriptions
   * @returns Tool definition
   */
  getDefinition(): ToolDefinition {
    // Build input schema based on registered operations
    const properties: Record<string, any> = {
      operation: {
        type: 'string',
        enum: Object.keys(this.operations),
        description: 'Operation to perform',
      },
    };

    // Add operation-specific parameters with enhanced descriptions
    for (const operation of Object.keys(this.operations)) {
      const schema = this.schemas[operation];
      let schemaProperties: Record<string, any> = {};
      let schemaRequired: string[] = [];
      
      if (schema instanceof z.ZodObject) {
        const schemaDescription = this.generateSchemaDescription(schema);
        schemaProperties = schemaDescription.properties;
        schemaRequired = schemaDescription.required;
      }
      
      properties[`${operation}Params`] = {
        type: 'object',
        description: this.operationDescriptions?.[operation] || `Parameters for ${operation} operation`,
        properties: schemaProperties,
        required: schemaRequired,
      };
    }

    // Create enhanced description with examples
    const enhancedDescription = this.generateEnhancedDescription();

    return {
      name: this.name,
      description: enhancedDescription,
      inputSchema: {
        type: 'object',
        properties,
        required: ['operation'],
        additionalProperties: false,
      },
    };
  }

  /**
   * Generate enhanced description with examples
   * @returns Enhanced description
   */
  private generateEnhancedDescription(): string {
    // Start with the base description
    let description = this.description;
    
    // Add available operations
    const operations = Object.keys(this.operations);
    if (operations.length > 0) {
      description += `\n\nAvailable operations:\n`;
      
      for (const operation of operations) {
        const opDescription = this.operationDescriptions?.[operation] || `${operation} operation`;
        description += `- ${operation}: ${opDescription}\n`;
      }
    }
    
    // Add examples if available
    if (this.generateExamples) {
      const examples = this.generateExamples();
      if (examples && examples.length > 0) {
        description += `\n\nExamples:\n`;
        
        for (const example of examples) {
          description += `\n${example}\n`;
        }
      }
    }
    
    return description;
  }
  
  /**
   * Generate examples for the tool
   * This can be overridden by subclasses to provide specific examples
   * @returns Array of example strings
   */
  protected generateExamples(): string[] {
    return [];
  }
  
  /**
   * Generate schema description from Zod schema
   * @param schema Zod schema
   * @returns Schema description
   */
  private generateSchemaDescription(schema: z.ZodObject<any>): { 
    properties: Record<string, any>; 
    required: string[];
  } {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    
    try {
      // Extract shape from schema
      const shape = schema._def.shape();
      
      // Process each property
      for (const [key, value] of Object.entries(shape)) {
        const fieldDef = (value as any)._def;
        
        // Check if required
        if (!('isOptional' in fieldDef)) {
          required.push(key);
        }
        
        // Get property type and description
        let type = 'string';
        let description = '';
        let enumValues: any[] | undefined = undefined;
        
        if (fieldDef.typeName === 'ZodString') {
          type = 'string';
        } else if (fieldDef.typeName === 'ZodNumber') {
          type = 'number';
        } else if (fieldDef.typeName === 'ZodBoolean') {
          type = 'boolean';
        } else if (fieldDef.typeName === 'ZodArray') {
          type = 'array';
        } else if (fieldDef.typeName === 'ZodObject') {
          type = 'object';
        } else if (fieldDef.typeName === 'ZodEnum') {
          type = 'string';
          enumValues = fieldDef.values;
        }
        
        // Get description from metadata
        if ((value as any).description) {
          description = (value as any).description;
        }
        
        // Create property definition
        properties[key] = {
          type,
          description,
        };
        
        // Add enum values if available
        if (enumValues) {
          properties[key].enum = enumValues;
        }
      }
      
      return { properties, required };
    } catch (error) {
      console.warn('Error generating schema description:', error);
      return { properties: {}, required: [] };
    }
  }

  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Tool result
   */
  async execute(args: unknown): Promise<any> {
    try {
      // Validate basic structure
      const baseSchema = z.object({
        operation: z.string(),
      }).passthrough();
      
      const baseParams = baseSchema.parse(args);
      const operation = baseParams.operation;
      
      // Check if operation exists
      if (!this.operations[operation]) {
        throw createError(
          ErrorCode.InvalidParams,
          `Invalid operation: ${operation}`,
          {
            category: ErrorCategory.Validation,
            source: this.name,
            operation: 'execute',
            details: {
              availableOperations: Object.keys(this.operations),
              troubleshooting: `Available operations: ${Object.keys(this.operations).join(', ')}`
            }
          }
        );
      }
      
      // Get operation-specific parameters
      const paramsKey = `${operation}Params`;
      const operationParams = (args as any)[paramsKey] || {};
      
      // Validate operation-specific parameters
      const schema = this.schemas[operation];
      const validParams = schema ? schema.parse(operationParams) : operationParams;
      
      // Execute operation
      const result = await this.operations[operation](validParams);
      
      // Format result
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Invalid parameters: ${error.message}`,
                details: error.errors.map(err => ({
                  path: err.path.join('.'),
                  message: err.message,
                  code: err.code
                }))
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
      
      if (error instanceof McpError) {
        throw error;
      }
      
      throw handleApiError(error, this.name, `execute_${args && typeof args === 'object' && 'operation' in args ? (args as any).operation : 'unknown'}`);
    }
  }

  /**
   * Register an operation
   * @param operation Operation name
   * @param handler Operation handler
   * @param schema Schema for operation parameters
   * @param description Operation description
   */
  protected registerOperation(
    operation: string,
    handler: (params: any) => Promise<any>,
    schema?: z.ZodType<any>,
    description?: string
  ): void {
    this.operations[operation] = handler;
    if (schema) {
      this.schemas[operation] = schema;
    } else {
      // Default to empty object schema if none provided
      this.schemas[operation] = z.object({}).passthrough();
    }
    
    // Store operation description for better tool documentation
    if (description) {
      if (!this.operationDescriptions) {
        this.operationDescriptions = {};
      }
      this.operationDescriptions[operation] = description;
    }
  }
  
  /**
   * Operation descriptions for better tool documentation
   */
  protected operationDescriptions?: Record<string, string>;
}