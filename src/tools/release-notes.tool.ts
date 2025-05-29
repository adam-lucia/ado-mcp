/**
 * Azure DevOps MCP Server - Release Notes Tool
 * Generates detailed release notes for work items
 */

import { ADOApiClient } from '../api/client/index.js';
import { EntityTool } from './entity-tool.base.js';
import { z } from 'zod';
import { McpError, ErrorCode, type Result } from '@modelcontextprotocol/sdk/types.js';
import { WorkItemsQueryTool } from './work-items-query.tool.js';

interface WorkItemFields {
  'System.Title'?: string;
  'System.WorkItemType'?: string;
  'System.State'?: string;
  'System.Parent'?: number;
  'Custom.ReleaseVersion'?: string;
  'Custom.FeatureFlag'?: string;
  'Custom.PRODtoggle'?: string;
  'Custom.DEMOtoggle'?: string;
  'System.AssignedTo'?: { displayName: string };
  'System.Description'?: string;
  'Custom.FlowsImpacted'?: string;
  'Custom.UserFunctionsImpacted'?: string;
  'Custom.DatabaseChanges'?: string;
  'Custom.DataStructuresChanged'?: string;
  'Custom.InterfaceChanges'?: string;
  'Custom.Risk'?: string;
  'Custom.ConfigurationChanges'?: string;
  'Custom.AutomatedTests'?: string;
  'Custom.BackoutPlan'?: string;
  'Custom.Comments'?: string;
  'System.CreatedDate'?: string;
  'System.ClosedDate'?: string;
  [key: string]: string | number | { displayName: string } | undefined;
}

interface WorkItemResult {
  id: number;
  fields: WorkItemFields;
  relations?: Array<{
    rel: string;
    url?: string;
    attributes?: {
      name?: string;
    };
  }>;
}

interface ReleaseNoteWorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  releaseVersion?: string;
  parent?: {
    id: number;
    type: string;
    title: string;
  };
  toggle?: string;
  reposChanged: string[];
  authors: string[];
  flowsImpacted?: string;
  userFunctionsImpacted?: string;
  databaseChanges?: string;
  dataStructuresChanged?: string;
  interfaceChanges?: string;
  riskAssessment?: string;
  configurationChanges?: string;
  automatedTests?: string;
  backoutPlan?: string;
  comments?: string;
  createdDate?: string;
  closedDate?: string;
}

/**
 * Tool for generating detailed release notes from work items
 */
export class ReleaseNotesTool extends EntityTool {
  private workItemsQueryTool: WorkItemsQueryTool;

  constructor(apiClient: ADOApiClient) {
    super(apiClient, 'releaseNotes', 'Generate detailed release notes from work items');

    this.workItemsQueryTool = new WorkItemsQueryTool(apiClient);

    // Register operations
    this.registerOperation(
      'generate',
      this.generateReleaseNotes.bind(this),
      z.object({
        projectName: z.string(),
        workItemId: z.number().optional(),
        iterationPath: z.string().optional(),
        includeDetails: z.boolean().optional().default(true),
      }),
      'Generate detailed release notes for a work item or all work items in a sprint'
    );

    this.registerOperation(
      'exportCsv',
      this.exportReleaseNotesCSV.bind(this),
      z.object({
        projectName: z.string(),
        workItemId: z.number().optional(),
        iterationPath: z.string().optional(),
      }),
      'Export release notes data in CSV format'
    );
  }

