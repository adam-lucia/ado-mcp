import { z } from 'zod';
import ExcelJS from 'exceljs';
import * as path from 'path';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { ADOApiClient } from '../api/client/index.js';
import { handleApiError } from '../api/utils/index.js';
import { EntityTool } from './entity-tool.base.js';

/**
 * Release Notes Tool for exporting Azure DevOps work items to Excel format
 */
export class ReleaseNotesTool extends EntityTool {
  constructor(apiClient: ADOApiClient) {
    super(apiClient, 'releaseNotes', 'Generate release notes in Excel format from Azure DevOps work items');
    
    // Register the export operation
    this.registerOperation(
      'exportToExcel', 
      this.exportReleaseNotesToExcel.bind(this),      z.object({
        sprintPath: z.string().describe('Full iteration path (e.g., "Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21")'),
        teamName: z.string().optional().describe('Full area path (e.g., "Sledgehammer\\Editor\\BearHawks")'),
        outputPath: z.string().optional().describe('Output file path (defaults to current directory)'),
        userInputs: z.object({
          whichFlowsImpacted: z.string().optional().describe('Which flows impacted?'),
          whichUserFunctionsImpacted: z.string().optional().describe('Which user functions impacted?'),
          databaseChanges: z.string().optional().describe('Database changes?'),
          persistedDataStructuresChanged: z.string().optional().describe('Persisted data structures changed?'),
          interProcessInterfaces: z.string().optional().describe('Inter-process interfaces, message formats, or protocol changes?'),
          configurationsChanged: z.string().optional().describe('Configurations changed?'),
          descriptionOfConfigChanges: z.string().optional().describe('Description of Configuration Changes'),
          automatedTestsWritten: z.string().optional().describe('Automated tests written, updated, or covering new or changed code\'s functionality?'),
          backOutGamePlan: z.string().optional().describe('Back out game plan'),
          comments: z.string().optional().describe('Comments')
        }).optional().describe('User-provided inputs for manual fields')
      }).strict(),
      'Export release notes for a sprint and team to Excel format with all required columns'
    );
  }
  
  /**
   * Generate examples for the release notes tool
   * @returns Array of example strings
   */  protected generateExamples(): string[] {
    return [
      '```json\n{\n  "operation": "exportToExcel",\n  "exportToExcelParams": {\n    "sprintPath": "Sledgehammer\\\\Phase 12 (2025)\\\\Sprint 12.06 Apr 21",\n    "teamName": "Sledgehammer\\\\Editor\\\\BearHawks",\n    "outputPath": "C:\\\\temp\\\\release-notes.xlsx",\n    "userInputs": {\n      "whichFlowsImpacted": "Login, Payment Processing",\n      "databaseChanges": "Added new user_preferences table"\n    }\n  }\n}\n```\nExport release notes for Sprint 12.06 and team BearHawks to Excel with user inputs'
    ];
  }
  
