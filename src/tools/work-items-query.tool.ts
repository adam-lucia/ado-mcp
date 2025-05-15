/**
 * Azure DevOps MCP Server - Work Items Query Tool
 */
import { z } from 'zod';
import { ADOApiClient } from '../api/client/index.js';
import { handleApiError, normalizePaginationParams } from '../api/utils/index.js';
import { EntityTool } from './entity-tool.base.js';

/**
 * Work Items Query Tool for advanced work item filtering
 * Provides a specialized interface for querying work items with various filters
 */
export class WorkItemsQueryTool extends EntityTool {
  constructor(apiClient: ADOApiClient) {
    super(apiClient, 'workItemsQuery', 'Query work items in Azure DevOps with advanced filtering');
    
    // Register operations with enhanced descriptions
    this.registerOperation(
      'query', 
      this.queryWorkItems.bind(this),
      z.object({
        projectName: z.string(),
        workItemType: z.union([z.string(), z.array(z.string())]).optional(),
        state: z.union([z.string(), z.array(z.string())]).optional(),
        assignedTo: z.string().optional()
      }),
      'Query work items with advanced filtering and pagination support'
    );
  }

  /**
   * Generate examples for the work items query tool
   * @returns Array of example strings
   */
  protected generateExamples(): string[] {
    return [
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "projectName": "MyProject",\n    "state": "Active",\n    "workItemType": "Bug",\n    "assignedTo": "john@example.com"\n  }\n}\n```\nFind all active bugs assigned to john@example.com in MyProject',
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "projectName": "MyProject",\n    "workItemType": ["Task", "User Story"],\n    "tags": "Priority1",\n    "maxResults": 50\n  }\n}\n```\nFind up to 50 tasks or user stories tagged as Priority1 in MyProject'
    ];
  }

  /**
   * Build a WIQL query string from the provided filters
   * @param projectName Project name
   * @param filters Filter parameters
   * @returns WIQL query string
   */
  private buildWiqlQuery(
    projectName: string, 
    filters: {
      assignedTo?: string,
      state?: string | string[],
      workItemType?: string | string[],
      tags?: string | string[],
      createdAfter?: string,
      createdBefore?: string
    }
  ): string {
    // Start building the query
    let query = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], ` +
                `[System.CreatedDate], [System.ChangedDate], [System.AssignedTo], [System.Tags] ` +
                `FROM WorkItems WHERE [System.TeamProject] = '${projectName.replace(/'/g, "''")}'`;

    const conditions: string[] = [];

    // Add filters for assignedTo
    if (filters.assignedTo) {
      conditions.push(`[System.AssignedTo] CONTAINS '${filters.assignedTo.replace(/'/g, "''")}'`);
    }

    // Add filters for state
    if (filters.state) {
      if (Array.isArray(filters.state)) {
        if (filters.state.length > 0) {
          const stateConditions = filters.state.map(s => `[System.State] = '${s.replace(/'/g, "''")}'`);
          conditions.push(`(${stateConditions.join(' OR ')})`);
        }
      } else {
        conditions.push(`[System.State] = '${filters.state.replace(/'/g, "''")}'`);
      }
    }

    // Add filters for workItemType
    if (filters.workItemType) {
      if (Array.isArray(filters.workItemType)) {
        if (filters.workItemType.length > 0) {
          const typeConditions = filters.workItemType.map(t => `[System.WorkItemType] = '${t.replace(/'/g, "''")}'`);
          conditions.push(`(${typeConditions.join(' OR ')})`);
        }
      } else {
        conditions.push(`[System.WorkItemType] = '${filters.workItemType.replace(/'/g, "''")}'`);
      }
    }

    // Add filters for tags
    if (filters.tags) {
      if (Array.isArray(filters.tags)) {
        if (filters.tags.length > 0) {
          const tagConditions = filters.tags.map(t => `[System.Tags] CONTAINS '${t.replace(/'/g, "''")}'`);
          conditions.push(`(${tagConditions.join(' OR ')})`);
        }
      } else {
        conditions.push(`[System.Tags] CONTAINS '${filters.tags.replace(/'/g, "''")}'`);
      }
    }

    // Add filters for createdAfter
    if (filters.createdAfter) {
      const createdAfterDate = new Date(filters.createdAfter);
      if (!isNaN(createdAfterDate.getTime())) {
        conditions.push(`[System.CreatedDate] >= '${createdAfterDate.toISOString()}'`);
      }
    }

    // Add filters for createdBefore
    if (filters.createdBefore) {
      const createdBeforeDate = new Date(filters.createdBefore);
      if (!isNaN(createdBeforeDate.getTime())) {
        conditions.push(`[System.CreatedDate] <= '${createdBeforeDate.toISOString()}'`);
      }
    }

    // Add all conditions to the query
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    // Add order by clause
    query += ` ORDER BY [System.Id]`;

    return query;
  }

  /**
   * Query work items with advanced filtering
   * @param params Query parameters
   * @returns Work items matching the query
   */
  async queryWorkItems(params: { 
    projectName: string,
    assignedTo?: string,
    state?: string | string[],
    workItemType?: string | string[],
    tags?: string | string[],
    createdAfter?: string,
    createdBefore?: string,
    continuationToken?: string,
    maxResults?: number
  }): Promise<{
    count: number,
    workItems: Array<{
      id: number,
      title: string,
      state: string,
      type: string,
      createdDate: string,
      changedDate: string,
      assignedTo: string | null,
      assignedToEmail: string | null,
      tags: string[],
      url: string
    }>,
    continuationToken?: string,
    hasMore: boolean
  }> {
    try {
      // Normalize pagination parameters
      const { maxResults, continuationToken } = normalizePaginationParams(params);
      
      // Build the WIQL query string from filters
      const wiqlQueryString = this.buildWiqlQuery(
        params.projectName,
        {
          assignedTo: params.assignedTo,
          state: params.state,
          workItemType: params.workItemType,
          tags: params.tags,
          createdAfter: params.createdAfter,
          createdBefore: params.createdBefore
        }
      );

      // Create the WIQL object
      const wiql = { query: wiqlQueryString };

      // Get the API client
      const workItemTrackingApi = await this.apiClient.getWorkItemTrackingApi();

      // Set up team context with the project name
      const teamContext = { project: params.projectName };
      
      // Execute the query
      const queryResult = await workItemTrackingApi.queryByWiql(wiql, teamContext, true);
      
      if (!queryResult.workItems) {
        return {
          count: 0,
          workItems: [],
          continuationToken: undefined,
          hasMore: false
        };
      }

      // Get work item details for the IDs returned by the query
      const workItemIds = queryResult.workItems?.map(wi => wi.id || 0).filter(id => id > 0) || [];
      
      // If there are no work items, return empty result
      if (workItemIds.length === 0) {
        return {
          count: 0,
          workItems: [],
          continuationToken: undefined,
          hasMore: false
        };
      }
      
      // Apply pagination to the IDs
      const startIndex = continuationToken ? parseInt(continuationToken, 10) : 0;
      const endIndex = Math.min(startIndex + maxResults, workItemIds.length);
      const pagedIds = workItemIds.slice(startIndex, endIndex);
      
      // Create continuation token if there are more results
      const nextContinuationToken = endIndex < workItemIds.length 
        ? endIndex.toString() 
        : undefined;
      
      // Fetch the detailed work items for the paged IDs
      const workItems = pagedIds.length > 0 
        ? await workItemTrackingApi.getWorkItems(
            pagedIds, 
            ['System.Id', 'System.Title', 'System.State', 'System.WorkItemType', 
             'System.CreatedDate', 'System.ChangedDate', 'System.AssignedTo', 'System.Tags']
          )
        : [];
      
      // Format the work items
      const formattedWorkItems = workItems.map((wi) => {
        const fields = wi.fields || {};
        return {
          id: wi.id || 0,
          title: String(fields['System.Title'] || ''),
          state: String(fields['System.State'] || ''),
          type: String(fields['System.WorkItemType'] || ''),
          createdDate: String(fields['System.CreatedDate'] || ''),
          changedDate: String(fields['System.ChangedDate'] || ''),
          assignedTo: fields['System.AssignedTo'] ? String(fields['System.AssignedTo'].displayName || '') : null,
          assignedToEmail: fields['System.AssignedTo'] ? String(fields['System.AssignedTo'].uniqueName || '') : null,
          tags: typeof fields['System.Tags'] === 'string' ? fields['System.Tags'].split('; ') : [],
          url: String(wi.url || '')
        };
      });
      
      return {
        count: workItemIds.length,
        workItems: formattedWorkItems,
        continuationToken: nextContinuationToken,
        hasMore: !!nextContinuationToken
      };
    } catch (error) {
      throw handleApiError(error, 'WorkItemsQueryTool', 'queryWorkItems');
    }
  }
}