  /**
   * Generate release notes for work items
   */
  async generateReleaseNotes(params: {
    projectName: string,
    workItemId?: number,
    iterationPath?: string,
    includeDetails?: boolean
  }): Promise<Result> {
    try {
      // Query for work items using WorkItemsQueryTool with additional filtering
      const queryParams = {
        projectName: params.projectName,
        workItemId: params.workItemId,
        iterationPath: params.iterationPath,
        workItemType: params.workItemId ? undefined : ['User Story', 'Bug', 'Task'],
        includeDetails: params.includeDetails ?? true,
        fields: [
          'System.Title',
          'System.WorkItemType',
          'System.State',
          'System.Parent',
          'Custom.ReleaseVersion',
          'Custom.FeatureFlag',
          'Custom.PRODtoggle',
          'Custom.DEMOtoggle',
          'System.AssignedTo',
          'Custom.FlowsImpacted',
          'Custom.UserFunctionsImpacted',
          'Custom.DatabaseChanges',
          'Custom.DataStructuresChanged',
          'Custom.InterfaceChanges',
          'Custom.Risk',
          'Custom.ConfigurationChanges',
          'Custom.AutomatedTests',
          'Custom.BackoutPlan',
          'Custom.Comments',
          'System.CreatedDate',
          'System.ClosedDate'
        ],
        state: params.workItemId ? undefined : ['Closed', 'Done']
      };

      const workItemResult = await this.workItemsQueryTool.queryWorkItems(queryParams) as Result;
      const queryResult = workItemResult.result as { workItems: WorkItemResult[]; count: number };

      if (!queryResult?.workItems?.length) {
        return {
          result: {
            workItems: [],
            count: 0
          }
        };
      }

      // Transform work items into release notes format with proper field mapping
      const releaseNotes = await Promise.all(queryResult.workItems.map(async (item: WorkItemResult) => {
        // Get parent details if available
        let parent;
        const parentId = item.fields['System.Parent'];
        if (parentId) {
          const parentResult = await this.workItemsQueryTool.queryWorkItems({
            projectName: params.projectName,
            workItemId: parentId,
            includeDetails: true
          }) as Result;
          const parentData = parentResult.result as { workItems: WorkItemResult[]; count: number };
          const parentWorkItem = parentData.workItems?.[0];
          if (parentWorkItem) {
            parent = {
              id: parentId,
              type: parentWorkItem.fields['System.WorkItemType'] || '',
              title: parentWorkItem.fields['System.Title'] || ''
            };
          }
        }

        // Extract PR numbers from relations
        const prs = item.relations
          ?.filter(r => r.rel === 'ArtifactLink' && r.attributes?.name === 'GitHub Pull Request')
          .map(r => r.url?.split('/').pop() || '')
          .filter(Boolean) || [];

        return {
          id: item.id,
          title: item.fields['System.Title'] || '',
          type: item.fields['System.WorkItemType'] || '',
          state: item.fields['System.State'] || '',
          releaseVersion: this.extractField(item.fields, 'Custom.ReleaseVersion'),
          parent,
          toggle: this.extractToggle(item.fields),
          reposChanged: prs,
          authors: [item.fields['System.AssignedTo']?.displayName || ''].filter(Boolean),
          flowsImpacted: this.extractField(item.fields, 'Custom.FlowsImpacted'),
          userFunctionsImpacted: this.extractField(item.fields, 'Custom.UserFunctionsImpacted'),
          databaseChanges: this.extractField(item.fields, 'Custom.DatabaseChanges'),
          dataStructuresChanged: this.extractField(item.fields, 'Custom.DataStructuresChanged'),
          interfaceChanges: this.extractField(item.fields, 'Custom.InterfaceChanges'),
          riskAssessment: this.extractField(item.fields, 'Custom.Risk') || '3',
          configurationChanges: this.extractField(item.fields, 'Custom.ConfigurationChanges'),
          automatedTests: this.extractField(item.fields, 'Custom.AutomatedTests'),
          backoutPlan: this.extractField(item.fields, 'Custom.BackoutPlan'),
          comments: this.extractField(item.fields, 'Custom.Comments'),
          createdDate: this.extractField(item.fields, 'System.CreatedDate'),
          closedDate: this.extractField(item.fields, 'System.ClosedDate')
        };
      }));

      return {
        result: {
          workItems: releaseNotes,
          count: releaseNotes.length
        }
      };
    } catch (error) {
      throw error instanceof Error 
        ? error 
        : new Error('Failed to generate release notes: ' + String(error));
    }
  }

