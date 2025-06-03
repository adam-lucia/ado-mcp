import { z } from 'zod';
import { WorkItemExpand, WorkItemReference } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi.js';
import { ADOApiClient } from '../api/client/index.js';
import { handleApiError } from '../api/utils/index.js';
import { EntityTool } from './entity-tool.base.js';

// Constants
const WORKITEM_BATCH_SIZE = 200;
const DEFAULT_PROJECT = 'Sledgehammer';

// Define interfaces
interface WorkItem {
  id?: number;
  fields?: Record<string, unknown>;
  relations?: WorkItemRelation[];
}

interface WorkItemRelation {
  rel?: string;
  url?: string;
  attributes?: { name?: string };
}

interface WorkItemFieldMap {
  workItemId: string;
  workItemType: string;
  title: string;
  state: string;
  assignedTo: string;
  iterationPath: string;
  areaPath: string;
  url: string;
  [key: string]: string; // Allow additional fields
}

/**
 * WIQL Query Tool
 * Executes WIQL queries against Azure DevOps work items
 */
export class WiqlQueryTool extends EntityTool {  constructor(apiClient: ADOApiClient) {
    super(apiClient, 'wiqlQuery', 'Execute WIQL queries against Azure DevOps work items');
      // Register operations with enhanced descriptions
    this.registerOperation(
      'query', 
      this.executeQuery.bind(this), 
      z.object({
        wiqlQuery: z.string().describe('WIQL query string to execute against Azure DevOps work items'),
        outputFormat: z.enum(['table', 'csv']).optional().default('table').describe('Output format: table for terminal display or csv for file export'),
        fields: z.array(z.string()).optional().describe('Additional work item fields to include in the output (e.g., ["System.Description", "Custom.ReleaseVersion"])'),
        maxResults: z.number().optional().default(100).describe('Maximum number of work items to return'),
        projectId: z.string().optional().describe('Project ID or name to search in (defaults to current project)')
      }).strict(),
      'Query work items using WIQL and return results in table or CSV format'
    );
    
    this.registerOperation(
      'releaseNotes', 
      this.generateReleaseNotes.bind(this), 
      z.object({
        workItemId: z.number().describe('Work item ID to generate release notes for'),
        interactive: z.boolean().optional().default(true).describe('Whether to prompt user for missing information interactively')
      }).strict(),
      'Generate interactive release notes for a single work item, prompting for missing information'
    );
  }
  
