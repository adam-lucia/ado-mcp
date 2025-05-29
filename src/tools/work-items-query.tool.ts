/**
 * Azure DevOps MCP Server - Work Items Query Tool
 */
import { z } from 'zod';
import { ADOApiClient } from '../api/client/index.js';
import { handleApiError, normalizePaginationParams } from '../api/utils/index.js';
import { EntityTool } from './entity-tool.base.js';
import { ServerResult } from '@modelcontextprotocol/sdk/types.js';

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
        workItemId: z.number().optional(),
        workItemType: z.union([z.string(), z.array(z.string())]).optional(),
        state: z.union([z.string(), z.array(z.string())]).optional(),
        assignedTo: z.string().optional(),
        includeDetails: z.boolean().optional()
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
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "projectName": "MyProject",\n    "workItemId": 12345,\n    "includeDetails": true\n  }\n}\n```\nGet detailed information for work item #12345 including custom fields and relationships',
      '```json\n{\n  "operation": "query",\n  "queryParams": {\n    "projectName": "MyProject",\n    "state": "Active",\n    "workItemType": "Bug",\n    "assignedTo": "john@example.com"\n  }\n}\n```\nFind all active bugs assigned to john@example.com in MyProject'
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
      workItemId?: number,
      assignedTo?: string,
      state?: string | string[],
      workItemType?: string | string[],
      includeDetails?: boolean
    }
  ): string {
    // Start building the query
    let query = `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], 
                        [System.CreatedDate], [System.CreatedBy], [System.AssignedTo], 
                        [System.Parent],
                        [Custom.ReleaseVersion], [Custom.Toggle], [Custom.FlowsImpacted],
                        [Custom.UserFunctionsImpacted], [Custom.DatabaseChanges],
                        [Custom.DataStructures], [Custom.Interfaces], [Custom.RiskAssessment],
                        [Custom.ConfigChanges], [Custom.AutomatedTests], [Custom.BackoutPlan],
                        [Custom.Comments]
                 FROM WorkItems
                 WHERE [System.TeamProject] = '${projectName.replace(/'/g, "''")}'`;

    const conditions: string[] = [];

    // Add filter for specific work item ID
    if (filters.workItemId) {
      conditions.push(`[System.Id] = ${filters.workItemId}`);
    }

    // Add filter for assigned to
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

    // Add filters for work item type
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

    // Add conditions to query
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    return query;
  }

  /**
   * Query work items with advanced filtering
   * @param params Query parameters
   * @returns Work items matching the query
   */
  async queryWorkItems(params: {
    projectName: string,
    workItemId?: number,
    workItemType?: string | string[],
    state?: string | string[],
    assignedTo?: string,
    includeDetails?: boolean
  }): Promise<ServerResult> {
    try {
      const workItemTrackingApi = await this.apiClient.getWorkItemTrackingApi();

      // Build the WIQL query
      const wiql = {
        query: this.buildWiqlQuery(params.projectName, {
          workItemId: params.workItemId,
          assignedTo: params.assignedTo,
          state: params.state,
          workItemType: params.workItemType,
          includeDetails: params.includeDetails
        })
      };

      // Execute the query
      const queryResult = await workItemTrackingApi.queryByWiql(wiql, { project: params.projectName });
      
      if (!queryResult.workItems?.length) {
        return {
          tools: [],
          result: {
            count: 0,
            workItems: [],
            hasMore: false
          }
        };
      }

      // Get full work item details
      const workItemIds = queryResult.workItems.map(wi => wi.id);
      const fields = [
        'System.Id', 'System.Title', 'System.WorkItemType', 'System.State',
        'System.CreatedDate', 'System.CreatedBy', 'System.AssignedTo',
        'System.Parent',
        'Custom.ReleaseVersion', 'Custom.Toggle', 'Custom.FlowsImpacted',
        'Custom.UserFunctionsImpacted', 'Custom.DatabaseChanges',
        'Custom.DataStructures', 'Custom.Interfaces', 'Custom.RiskAssessment',
        'Custom.ConfigChanges', 'Custom.AutomatedTests', 'Custom.BackoutPlan',
        'Custom.Comments'
      ];      const expand = params.includeDetails ? 'relations' : undefined;
      const workItems = await workItemTrackingApi.getWorkItems(
        workItemIds.filter((id): id is number => id !== undefined),
        fields,
        undefined,
        expand
      );

      // Process the work items
      const processedItems: DetailedWorkItemResult[] = await Promise.all(
        workItems.map(async (wi): Promise<DetailedWorkItemResult> => {
          const fields = wi.fields as WorkItemFields || {};
          
          // Get parent details if available
          let parent;
          if (fields['System.Parent']) {
            const parentItem = await workItemTrackingApi.getWorkItem(
              fields['System.Parent'],
              ['System.Id', 'System.Title', 'System.WorkItemType']
            );
            if (parentItem?.fields) {
              parent = {
                id: fields['System.Parent'],
                type: String(parentItem.fields['System.WorkItemType'] || ''),
                title: String(parentItem.fields['System.Title'] || '')
              };
            }
          }

          // Get related PRs
          const relatedPRs = wi.relations
            ?.filter(r => r.rel === 'ArtifactLink' && r.attributes?.name === 'GitHub Pull Request')
            .map(r => r.url?.split('/').pop() || '')
            .filter(Boolean) || [];

          // Get authors (created by and assigned to)
          const authors = new Set<string>();
          if (fields['System.CreatedBy']?.displayName) {
            authors.add(fields['System.CreatedBy'].displayName);
          }
          if (fields['System.AssignedTo']?.displayName) {
            authors.add(fields['System.AssignedTo'].displayName);
          }

          return {
            id: fields['System.Id'] || 0,
            title: fields['System.Title'] || '',
            releaseVersion: fields['Custom.ReleaseVersion'],
            parent,
            toggle: fields['Custom.Toggle'],
            relatedPRs,
            authors: Array.from(authors),
            flowsImpacted: fields['Custom.FlowsImpacted'],
            userFunctions: fields['Custom.UserFunctionsImpacted'],
            dbChanges: fields['Custom.DatabaseChanges'],
            dataStructures: fields['Custom.DataStructures'],
            interfaces: fields['Custom.Interfaces'],
            riskAssessment: fields['Custom.RiskAssessment'],
            configChanges: fields['Custom.ConfigChanges'],
            automatedTests: fields['Custom.AutomatedTests'],
            backoutPlan: fields['Custom.BackoutPlan'],
            comments: fields['Custom.Comments']
          };
        })
      );

      return {
        tools: [],
        result: {
          count: processedItems.length,
          workItems: processedItems,
          hasMore: false
        }
      };

    } catch (error) {
      throw handleApiError(error, 'WorkItemsQueryTool', 'queryWorkItems');
    }
  }
}