  /**
   * Helper method to safely extract a field value from work item fields
   */
  private extractField(fields: WorkItemFields, fieldName: string): string {
    const value = fields[fieldName];
    return value ? String(value).trim() : '';
  }

  /**
   * Helper method to extract and combine toggle information
   */
  private extractToggle(fields: WorkItemFields): string {
    const toggleFields = ['Custom.FeatureFlag', 'Custom.PRODtoggle', 'Custom.DEMOtoggle'];
    for (const field of toggleFields) {
      const value = this.extractField(fields, field);
      if (value) return value;
    }
    return '';
  }

  /**
   * Export release notes in CSV format
   */
  async exportReleaseNotesCSV(params: {
    projectName: string,
    workItemId?: number,
    iterationPath?: string
  }): Promise<Result> {
    try {
      // Get release notes data
      const releaseNotesResult = await this.generateReleaseNotes({
        ...params,
        includeDetails: true
      });

      const releaseNotes = (releaseNotesResult.result as { workItems: ReleaseNoteWorkItem[]; count: number });
      if (!releaseNotes?.workItems?.length) {
        return {
          result: {
            csv: '',
            count: 0
          }
        };
      }

      // Define CSV headers
      const headers = [
        'ID',
        'Title',
        'Type',
        'State',
        'Release Version',
        'Parent ID',
        'Parent Type',
        'Parent Title',
        'Toggle',
        'Repositories Changed',
        'Authors',
        'Flows Impacted',
        'User Functions Impacted',
        'Database Changes',
        'Data Structures Changed',
        'Interface Changes',
        'Risk Assessment',
        'Configuration Changes',
        'Automated Tests',
        'Back Out Plan',
        'Comments',
        'Created Date',
        'Closed Date'
      ];

      // Convert data to rows
      const rows = releaseNotes.workItems.map((item: ReleaseNoteWorkItem) => [
        item.id,
        item.title,
        item.type,
        item.state,
        item.releaseVersion || '',
        item.parent?.id || '',
        item.parent?.type || '',
        item.parent?.title || '',
        item.toggle || '',
        item.reposChanged.join(', '),
        item.authors.join(', '),
        item.flowsImpacted || '',
        item.userFunctionsImpacted || '',
        item.databaseChanges || '',
        item.dataStructuresChanged || '',
        item.interfaceChanges || '',
        item.riskAssessment || '',
        item.configurationChanges || '',
        item.automatedTests || '',
        item.backoutPlan || '',
        item.comments || '',
        item.createdDate || '',
        item.closedDate || ''
      ]);

      // Generate CSV content with proper escaping
      const csvContent = [
        headers.map(header => this.escapeCsvField(header)).join(','),
        ...rows.map((row) => row.map((cell) => this.escapeCsvField(String(cell))).join(','))
      ].join('\n');

      return {
        result: {
          csv: csvContent,
          count: rows.length
        }
      };
    } catch (error) {
      throw error instanceof Error 
        ? error 
        : new Error('Failed to export release notes to CSV: ' + String(error));
    }
  }

  /**
   * Helper method to escape CSV field values
   */
  private escapeCsvField(value: string): string {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  
  /**
   * Generate examples for the release notes tool
   */
  protected generateExamples(): string[] {
    return [
      '```json\n{\n  "operation": "generate",\n  "generateParams": {\n    "projectName": "Sledgehammer",\n    "workItemId": 342129\n  }\n}\n```\nGenerate detailed release notes for work item #342129',
      
      '```json\n{\n  "operation": "generate",\n  "generateParams": {\n    "projectName": "Sledgehammer",\n    "iterationPath": "Sledgehammer\\\\Phase 12 (2025)\\\\Sprint 12.06 Apr 21"\n  }\n}\n```\nGenerate release notes for Sprint 12.06',
      
      '```json\n{\n  "operation": "exportCsv",\n  "exportCsvParams": {\n    "projectName": "Sledgehammer",\n    "workItemId": 342129\n  }\n}\n```\nExport CSV release notes for work item #342129'
    ];
  }
}