  /**
   * Generate examples for the WIQL query tool
   * @returns Array of example strings
   */  protected generateExamples(): string[] {
    return [
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "wiqlQuery": "SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo] FROM WorkItems WHERE [System.AssignedTo] = \'Adam Lucia\' ORDER BY [System.ChangedDate] DESC",\n    "outputFormat": "table",\n    "maxResults": 50\n  }\n}\n```\nQuery work items assigned to Adam Lucia and display in table format',
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "wiqlQuery": "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.WorkItemType] = \'Bug\' AND [System.State] = \'Active\'",\n    "outputFormat": "csv",\n    "fields": ["System.Description", "System.AssignedTo"]\n  }\n}\n```\nExecute a WIQL query for active bugs and export results to CSV format with additional fields',
      '```json\n{\n  "operation": "releaseNotes",\n  "releaseNotesParams": {\n    "workItemId": 12345,\n    "interactive": true\n  }\n}\n```\nGenerate interactive release notes for work item 12345, prompting for missing information'
    ];
  }  /**
   * Execute a WIQL query
   */
  async executeQuery(params: {
    wiqlQuery: string;
    outputFormat?: 'table' | 'csv';
    fields?: string[];
    maxResults?: number;
    projectId?: string;
  }): Promise<object> {
    try {
      const workItemApi = await this.apiClient.getWorkItemTrackingApi();
      
      console.log('Executing WIQL Query:', params.wiqlQuery);
      
      const queryResult = await workItemApi.queryByWiql({ query: params.wiqlQuery });
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        return {
          message: 'No work items found matching the query',
          query: params.wiqlQuery,
          count: 0,
          workItems: []
        };
      }
      
      console.log(`Found ${queryResult.workItems.length} work items`);
      
      // Get work item IDs
      const workItemIds = queryResult.workItems
        .map((wi: WorkItemReference) => wi.id)
        .filter((id): id is number => id !== undefined);
      
      // Batch process work items to get full details
      const workItems = await this.batchProcessItems(
        workItemIds, 
        workItemApi, 
        WORKITEM_BATCH_SIZE, 
        'work items', 
        WorkItemExpand.Fields
      );
      
      // Determine fields to include
      const defaultFields = [
        'System.Id',
        'System.WorkItemType', 
        'System.Title',
        'System.State',
        'System.AssignedTo',
        'System.IterationPath',
        'System.AreaPath'
      ];
      
      const fieldsToInclude = params.fields ? [...defaultFields, ...params.fields] : defaultFields;
      
      // Map work items to output format
      const mappedWorkItems = workItems.map(wi => this.mapWorkItemToOutput(wi, fieldsToInclude));
        if (params.outputFormat === 'csv') {
        return this.formatAsCsv(mappedWorkItems, fieldsToInclude);
      } else {
        return this.formatAsTable(mappedWorkItems, params.wiqlQuery);
      }
      
    } catch (error) {
      throw handleApiError(error, 'WiqlQueryTool', 'executeQuery');
    }
  }
  /**
   * Generate interactive release notes for a single work item
   */
  async generateReleaseNotes(params: {
    workItemId: number;
    interactive?: boolean;
  }): Promise<object> {
    try {
      const workItemApi = await this.apiClient.getWorkItemTrackingApi();
      
      // Get the work item details
      const workItem = await workItemApi.getWorkItem(params.workItemId, undefined, undefined, WorkItemExpand.All);
      
      if (!workItem) {
        throw new Error(`Work item ${params.workItemId} not found`);
      }
      
      const fields = workItem.fields || {};
      const baseInfo = {
        workItemId: workItem.id?.toString() || '',
        workItemType: (fields['System.WorkItemType'] as string) || '',
        title: (fields['System.Title'] as string) || '',
        state: (fields['System.State'] as string) || '',
        assignedTo: (fields['System.AssignedTo'] as string) || '',
        iterationPath: (fields['System.IterationPath'] as string) || '',
        areaPath: (fields['System.AreaPath'] as string) || '',
        description: (fields['System.Description'] as string) || '',
        url: this.generateWorkItemUrl(workItem.id)
      };
      
      if (params.interactive) {
        return this.promptForReleaseNotesInfo(baseInfo);
      } else {
        return {
          ...baseInfo,
          message: 'Basic work item information retrieved. Use interactive mode to provide additional release notes details.'
        };
      }
      
    } catch (error) {
      throw handleApiError(error, 'WiqlQueryTool', 'generateReleaseNotes');
    }
  }
  /**
   * Batch process work items similar to release notes tool
   */
  private async batchProcessItems(
    itemIds: number[], 
    api: IWorkItemTrackingApi, 
    batchSize: number, 
    itemType: string, 
    expand?: WorkItemExpand
  ): Promise<WorkItem[]> {
    const allItems: WorkItem[] = [];
    const MAX_RETRIES = 3;
    
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      console.log(`Processing batch ${batchNumber}: ${batch.length} ${itemType} (${i + 1}-${Math.min(i + batchSize, itemIds.length)} of ${itemIds.length})`);
      
      let success = false;
      let retryCount = 0;
      
      while (!success && retryCount < MAX_RETRIES) {
        try {
          const expandParam = expand || WorkItemExpand.Fields;
          const batchItems = await api.getWorkItems(batch, undefined, undefined, expandParam);
          
          if (batchItems && batchItems.length > 0) {
            allItems.push(...batchItems);
            console.log(`Batch ${batchNumber} retrieved ${batchItems.length} ${itemType}`);
            success = true;
          } else {
            console.warn(`Batch ${batchNumber} returned no ${itemType}`);
            success = true; // Consider it done even though we got no results
          }
        } catch (batchError) {
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            console.error(`Error processing ${itemType} batch ${batchNumber} after ${MAX_RETRIES} retries:`, batchError);
            success = true; // Move on to prevent infinite loop
          } else {
            console.warn(`Retrying batch ${batchNumber} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          }
        }
      }
    }
    
    console.log(`Batch processing complete. Retrieved ${allItems.length} ${itemType} total`);
    return allItems;
  }

  /**
   * Map work item to output format
   */
  private mapWorkItemToOutput(workItem: WorkItem, fields: string[]): WorkItemFieldMap {
    const output: WorkItemFieldMap = {
      workItemId: workItem.id?.toString() || '',
      workItemType: '',
      title: '',
      state: '',
      assignedTo: '',
      iterationPath: '',
      areaPath: '',
      url: this.generateWorkItemUrl(workItem.id)
    };
    
    if (workItem.fields) {
      for (const field of fields) {
        const value = workItem.fields[field];
        let stringValue = '';
        
        if (value !== null && value !== undefined) {
          if (typeof value === 'object') {
            stringValue = JSON.stringify(value);
          } else {
            stringValue = value.toString();
          }
        }
        
        // Map common fields to standard names
        switch (field) {
          case 'System.Id':
            output.workItemId = stringValue;
            break;
          case 'System.WorkItemType':
            output.workItemType = stringValue;
            break;
          case 'System.Title':
            output.title = stringValue;
            break;
          case 'System.State':
            output.state = stringValue;
            break;
          case 'System.AssignedTo':
            output.assignedTo = stringValue;
            break;
          case 'System.IterationPath':
            output.iterationPath = stringValue;
            break;
          case 'System.AreaPath':
            output.areaPath = stringValue;
            break;
          default:
            // Add custom fields with sanitized names
            const sanitizedField = field.replace(/[^a-zA-Z0-9]/g, '_');
            output[sanitizedField] = stringValue;
            break;
        }
      }
    }
    
    return output;
  }
  /**
   * Format results as a table for terminal display
   */
  private formatAsTable(workItems: WorkItemFieldMap[], query: string): object {
    return {
      message: `Found ${workItems.length} work items`,
      query: query,
      count: workItems.length,
      format: 'table',
      workItems: workItems,
      displayInstructions: 'Results are formatted for table display. Each work item includes ID, type, title, state, assigned to, iteration path, area path, and URL.'
    };
  }
  /**
   * Format results as CSV
   */
  private formatAsCsv(workItems: WorkItemFieldMap[], fields: string[]): object {
    if (workItems.length === 0) {
      return {
        message: 'No work items found',
        count: 0,
        format: 'csv',
        csvHeaders: [],
        csvData: ''
      };
    }
    
    // Use the field names as headers, mapping system fields to friendly names
    const headers = fields.map(field => {
      switch (field) {
        case 'System.Id': return 'Work Item ID';
        case 'System.WorkItemType': return 'Type';
        case 'System.Title': return 'Title';
        case 'System.State': return 'State';
        case 'System.AssignedTo': return 'Assigned To';
        case 'System.IterationPath': return 'Iteration';
        case 'System.AreaPath': return 'Area';
        default: return field;
      }
    });
    
    // Add URL header
    headers.push('URL');
    
    // Generate CSV content
    let csvContent = headers.join(',') + '\n';
    
    for (const item of workItems) {
      const row = [
        this.escapeCsvValue(item.workItemId),
        this.escapeCsvValue(item.workItemType),
        this.escapeCsvValue(item.title),
        this.escapeCsvValue(item.state),
        this.escapeCsvValue(item.assignedTo),
        this.escapeCsvValue(item.iterationPath),
        this.escapeCsvValue(item.areaPath),
        this.escapeCsvValue(item.url)
      ];
      
      // Add any additional fields
      for (const field of fields) {
        if (!['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.AssignedTo', 'System.IterationPath', 'System.AreaPath'].includes(field)) {
          const sanitizedField = field.replace(/[^a-zA-Z0-9]/g, '_');
          row.splice(row.length - 1, 0, this.escapeCsvValue(item[sanitizedField] || ''));
        }
      }
      
      csvContent += row.join(',') + '\n';
    }
    
    return {
      message: `Generated CSV for ${workItems.length} work items`,
      count: workItems.length,
      format: 'csv',
      csvHeaders: headers,
      csvData: csvContent,
      instructions: 'Copy the csvData content to a .csv file to view in Excel or other spreadsheet applications'
    };
  }

  /**
   * Escape CSV values
   */
  private escapeCsvValue(value: string): string {
    if (!value) return '';
    
    // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    
    return value;
  }

  /**
   * Generate work item URL
   */
  private generateWorkItemUrl(workItemId?: number): string {
    if (!workItemId) return '';
    
    const organization = this.apiClient.getOrganization();
    const project = this.apiClient.getProject() || DEFAULT_PROJECT;
    return `https://dev.azure.com/${organization}/${project}/_workitems/edit/${workItemId}`;
  }
  /**
   * Prompt for release notes information (interactive mode)
   */
  private promptForReleaseNotesInfo(baseInfo: Record<string, unknown>): object {
    return {
      ...baseInfo,
      releaseNotesTemplate: {
        basicInfo: {
          workItemId: baseInfo.workItemId,
          workItemType: baseInfo.workItemType,
          title: baseInfo.title,
          state: baseInfo.state,
          assignedTo: baseInfo.assignedTo,
          url: baseInfo.url
        },
        missingInformation: {
          message: 'The following information is needed to complete the release notes. Please provide:',
          requiredFields: [
            {
              field: 'whichFlowsImpacted',
              prompt: 'Which user flows or business processes are impacted by this change?',
              example: 'Login flow, Payment processing, User registration'
            },
            {
              field: 'whichUserFunctionsImpacted', 
              prompt: 'Which specific user functions or features are affected?',
              example: 'Search functionality, Profile management, Document upload'
            },
            {
              field: 'databaseChanges',
              prompt: 'Are there any database schema changes? (Y/N)',
              example: 'Y - Added new column user_preferences'
            },
            {
              field: 'configurationsChanged',
              prompt: 'Are there any configuration changes required? (Y/N)', 
              example: 'Y - New environment variable API_TIMEOUT'
            },
            {
              field: 'devRiskAssessment',
              prompt: 'What is the development risk level? (Low/Medium/High)',
              example: 'Medium - Touching critical payment logic'
            },
            {
              field: 'automatedTestsWritten',
              prompt: 'What automated tests were written or updated?',
              example: 'Unit tests for payment validation, integration tests for API'
            },
            {
              field: 'backOutGamePlan',
              prompt: 'What is the rollback plan if issues occur?',
              example: 'Revert deployment, toggle feature flag off, restore database backup'
            }
          ]
        },
        nextSteps: 'After gathering this information, you can use it to create comprehensive release notes for deployment and change management.'
      }
    };
  }
}