  /**
   * Export release notes to Excel format
   */  async exportReleaseNotesToExcel(params: {
    sprintPath: string;
    teamName?: string;
    outputPath?: string;
    userInputs?: {
      whichFlowsImpacted?: string;
      whichUserFunctionsImpacted?: string;
      databaseChanges?: string;
      persistedDataStructuresChanged?: string;
      interProcessInterfaces?: string;
      configurationsChanged?: string;
      descriptionOfConfigChanges?: string;
      automatedTestsWritten?: string;
      backOutGamePlan?: string;
      comments?: string;
    };
  }): Promise<any> {
    try {
      // Get work items for the sprint and team
      const workItems = await this.getWorkItemsForSprint(params.sprintPath, params.teamName);
      
      if (workItems.length === 0) {
        return {
          success: false,
          message: `No work items found for sprint path: ${params.sprintPath}`,
          filePath: null
        };
      }
      
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Release Notes');
      
      // Define columns
      const columns = [
        { header: 'Release Version', key: 'releaseVersion', width: 15 },
        { header: 'Parent Work Item ID', key: 'parentWorkItemId', width: 20 },
        { header: 'Parent Work Item Type', key: 'parentWorkItemType', width: 20 },
        { header: 'Parent Work Item Title', key: 'parentWorkItemTitle', width: 40 },
        { header: 'Toggle (FeatureFlag)', key: 'toggle', width: 20 },
        { header: 'Repos Changed', key: 'reposChanged', width: 30 },
        { header: 'Authors', key: 'authors', width: 30 },
        { header: 'Which flows impacted?', key: 'whichFlowsImpacted', width: 30 },
        { header: 'Which user functions impacted?', key: 'whichUserFunctionsImpacted', width: 30 },
        { header: 'Database changes?', key: 'databaseChanges', width: 20 },
        { header: 'Persisted data structures changed?', key: 'persistedDataStructuresChanged', width: 30 },
        { header: 'Inter-process interfaces, message formats, or protocol changes?', key: 'interProcessInterfaces', width: 40 },
        { header: 'Dev risk assessment 1-3?', key: 'devRiskAssessment', width: 20 },
        { header: 'Configurations changed?', key: 'configurationsChanged', width: 20 },
        { header: 'Description of Configuration Changes', key: 'descriptionOfConfigChanges', width: 40 },
        { header: 'Automated tests written, updated, or covering new or changed code\'s functionality?', key: 'automatedTestsWritten', width: 50 },
        { header: 'Back out game plan', key: 'backOutGamePlan', width: 40 },
        { header: 'Comments', key: 'comments', width: 40 }
      ];
      
      worksheet.columns = columns;
      
      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
        // Process each work item
      for (const workItem of workItems) {
        const enrichedData = await this.enrichWorkItemData(workItem, params.userInputs);
        worksheet.addRow(enrichedData);
      }
      
      // Determine output path
      const outputPath = params.outputPath || path.join(process.cwd(), `release-notes-${Date.now()}.xlsx`);
      
      // Write the file
      await workbook.xlsx.writeFile(outputPath);
      
      return {
        success: true,
        message: `Release notes exported successfully to ${outputPath}`,
        filePath: outputPath,
        workItemsCount: workItems.length
      };
      
    } catch (error) {
      throw handleApiError(error, 'ReleaseNotesTool', 'exportReleaseNotesToExcel');
    }
  }
    /**
   * Get work items for a specific sprint
   */  private async getWorkItemsForSprint(sprintPath: string, teamName?: string): Promise<any[]> {
    try {
      const workItemApi = await this.apiClient.getWorkItemTrackingApi();
      
      // Build WIQL query with exact path matching
      // For sprintPath: expect full iteration path like 'Sledgehammer\Phase 12 (2025)\Sprint 12.06 Apr 21'
      // For teamName: expect full area path like 'Sledgehammer\Editor\BearHawks'
      let whereClause = `[System.IterationPath] = '${sprintPath}'`;
      
      if (teamName) {
        whereClause += ` AND [System.AreaPath] = '${teamName}'`;
      }
      
      const wiqlQuery = {
        query: `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo], [System.IterationPath], [System.AreaPath]
                FROM WorkItems 
                WHERE ${whereClause}
                AND [System.WorkItemType] IN ('User Story', 'Bug', 'Task', 'Feature', 'Epic')
                ORDER BY [System.Id]`
      };
      
      console.log('WIQL Query:', wiqlQuery.query);
      
      const queryResult = await workItemApi.queryByWiql(wiqlQuery);
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        console.log('No work items found for query');
        return [];
      }
      
      console.log(`Found ${queryResult.workItems.length} work items`);
      
      // Get detailed work item data
      const workItemIds = queryResult.workItems.map(wi => wi.id).filter((id): id is number => id !== undefined);
      const workItems = await workItemApi.getWorkItems(workItemIds, undefined, undefined, WorkItemExpand.Relations);
      
      return workItems;
    } catch (error) {
      console.error('Error getting work items:', error);
      throw handleApiError(error, 'ReleaseNotesTool', 'getWorkItemsForSprint');
    }
  }
    /**
   * Enrich work item data with additional information
   */
  private async enrichWorkItemData(workItem: any, userInputs?: any): Promise<any> {
    const fields = workItem.fields || {};
    const relations = workItem.relations || [];
    
    // Get release version from work item fields
    const releaseVersion = this.getReleaseVersion(fields);
    
    // Get parent work item information
    const parentInfo = await this.getParentWorkItemInfo(relations);
    
    // Get feature flag information
    const featureFlag = this.getFeatureFlagInfo(fields);
    
    // Get repository and author information from linked PRs
    const prInfo = await this.getPullRequestInfo(relations);
    
    // Get risk assessment from custom field
    const riskAssessment = this.getRiskAssessment(fields);
    
    return {
      releaseVersion: releaseVersion,
      parentWorkItemId: parentInfo.id || '',
      parentWorkItemType: parentInfo.type || '',
      parentWorkItemTitle: parentInfo.title || '',
      toggle: featureFlag,
      reposChanged: prInfo.repos.join(', '),
      authors: prInfo.authors.join(', '),
      whichFlowsImpacted: userInputs?.whichFlowsImpacted || '',
      whichUserFunctionsImpacted: userInputs?.whichUserFunctionsImpacted || '',
      databaseChanges: userInputs?.databaseChanges || '',
      persistedDataStructuresChanged: userInputs?.persistedDataStructuresChanged || '',
      interProcessInterfaces: userInputs?.interProcessInterfaces || '',
      devRiskAssessment: riskAssessment,
      configurationsChanged: userInputs?.configurationsChanged || '',
      descriptionOfConfigChanges: userInputs?.descriptionOfConfigChanges || '',
      automatedTestsWritten: userInputs?.automatedTestsWritten || '',
      backOutGamePlan: userInputs?.backOutGamePlan || '',
      comments: userInputs?.comments || ''
    };  }
  
  /**
   * Extract release version from work item fields
   */
  private getReleaseVersion(fields: any): string {
    // Look for common release version field names
    const releaseVersionFields = [
      'Custom.ReleaseVersion',
      'Microsoft.VSTS.Common.ReleaseVersion',
      'ReleaseVersion',
      'Release',
      'Version',
      'Custom.Version',
      'Microsoft.VSTS.Build.FoundIn',
      'Microsoft.VSTS.Build.IntegrationBuild'
    ];
    
    for (const fieldName of releaseVersionFields) {
      if (fields[fieldName]) {
        return fields[fieldName].toString();
      }
    }
    
    return '';
  }
  
  /**
   * Get parent work item information from relations
   */
  private async getParentWorkItemInfo(relations: any[]): Promise<{ id: string; type: string; title: string }> {
    try {
      const parentRelation = relations.find(rel => 
        rel.rel === 'System.LinkTypes.Hierarchy-Reverse' || 
        rel.attributes?.name === 'Parent'
      );
      
      if (!parentRelation || !parentRelation.url) {
        return { id: '', type: '', title: '' };
      }
      
      // Extract work item ID from URL
      const match = parentRelation.url.match(/(\d+)$/);
      if (!match) {
        return { id: '', type: '', title: '' };
      }
      
      const parentId = parseInt(match[1], 10);
      const workItemApi = await this.apiClient.getWorkItemTrackingApi();
      const parentWorkItem = await workItemApi.getWorkItem(parentId);
      
      return {
        id: parentWorkItem.id?.toString() || '',
        type: parentWorkItem.fields?.['System.WorkItemType'] || '',
        title: parentWorkItem.fields?.['System.Title'] || ''
      };
    } catch (error) {
      console.warn('Error getting parent work item info:', error);
      return { id: '', type: '', title: '' };
    }
  }
  
  /**
   * Extract feature flag information from work item fields
   */
  private getFeatureFlagInfo(fields: any): string {
    // Look for common feature flag field names
    const featureFlagFields = [
      'Custom.FeatureFlag',
      'Microsoft.VSTS.Common.FeatureFlag',
      'FeatureFlag',
      'Toggle'
    ];
    
    for (const fieldName of featureFlagFields) {
      if (fields[fieldName]) {
        return fields[fieldName];
      }
    }
    
    return '';
  }
  
  /**
   * Get pull request information from relations
   */
  private async getPullRequestInfo(relations: any[]): Promise<{ repos: string[]; authors: string[] }> {
    const repos = new Set<string>();
    const authors = new Set<string>();
    
    try {
      const prRelations = relations.filter(rel => 
        rel.attributes?.name === 'Pull Request' ||
        rel.url?.includes('pullRequest')
      );
      
      for (const prRelation of prRelations) {
        if (prRelation.url) {
          // Extract repo and PR info from URL
          const prMatch = prRelation.url.match(/\/([^\/]+)\/_git\/([^\/]+)\/pullRequest\/(\d+)/);
          if (prMatch) {
            const [, project, repo, prId] = prMatch;
            repos.add(repo);              // Try to get PR author information
              try {
                const gitApi = await this.apiClient.getGitApi();
                const pr = await gitApi.getPullRequestById(parseInt(prId, 10), project);
                if (pr.createdBy?.displayName) {
                  authors.add(pr.createdBy.displayName);
                }
              } catch (prError) {
                console.warn(`Error getting PR ${prId} info:`, prError);
              }
          }
        }
      }
    } catch (error) {
      console.warn('Error getting pull request info:', error);
    }
    
    return {
      repos: Array.from(repos),
      authors: Array.from(authors)
    };
  }
  
  /**
   * Get risk assessment from custom fields
   */
  private getRiskAssessment(fields: any): string {
    const riskFields = [
      'Custom.Risk',
      'Microsoft.VSTS.Common.Risk',
      'Risk',
      'RiskAssessment'
    ];
    
    for (const fieldName of riskFields) {
      if (fields[fieldName]) {
        return fields[fieldName];
      }
    }
    
    return '';
  }
}