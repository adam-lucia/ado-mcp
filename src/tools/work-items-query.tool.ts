/**
 * Azure DevOps MCP Server - Work Items Query Tool
 */
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { z } from 'zod';
import { ADOApiClient } from '../api/client/index.js';
import { handleApiError } from '../api/utils/index.js';
import { EntityTool } from './entity-tool.base.js';
import { ServerResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Work Items Query Tool for basic work item filtering
 * Supports querying by Iteration Path (sprint), Area Path (team), or Assigned To
 */
export class WorkItemsQueryTool extends EntityTool {
  constructor(apiClient: ADOApiClient) {
    super(apiClient, 'workItemsQuery', 'Query work items by sprint, team, or assignee');
    
    this.registerOperation(
      'query', 
      this.queryWorkItems.bind(this),
      z.object({
        projectName: z.string().describe('Project name (defaults to "Sledgehammer" if not provided)'),
        assignedTo: z.string().optional().describe('Filter by user assigned to (email or display name)'),
        areaPath: z.string().optional().describe('Filter by team/area path'),
        iterationPath: z.string().optional().describe('Filter by sprint/iteration path'),
        includeDetails: z.boolean().optional().describe('Include detailed work item information')
      }),
      'Query work items by sprint, team, or assignee'
    );
  }
  /**
   * Generate examples for the work items query tool
   */
  protected generateExamples(): string[] {
    return [
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "assignedTo": "john@example.com"\n  }\n}\n```\nFind all work items assigned to john@example.com',
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "projectName": "MyProject",\n    "iterationPath": "MyProject\\\\Sprint 1"\n  }\n}\n```\nFind all work items in Sprint 1',
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "areaPath": "MyProject\\\\Team Alpha",\n    "includeDetails": true\n  }\n}\n```\nFind all work items for Team Alpha with detailed information'
    ];
  }
  /**
   * Build a WIQL query string from the provided filters
   */
  private buildWiqlQuery(
    projectName: string, 
    filters: {
      assignedTo?: string,
      areaPath?: string,
      iterationPath?: string
    }
  ): string {
    // Basic fields we need
    let query = `SELECT [System.Id],
                        [System.Title],
                        [System.WorkItemType],
                        [System.State],
                        [System.AreaPath],
                        [System.IterationPath],
                        [System.AssignedTo],
                        [System.CreatedDate],
                        [System.CreatedBy]
                 FROM WorkItems
                 WHERE [System.TeamProject] = '${projectName.replace(/'/g, "''")}'`;

    const conditions: string[] = [];

    // Add filter for assigned to
    if (filters.assignedTo) {
      conditions.push(`[System.AssignedTo] CONTAINS '${filters.assignedTo.replace(/'/g, "''")}'`);
    }

    // Add filter for area path
    if (filters.areaPath) {
      conditions.push(`[System.AreaPath] UNDER '${filters.areaPath.replace(/'/g, "''")}'`);
    }

    // Add filter for iteration path
    if (filters.iterationPath) {
      conditions.push(`[System.IterationPath] UNDER '${filters.iterationPath.replace(/'/g, "''")}'`);
    }

    // Add conditions to query
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    return query;
  }
  /**
   * Query work items by sprint, team, or assignee
   */
  async queryWorkItems(params: {
    projectName?: string,
    assignedTo?: string,
    areaPath?: string,
    iterationPath?: string,
    includeDetails?: boolean
  }): Promise<ServerResult> {
    try {
      // Default to Sledgehammer project if not specified
      const projectName = params.projectName || 'Sledgehammer';
      
      const workItemTrackingApi = await this.apiClient.getWorkItemTrackingApi();

      // Build the WIQL query
      const wiql = {
        query: this.buildWiqlQuery(projectName, {
          assignedTo: params.assignedTo,
          areaPath: params.areaPath,
          iterationPath: params.iterationPath
        })
      };

      // Execute the query
      const queryResult = await workItemTrackingApi.queryByWiql(wiql, { project: projectName });
      
      if (!queryResult.workItems?.length) {
        return {
          tools: [],
          result: {
            count: 0,
            workItems: [],
            query: wiql.query
          }
        };
      }

      // Get basic work item details
      const workItemIds = queryResult.workItems.map(wi => wi.id).filter((id): id is number => id !== undefined);
      const fields = [
        'System.Id', 'System.Title', 'System.WorkItemType', 'System.State',
        'System.AreaPath', 'System.IterationPath', 'System.AssignedTo', 
        'System.CreatedDate', 'System.CreatedBy'
      ];
      
      const expand = params.includeDetails ? WorkItemExpand.Relations : undefined;
      const workItems = await workItemTrackingApi.getWorkItems(workItemIds, fields, undefined, expand);

      // Process the work items
      const processedItems: WorkItemResult[] = workItems.map((wi): WorkItemResult => {
        const fields = wi.fields || {};
        
        return {
          id: fields['System.Id'] || 0,
          title: fields['System.Title'] || '',
          workItemType: fields['System.WorkItemType'] || '',
          state: fields['System.State'] || '',
          areaPath: fields['System.AreaPath'] || '',
          iterationPath: fields['System.IterationPath'] || '',
          assignedTo: fields['System.AssignedTo']?.displayName || undefined,
          createdDate: fields['System.CreatedDate'] || '',
          createdBy: fields['System.CreatedBy']?.displayName || ''
        };
      });

      return {
        tools: [],
        result: {
          count: processedItems.length,
          workItems: processedItems,
          query: wiql.query
        }
      };

    } catch (error) {
      throw handleApiError(error, 'WorkItemsQueryTool', 'queryWorkItems');
    }
  }
}

// Simple interface for work item results
interface WorkItemResult {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  areaPath: string;
  iterationPath: string;
  assignedTo?: string;
  createdDate: string;
  createdBy: string;
}