// Custom field interfaces
interface WorkItemCustomFields {
  'Custom.ReleaseVersion': string;
  'Custom.Toggle': string;
  'Custom.FlowsImpacted': string;
  'Custom.UserFunctionsImpacted': string;
  'Custom.DatabaseChanges': string;
  'Custom.DataStructures': string;
  'Custom.Interfaces': string;
  'Custom.RiskAssessment': string;
  'Custom.ConfigChanges': string;
  'Custom.AutomatedTests': string;
  'Custom.BackoutPlan': string;
  'Custom.Comments': string;
}

interface WorkItemSystemFields {
  'System.Id': number;
  'System.Title': string;
  'System.WorkItemType': string;
  'System.State': string;
  'System.CreatedDate': string;
  'System.CreatedBy': { displayName: string; uniqueName: string; };
  'System.AssignedTo': { displayName: string; uniqueName: string; };
  'System.Parent'?: number;
}

interface WorkItemFields extends Partial<WorkItemSystemFields>, Partial<WorkItemCustomFields> {}

interface DetailedWorkItemResult {
  id: number;
  title: string;
  releaseVersion?: string;
  parent?: {
    id: number;
    type: string;
    title: string;
  };
  toggle?: string;
  relatedPRs: string[];
  authors: string[];
  flowsImpacted?: string;
  userFunctions?: string;
  dbChanges?: string;
  dataStructures?: string;
  interfaces?: string;
  riskAssessment?: string;
  configChanges?: string;
  automatedTests?: string;
  backoutPlan?: string;
  comments?: string;
}
