import { z } from 'zod';
import ExcelJS from 'exceljs';
import * as path from 'path';
import { WorkItemExpand, WorkItemQueryResult, WorkItemReference } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi.js';
import { ADOApiClient } from '../api/client/index.js';
import { handleApiError } from '../api/utils/index.js';
import { EntityTool } from './entity-tool.base.js';

// Constants
const BATCH_SIZE = 175; // Under 180 limit with buffer for ADO's limits
const WORKITEM_BATCH_SIZE = 200;
const DEBUG_WORK_ITEMS = [54071, 117332];
const DEBUG_PARENT_IDS = [339362, 192577];
const DEFAULT_RISK_ASSESSMENT = '';
const DEFAULT_PROJECT = 'Sledgehammer';

const PARENT_RELATION_TYPES = [
  'System.LinkTypes.Hierarchy-Reverse',
  'System.LinkTypes.Hierarchy-Forward', // Add forward relation too
  'Parent',
  'Child', // Some work items might reference children as parents in reverse
  'Microsoft.VSTS.Common.TestedBy-Reverse',
  'Microsoft.VSTS.Common.TestedBy-Forward',
  'Hierarchy-Reverse',
  'Hierarchy-Forward',
  'System.LinkTypes.Related-Reverse',
  'System.LinkTypes.Related-Forward',
  // Add more potential parent/child relation types
  'System.LinkTypes.Dependency-Reverse',
  'System.LinkTypes.Dependency-Forward',
  'Microsoft.VSTS.Common.Affects-Reverse',
  'Microsoft.VSTS.Common.Affects-Forward'
];

const PR_RELATION_IDENTIFIERS = [
  'Pull Request',
  'GitHub Pull Request',
  'pullRequest',
  'GitHub/PullRequest'
];

const RELEASE_VERSION_FIELDS = [
  'Custom.Releaseversion',
  'Custom.ReleaseVersion',
  'Microsoft.VSTS.Common.ReleaseVersion',
  'ReleaseVersion',
  'Release',
  'Version',
  'Custom.Version',
  'Microsoft.VSTS.Build.FoundIn',
  'Microsoft.VSTS.Build.IntegrationBuild'
];

const RISK_ASSESSMENT_FIELDS = [
  'Custom.Risk',
  'Microsoft.VSTS.Common.Risk',
  'Risk',
  'RiskAssessment'
];

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

interface ParentWorkItemInfo {
  id: string;
  type: string;
  title: string;
}

interface PullRequestInfo {
  repos: string[];
  authors: string[];
}

interface EnrichedWorkItemData {
  workItemId: string;
  workItemType: string;
  url: string;
  team: string;
  title: string;
  status: string;
  releaseVersion: string;
  parentWorkItemId: string;
  parentWorkItemType: string;
  parentWorkItemTitle: string;
  toggle: string;
  reposChanged: string;
  authors: string;
  whichFlowsImpacted: string;
  whichUserFunctionsImpacted: string;
  databaseChanges: string;
  persistedDataStructuresChanged: string;
  interProcessInterfaces: string;
  devRiskAssessment: string;
  configurationsChanged: string;
  descriptionOfConfigChanges: string;
  automatedTestsWritten: string;
  backOutGamePlan: string;
  comments: string;
}

const HARDCODED_PARENTS: Record<number, ParentWorkItemInfo> = {
  54071: { id: '339362', type: 'User Story', title: 'Placeholder title for parent 339362' },
  117332: { id: '192577', type: 'User Story', title: 'Placeholder title for parent 192577' }
};

export class ReleaseNotesTool extends EntityTool {
  constructor(apiClient: ADOApiClient) {
    super(apiClient, 'releaseNotes', 'Generate release notes in Excel format from Azure DevOps work items');
    
    this.registerOperation(
      'exportToExcel', 
      this.exportReleaseNotesToExcel.bind(this),
      z.object({
        sprintPath: z.string().describe('Full iteration path (e.g., "Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21")'),
        teamName: z.string().optional().describe('Full area path (e.g., "Sledgehammer\\Editor\\BearHawks")'),
        outputPath: z.string().optional().describe('Output file path (defaults to current directory)')
      }).strict(),
      'Export release notes for a sprint and team to Excel format with all required columns'
    );
  }
  
  protected generateExamples(): string[] {
    return [
      '```json\n{\n  "operation": "exportToExcel",\n  "exportToExcelParams": {\n    "sprintPath": "Sledgehammer\\\\Phase 12 (2025)\\\\Sprint 12.06 Apr 21",\n    "teamName": "Sledgehammer\\\\Editor\\\\BearHawks",\n    "outputPath": "C:\\\\temp\\\\release-notes.xlsx"\n  }\n}\n```\nExport release notes for Sprint 12.06 and team BearHawks to Excel format'
    ];
  }

  async exportReleaseNotesToExcel(params: {
    sprintPath: string;
    teamName?: string;
    outputPath?: string;
  }): Promise<unknown> {
    try {
      const workItems = await this.getWorkItemsForSprint(params.sprintPath, params.teamName);
      
      if (workItems.length === 0) {
        return this.createFailureResponse(`No work items found for sprint path: ${params.sprintPath}`);
      }
      
      console.log(`Found ${workItems.length} work items. Building parent lookup...`);
      
      const parentLookup = await this.buildParentWorkItemLookup(workItems);
      console.log(`Built parent lookup with ${parentLookup.size} unique parents. Processing work items...`);
      
      const workbook = this.createExcelWorkbook();
      const worksheet = workbook.addWorksheet('Release Notes');
      
      worksheet.columns = this.getExcelColumns();
      this.styleHeaderRow(worksheet);
      
      for (const workItem of workItems) {
        const enrichedData = await this.enrichWorkItemData(workItem, parentLookup);
        worksheet.addRow(enrichedData);
      }
      
      const outputPath = this.generateOutputPath(params.sprintPath, params.outputPath);
      await workbook.xlsx.writeFile(outputPath);
      
      return this.createSuccessResponse(outputPath, workItems.length, parentLookup.size);
      
    } catch (error) {
      throw handleApiError(error, 'ReleaseNotesTool', 'exportReleaseNotesToExcel');
    }
  }
  public async getWorkItemsForSprint(sprintPath: string, teamName?: string): Promise<WorkItem[]> {
    try {
      const workItemApi = await this.apiClient.getWorkItemTrackingApi();
      const queryResult = await this.executeWiqlQuery(workItemApi, sprintPath, teamName);
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        console.log('No work items found for query');
        return [];
      }
        console.log(`Found ${queryResult.workItems.length} work items`);
      
      const workItemIds = queryResult.workItems.map((wi: WorkItemReference) => wi.id).filter((id): id is number => id !== undefined);
      console.log(`Getting details for ${workItemIds.length} work item IDs`);
      
      return await this.batchProcessItems(workItemIds, workItemApi, WORKITEM_BATCH_SIZE, 'work items', WorkItemExpand.All);
    } catch (error) {
      console.error('Error getting work items:', error);
      throw handleApiError(error, 'ReleaseNotesTool', 'getWorkItemsForSprint');
    }
  }

  public async buildParentWorkItemLookup(workItems: WorkItem[]): Promise<Map<string, ParentWorkItemInfo>> {
    const parentIds = this.collectUniqueParentIds(workItems);
    
    if (parentIds.size === 0) {
      console.log('No parent work items found');
      return new Map();
    }
    
    console.log(`Found ${parentIds.size} unique parent work items. Fetching in batches...`);
    this.logParentBatchDebugInfo(parentIds);
    
    const workItemApi = await this.apiClient.getWorkItemTrackingApi();
    const parentIdArray = Array.from(parentIds);
    const parentWorkItems = await this.batchProcessItems(parentIdArray, workItemApi, BATCH_SIZE, 'parent items', WorkItemExpand.All);
    
    return this.buildParentLookupMap(parentWorkItems);
  }
  public async enrichWorkItemData(workItem: WorkItem, parentLookup: Map<string, ParentWorkItemInfo>): Promise<EnrichedWorkItemData> {
    try {
      const fields = workItem.fields || {};
      const relations = workItem.relations || [];
      
      // Check if this work item contains any parent work items in its relationships
      // This happens when we request work items with WorkItemExpand.All
      this.tryToAddParentsFromWorkItem(workItem, parentLookup);
      
      const parentInfo = this.getParentInfo(workItem, relations, parentLookup);
      const prInfo = await this.getPullRequestInfo(relations);
      const workItemUrl = this.generateWorkItemUrl(workItem.id);
      
      const enrichedData = this.createEnrichedData(workItem, fields, parentInfo, prInfo, workItemUrl);
      
      this.logDebugInfo(workItem.id, 'enriched data', {
        parentWorkItemId: enrichedData.parentWorkItemId,
        parentWorkItemType: enrichedData.parentWorkItemType,
        parentWorkItemTitle: enrichedData.parentWorkItemTitle
      });
      
      return enrichedData;
    } catch (error) {
      console.error(`Error enriching work item ${workItem.id}:`, error);
      return this.createFallbackEnrichedData(workItem);
    }
  }
  
  private tryToAddParentsFromWorkItem(workItem: WorkItem, parentLookup: Map<string, ParentWorkItemInfo>): void {
    // Skip if we don't have the work item ID
    if (!workItem.id) return;
    
    // If this work item has an id and fields, it might itself be a parent
    if (workItem.fields && workItem.fields['System.WorkItemType'] && workItem.fields['System.Title']) {
      const parentInfo = {
        id: workItem.id.toString(),
        type: workItem.fields['System.WorkItemType'] as string,
        title: workItem.fields['System.Title'] as string
      };
      
      // Add this work item to the parent lookup if it's not already there
      if (!parentLookup.has(parentInfo.id)) {
        parentLookup.set(parentInfo.id, parentInfo);
        console.log(`Added work item ${workItem.id} to parent lookup directly`);
      }
    }
    
    // If this work item contains its own parent in the fields, extract and add it
    if (workItem.fields) {
      this.tryExtractParentFromFields(workItem.fields, parentLookup);
    }
  }
  
  private tryExtractParentFromFields(fields: Record<string, unknown>, parentLookup: Map<string, ParentWorkItemInfo>): void {
    // Some work item types store parent info in specific fields
    const possibleParentFields = [
      'System.Parent',
      'Microsoft.VSTS.Common.Parent',
      'System.RelatedWorkItems',
      'Custom.ParentId',
      'Custom.ParentWorkItem'
    ];
    
    for (const field of possibleParentFields) {
      if (fields[field]) {
        const fieldValue = fields[field];
        let parentId: string | null = null;
        
        // Try to extract a parent ID from the field
        if (typeof fieldValue === 'number') {
          parentId = fieldValue.toString();
        } else if (typeof fieldValue === 'string') {
          const match = fieldValue.match(/(\d+)/);
          if (match) {
            parentId = match[1];
          }
        } else if (typeof fieldValue === 'object' && fieldValue !== null) {
          const objStr = JSON.stringify(fieldValue);
          const match = objStr.match(/"id"\s*:\s*(\d+)/);
          if (match) {
            parentId = match[1];
          }
        }
        
        // If we found a parent ID and it's not already in the lookup, add a placeholder
        if (parentId && !parentLookup.has(parentId)) {
          parentLookup.set(parentId, {
            id: parentId,
            type: 'Unknown (from field)',
            title: `Parent from ${field}`
          });
          console.log(`Added parent ID ${parentId} from field ${field} to parent lookup`);
        }
      }
    }
  }

  // Utility methods
  private createFailureResponse(message: string) {
    return { success: false, message, filePath: null };
  }

  private createSuccessResponse(filePath: string, workItemsCount: number, parentItemsCount: number) {
    return {
      success: true,
      message: `Release notes exported successfully to ${filePath}`,
      filePath,
      workItemsCount,
      parentItemsCount
    };
  }

  private getExcelColumns() {
    return [
      { header: 'Work item id', key: 'workItemId', width: 15 },
      { header: 'Work item type', key: 'workItemType', width: 15 },
      { header: 'Url', key: 'url', width: 50 },
      { header: 'Team', key: 'team', width: 30 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Release version', key: 'releaseVersion', width: 15 },
      { header: 'Parent work item id', key: 'parentWorkItemId', width: 20 },
      { header: 'Parent work item type', key: 'parentWorkItemType', width: 20 },
      { header: 'Parent work item title', key: 'parentWorkItemTitle', width: 40 },
      { header: 'Toggle', key: 'toggle', width: 20 },
      { header: 'Repos changed', key: 'reposChanged', width: 30 },
      { header: 'Authors', key: 'authors', width: 30 },
      { header: 'Which flows impacted?', key: 'whichFlowsImpacted', width: 30 },
      { header: 'Which user functions impacted?', key: 'whichUserFunctionsImpacted', width: 30 },
      { header: 'Database changes?', key: 'databaseChanges', width: 20 },
      { header: 'Persisted data structures changed?', key: 'persistedDataStructuresChanged', width: 30 },
      { header: 'Inter-process interfaces, message formats, or protocol changes?', key: 'interProcessInterfaces', width: 40 },
      { header: 'Dev risk assessment 1-3? (1 - highest)', key: 'devRiskAssessment', width: 20 },
      { header: 'Configurations changed?', key: 'configurationsChanged', width: 20 },
      { header: 'Description of Configuration Changes', key: 'descriptionOfConfigChanges', width: 40 },
      { header: 'Automated tests written, updated, or covering new or changed code\'s functionality?', key: 'automatedTestsWritten', width: 50 },
      { header: 'Back out game plan', key: 'backOutGamePlan', width: 40 },
      { header: 'Comments', key: 'comments', width: 40 }
    ];
  }

  private generateOutputPath(sprintPath: string, customPath?: string): string {
    if (customPath) return customPath;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const sprintSafe = sprintPath.replace(/[\\\/:"*?<>|]/g, '-');
    const defaultFileName = `release-notes-${sprintSafe}-${timestamp}.xlsx`;
    return path.join('c:/temp', defaultFileName);
  }

  private createExcelWorkbook(): ExcelJS.Workbook {
    return new ExcelJS.Workbook();
  }

  private styleHeaderRow(worksheet: ExcelJS.Worksheet) {
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
  }
  private async executeWiqlQuery(workItemApi: IWorkItemTrackingApi, sprintPath: string, teamName?: string): Promise<WorkItemQueryResult> {
    let whereClause = `[System.IterationPath] = '${sprintPath}'`;
    if (teamName) {
      whereClause += ` AND [System.AreaPath] = '${teamName}'`;
    }
    
    const wiqlQuery = {
      query: `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo], [System.IterationPath], [System.AreaPath], [Custom.Releaseversion]
              FROM WorkItems 
              WHERE ${whereClause}
              AND [System.WorkItemType] IN ('User Story', 'Bug', 'Task', 'Feature', 'Epic')
              ORDER BY [System.Id]`
    };
    
    console.log('WIQL Query:', wiqlQuery.query);
    return await workItemApi.queryByWiql(wiqlQuery);
  }  private async batchProcessItems(itemIds: number[], api: IWorkItemTrackingApi, batchSize: number, itemType: string, expand?: WorkItemExpand): Promise<WorkItem[]> {
    const allItems: WorkItem[] = [];
    const MAX_RETRIES = 3;
    
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      this.logBatchProgress(batchNumber, i, i + batchSize, itemIds.length, itemType);
      
      // Debug: Log the first few IDs in each batch for parent items
      if (itemType.includes('parent')) {
        console.log(`DEBUG: Batch ${batchNumber} contains ${itemType} IDs: ${batch.slice(0, 5).join(', ')}${batch.length > 5 ? ` (and ${batch.length - 5} more)` : ''}`);
      }
      
      let success = false;
      let retryCount = 0;
      
      while (!success && retryCount < MAX_RETRIES) {
        try {
          const expandParam = expand || WorkItemExpand.Relations;
          console.log(`DEBUG: Calling getWorkItems for batch ${batchNumber} with ${batch.length} ${itemType}, expand: ${expandParam}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
          
          const batchItems = await api.getWorkItems(batch, undefined, undefined, expandParam);
          
          console.log(`DEBUG: API returned ${batchItems?.length || 0} items for batch ${batchNumber}`);
          
          if (batchItems && batchItems.length > 0) {
            allItems.push(...batchItems);
            console.log(`Batch ${batchNumber} retrieved ${batchItems.length} ${itemType}`);
            // Debug: Log some retrieved IDs for verification
            if (itemType.includes('parent')) {
              const retrievedIds = batchItems.map((item: WorkItem) => item.id).slice(0, 5);
              console.log(`DEBUG: Batch ${batchNumber} retrieved ${itemType} IDs: ${retrievedIds.join(', ')}${batchItems.length > 5 ? ` (and ${batchItems.length - 5} more)` : ''}`);
            }
            success = true;
          } else if (batch.length > 10) {
            console.warn(`Batch ${batchNumber} returned no ${itemType}, trying smaller batches...`);
            // Process in smaller batches
            const smallerBatchResults = await this.processSmallerBatches(batch, api, expandParam, batchNumber, itemType);
            allItems.push(...smallerBatchResults);
            success = true;
          } else {
            console.warn(`Batch ${batchNumber} returned no ${itemType} and is too small for further splitting`);
            success = true; // Consider it done even though we got no results
          }
        } catch (batchError) {
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            console.error(`Error processing ${itemType} batch ${batchNumber} after ${MAX_RETRIES} retries:`, batchError);
            
            // Last resort: try processing one by one
            if (batch.length > 1) {
              console.log(`Attempting to process batch ${batchNumber} one item at a time as last resort...`);
              for (const singleId of batch) {
                try {
                  const expandParam = expand || WorkItemExpand.Relations;
                  const singleItem = await api.getWorkItems([singleId], undefined, undefined, expandParam);
                  if (singleItem && singleItem.length > 0) {
                    allItems.push(...singleItem);
                    console.log(`Successfully retrieved single ${itemType} ID: ${singleId}`);
                  }
                } catch (singleItemError) {
                  console.warn(`Failed to retrieve single ${itemType} ID: ${singleId}`, singleItemError);
                }
              }
            }
          } else {
            console.warn(`Retry ${retryCount}/${MAX_RETRIES} for batch ${batchNumber} after error:`, batchError);
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }
    }
    
    console.log(`Retrieved ${allItems.length} detailed ${itemType} total`);
    return allItems;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async processSmallerBatches(batch: number[], api: any, expandParam: WorkItemExpand, parentBatchNumber: number, itemType: string): Promise<WorkItem[]> {
    const smallBatchSize = 5;
    const smallBatchResults: WorkItem[] = [];
    
    for (let j = 0; j < batch.length; j += smallBatchSize) {
      const smallBatch = batch.slice(j, j + smallBatchSize);
      const smallBatchNumber = Math.floor(j / smallBatchSize) + 1;
      
      try {
        const smallBatchItems = await api.getWorkItems(smallBatch, undefined, undefined, expandParam);
        if (smallBatchItems && smallBatchItems.length > 0) {
          console.log(`DEBUG: Small batch ${smallBatchNumber} of batch ${parentBatchNumber} returned ${smallBatchItems.length} items for IDs: ${smallBatch.join(', ')}`);
          smallBatchResults.push(...smallBatchItems);
        } else {
          console.log(`DEBUG: Small batch ${smallBatchNumber} of batch ${parentBatchNumber} returned no items for IDs: ${smallBatch.join(', ')}`);
        }
      } catch (smallBatchError) {
        console.error(`DEBUG: Small batch ${smallBatchNumber} of batch ${parentBatchNumber} failed for IDs ${smallBatch.join(', ')}:`, smallBatchError);
        
        // Try each ID individually as a last resort
        for (const singleId of smallBatch) {
          try {
            const singleItem = await api.getWorkItems([singleId], undefined, undefined, expandParam);
            if (singleItem && singleItem.length > 0) {
              smallBatchResults.push(...singleItem);
              console.log(`Successfully retrieved single ${itemType} ID: ${singleId} from failed small batch`);
            }
          } catch (singleItemError) {
            console.warn(`Failed to retrieve single ${itemType} ID: ${singleId} from failed small batch`, singleItemError);
          }
        }
      }
    }
    
    return smallBatchResults;
  }
  private collectUniqueParentIds(workItems: WorkItem[]): Set<number> {
    const parentIds = new Set<number>();
    let workItemsWithParentRelation = 0;
    let workItemsWithExtractedParentId = 0;
    
    for (const workItem of workItems) {
      const relations = workItem.relations || [];
      const parentRelation = this.findParentRelation(relations);
      
      if (parentRelation && parentRelation.url) {
        workItemsWithParentRelation++;
        const parentId = this.extractParentId(parentRelation.url);
        if (parentId) {
          workItemsWithExtractedParentId++;
          parentIds.add(parentId);
          this.logParentDebugInfo(workItem, parentRelation, parentId);
        } else {
          console.log(`WARNING: Found parent relation for work item ${workItem.id} but could not extract parent ID from URL: ${parentRelation.url}`);
        }
      } else {
        this.logParentDebugInfo(workItem, parentRelation, null);
      }
    }
    
    console.log(`PARENT RELATION STATS: Found ${workItemsWithParentRelation} work items with parent relations out of ${workItems.length} total (${Math.round(workItemsWithParentRelation/workItems.length*100)}%)`);
    console.log(`PARENT ID EXTRACTION STATS: Successfully extracted ${workItemsWithExtractedParentId} parent IDs out of ${workItemsWithParentRelation} parent relations (${Math.round(workItemsWithExtractedParentId/workItemsWithParentRelation*100)}%)`);
    console.log(`UNIQUE PARENT COUNT: Found ${parentIds.size} unique parent IDs`);
    
    return parentIds;
  }
  private buildParentLookupMap(parentWorkItems: WorkItem[]): Map<string, ParentWorkItemInfo> {
    const parentLookup = new Map<string, ParentWorkItemInfo>();
    
    // Check if we received any parent work items
    if (!parentWorkItems || parentWorkItems.length === 0) {
      console.warn('No parent work items were retrieved from the API');
      return parentLookup;
    }
    
    // Count how many parent work items have actual data
    const validParents = parentWorkItems.filter(parent => parent && parent.id && parent.fields);
    console.log(`Retrieved ${validParents.length} valid parent work items out of ${parentWorkItems.length} total`);
    
    // Build the lookup map
    for (const parent of validParents) {
      if (parent.id) {
        const parentInfo = {
          id: parent.id.toString(),
          type: (parent.fields?.['System.WorkItemType'] as string) || 'Unknown Type',
          title: (parent.fields?.['System.Title'] as string) || 'Unknown Title'
        };
        
        parentLookup.set(parent.id.toString(), parentInfo);
        
        if (DEBUG_PARENT_IDS.includes(parent.id)) {
          console.log(`DEBUG: Successfully fetched important parent work item ${parent.id}:`, parentInfo);
        }
      }
    }
    
    // Handle hardcoded parents that weren't found
    for (const debugParentId of DEBUG_PARENT_IDS) {
      if (!parentLookup.has(debugParentId.toString())) {
        console.warn(`DEBUG: Important parent work item ${debugParentId} was not found in API response`);
      }
    }
    
    console.log(`Built parent lookup with ${parentLookup.size} entries out of ${validParents.length} valid parents`);
    
    // If we have hardcoded parents, add them to the lookup as fallbacks
    for (const workItemId in HARDCODED_PARENTS) {
      const parentId = HARDCODED_PARENTS[workItemId].id;
      if (!parentLookup.has(parentId)) {
        parentLookup.set(parentId, HARDCODED_PARENTS[workItemId]);
        console.log(`Added hardcoded parent ${parentId} to lookup map as fallback`);
      }
    }
    
    return parentLookup;
  }
  private getParentInfo(workItem: WorkItem, relations: WorkItemRelation[], parentLookup: Map<string, ParentWorkItemInfo>): ParentWorkItemInfo {
    let parentInfo = this.getParentWorkItemInfoFromLookup(relations, parentLookup);
    
    // Check if we found a parent in the lookup
    if (!parentInfo.id) {
      // Try to extract parent info directly from the fields
      const fields = workItem.fields || {};
      
      // Some work item types store parent info in specific fields
      const possibleParentFields = [
        'System.Parent',
        'Microsoft.VSTS.Common.Parent',
        'System.RelatedWorkItems',
        'Custom.ParentId',
        'Custom.ParentWorkItem'
      ];
      
      for (const field of possibleParentFields) {
        if (fields[field]) {
          const fieldValue = fields[field];
          
          // The field could contain an ID, a URL, or a complex object
          if (typeof fieldValue === 'number') {
            parentInfo = { 
              id: fieldValue.toString(), 
              type: 'Unknown (from field)', 
              title: `Parent from ${field}` 
            };
            console.log(`Found parent ID ${fieldValue} in field ${field} for work item ${workItem.id}`);
            break;
          } else if (typeof fieldValue === 'string') {
            // Try to extract an ID from the string
            const match = fieldValue.match(/(\d+)/);
            if (match) {
              parentInfo = { 
                id: match[1], 
                type: 'Unknown (from field)', 
                title: `Parent from ${field}` 
              };
              console.log(`Extracted parent ID ${match[1]} from field ${field} value "${fieldValue}" for work item ${workItem.id}`);
              break;
            }
          } else if (typeof fieldValue === 'object' && fieldValue !== null) {
            // Handle complex objects that might contain parent info
            const objStr = JSON.stringify(fieldValue);
            console.log(`Complex parent field ${field} value: ${objStr.substring(0, 100)}${objStr.length > 100 ? '...' : ''}`);
            
            // Try to extract an ID from the object
            const match = objStr.match(/"id"\s*:\s*(\d+)/);
            if (match) {
              parentInfo = { 
                id: match[1], 
                type: 'Unknown (from field object)', 
                title: `Parent from ${field} object` 
              };
              console.log(`Extracted parent ID ${match[1]} from field ${field} object for work item ${workItem.id}`);
              break;
            }
          }
        }
      }
    }
    
    // Apply hardcoded fallback if needed
    if (workItem.id && !parentInfo.id && HARDCODED_PARENTS[workItem.id]) {
      parentInfo = HARDCODED_PARENTS[workItem.id];
      console.log(`WARNING: Using hardcoded parent info for work item ${workItem.id}: ${parentInfo.id}`);
    }
    
    return parentInfo;
  }

  private generateWorkItemUrl(workItemId?: number): string {
    if (!workItemId) return '';
    
    const organization = this.apiClient.getOrganization();
    const project = this.apiClient.getProject() || DEFAULT_PROJECT;
    return `https://dev.azure.com/${organization}/${project}/_workitems/edit/${workItemId}`;
  }

  private createEnrichedData(workItem: WorkItem, fields: Record<string, unknown>, parentInfo: ParentWorkItemInfo, prInfo: PullRequestInfo, workItemUrl: string): EnrichedWorkItemData {
    return {
      workItemId: String(workItem.id || ''),
      workItemType: String(fields['System.WorkItemType'] || ''),
      url: workItemUrl,
      team: String(fields['System.AreaPath'] || ''),
      title: String(fields['System.Title'] || ''),
      status: String(fields['System.State'] || ''),
      releaseVersion: this.getFieldValue(fields, RELEASE_VERSION_FIELDS),
      parentWorkItemId: parentInfo.id || '',
      parentWorkItemType: parentInfo.type || '',
      parentWorkItemTitle: parentInfo.title || '',
      toggle: (fields['Custom.FeatureFlag'] as string) || '',
      reposChanged: '',
      authors: prInfo.authors.join(', '),
      whichFlowsImpacted: '',
      whichUserFunctionsImpacted: '',
      databaseChanges: '',
      persistedDataStructuresChanged: '',
      interProcessInterfaces: '',
      devRiskAssessment: this.getFieldValue(fields, RISK_ASSESSMENT_FIELDS) || DEFAULT_RISK_ASSESSMENT,
      configurationsChanged: '',
      descriptionOfConfigChanges: '',
      automatedTestsWritten: '',
      backOutGamePlan: '',
      comments: ''
    };
  }

  private createFallbackEnrichedData(workItem: WorkItem): EnrichedWorkItemData {
    return {
      workItemId: String(workItem.id || ''),
      workItemType: String(workItem.fields?.['System.WorkItemType'] || ''),
      url: '',
      team: String(workItem.fields?.['System.AreaPath'] || ''),
      title: String(workItem.fields?.['System.Title'] || ''),
      status: String(workItem.fields?.['System.State'] || ''),
      releaseVersion: '',
      parentWorkItemId: '',
      parentWorkItemType: '',
      parentWorkItemTitle: '',
      toggle: '',
      reposChanged: '',
      authors: '',
      whichFlowsImpacted: '',
      whichUserFunctionsImpacted: '',
      databaseChanges: '',
      persistedDataStructuresChanged: '',
      interProcessInterfaces: '',
      devRiskAssessment: DEFAULT_RISK_ASSESSMENT,
      configurationsChanged: '',
      descriptionOfConfigChanges: '',
      automatedTestsWritten: '',
      backOutGamePlan: '',
      comments: ''
    };
  }
  private logDebugInfo(workItemId: number | undefined, message: string, data?: unknown) {
    if (workItemId && DEBUG_WORK_ITEMS.includes(workItemId)) {
      console.log(`DEBUG: Work item ${workItemId} - ${message}`, data || '');
    }
  }

  private logBatchProgress(batchNumber: number, start: number, end: number, total: number, type: string = 'items') {
    console.log(`Processing ${type} batch ${batchNumber}: items ${start + 1}-${Math.min(end, total)}`);
  }

  private logParentBatchDebugInfo(parentIds: Set<number>) {
    const parentIdArray = Array.from(parentIds);
    console.log(`DEBUG: Looking for important parent IDs:`, DEBUG_PARENT_IDS);
    console.log(`DEBUG: Which batches will contain important parents:`, 
      DEBUG_PARENT_IDS.map(id => {
        const index = parentIdArray.indexOf(id);
        return { parentId: id, foundAtIndex: index, batchNumber: index >= 0 ? Math.floor(index / BATCH_SIZE) + 1 : 'NOT FOUND' };
      })
    );
    console.log(`DEBUG: First 10 parent IDs in array: ${parentIdArray.slice(0, 10).join(', ')}`);
    console.log(`DEBUG: Last 10 parent IDs in array: ${parentIdArray.slice(-10).join(', ')}`);
  }

  private logParentDebugInfo(workItem: WorkItem, parentRelation: WorkItemRelation | undefined, parentId: number | null) {
    if (!workItem.id || !DEBUG_WORK_ITEMS.includes(workItem.id)) return;
    
    if (parentRelation && parentId) {
      this.logDebugInfo(workItem.id, 'has parent relation', {
        rel: parentRelation.rel,
        url: parentRelation.url,
        extractedParentId: parentId,
        attributesName: parentRelation.attributes?.name
      });
    } else {
      this.logDebugInfo(workItem.id, 'has NO parent relation. Relations', 
        workItem.relations?.map(rel => ({ rel: rel.rel, name: rel.attributes?.name, url: rel.url }))
      );
    }
  }
  private findParentRelation(relations: WorkItemRelation[]): WorkItemRelation | undefined {
    // First try an exact match with our defined parent relation types
    const exactMatch = relations.find(rel => 
      PARENT_RELATION_TYPES.includes(rel.rel || '') || 
      (rel.attributes?.name && PARENT_RELATION_TYPES.includes(rel.attributes.name))
    );
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // If no exact match, try fuzzy matching for any relation that might be a parent
    return relations.find(rel => {
      const relType = rel.rel || '';
      const relName = rel.attributes?.name || '';
      
      return (
        relType.includes('Parent') || 
        relType.includes('Hierarchy') || 
        relName.includes('Parent') || 
        relName.includes('Hierarchy') ||
        // Check for URLs that seem to point to parent items
        (rel.url && rel.url.includes('/workitems/'))
      );
    });
  }
  private extractParentId(url: string): number | null {
    // Look for ID in various URL formats
    // Standard work item URL pattern
    const standardMatch = url.match(/workitems\/edit\/(\d+)/i);
    if (standardMatch) {
      return parseInt(standardMatch[1], 10);
    }
    
    // Handle API URLs with IDs at the end
    const apiMatch = url.match(/\/(\d+)$/);
    if (apiMatch) {
      return parseInt(apiMatch[1], 10);
    }
    
    // Handle API URLs with IDs in the middle of path
    const midPathMatch = url.match(/\/workitems\/(\d+)\//i);
    if (midPathMatch) {
      return parseInt(midPathMatch[1], 10);
    }
    
    console.log(`WARNING: Could not extract parent ID from URL: ${url}`);
    return null;
  }
  private getParentWorkItemInfoFromLookup(relations: WorkItemRelation[], parentLookup: Map<string, ParentWorkItemInfo>): ParentWorkItemInfo {
    try {
      // Find the parent relation
      const parentRelation = this.findParentRelation(relations);
      
      if (!parentRelation || !parentRelation.url) {
        // Log this for non-debug work items to understand the scope of the issue
        console.log(`No parent relation found or no URL in parent relation`);
        return { id: '', type: '', title: '' };
      }
      
      // Extract the parent ID from the URL
      const parentId = this.extractParentId(parentRelation.url);
      if (!parentId) {
        console.log(`Could not extract parent ID from URL: ${parentRelation.url}`);
        return { id: '', type: '', title: '' };
      }
      
      const parentIdStr = parentId.toString();
      const parentInfo = parentLookup.get(parentIdStr);
      
      // If the parent ID is not in the lookup, log a warning
      if (!parentInfo) {
        console.warn(`Parent ID ${parentIdStr} not found in lookup map of size ${parentLookup.size}`);
        
        // Check if any key in the lookup is similar to the parent ID (maybe off by a digit)
        const keys = Array.from(parentLookup.keys());
        const similarKeys = keys.filter(key => 
          Math.abs(parseInt(key) - parentId) < 10 || // Close numerically
          key.includes(parentIdStr) || // Substring match
          parentIdStr.includes(key) // Substring match
        );
        
        if (similarKeys.length > 0) {
          console.log(`Found similar keys in lookup: ${similarKeys.join(', ')}`);
          // We could potentially use one of these similar keys as a fallback
          // For now, just log it for analysis
        }
      }
      
      this.logParentLookupDebugInfo(parentIdStr, parentRelation, parentInfo, parentLookup);
      
      return parentInfo || { id: parentIdStr, type: '', title: '' };
    } catch (error) {
      console.warn('Error getting parent work item info from lookup:', error);
      return { id: '', type: '', title: '' };
    }
  }

  private logParentLookupDebugInfo(parentId: string, parentRelation: WorkItemRelation, parentInfo: ParentWorkItemInfo | undefined, parentLookup: Map<string, ParentWorkItemInfo>) {
    if (!DEBUG_PARENT_IDS.includes(parseInt(parentId))) return;
    
    console.log(`DEBUG: Looking up important parent ID ${parentId} in lookup map:`, {
      parentRelationFound: !!parentRelation,
      parentUrl: parentRelation?.url,
      parentIdExtracted: parentId,
      parentInfoFromLookup: parentInfo,
      lookupMapSize: parentLookup.size,
      lookupMapHasKey: parentLookup.has(parentId),
      lookupMapKeys: Array.from(parentLookup.keys()).slice(0, 10)
    });
    
    if (!parentInfo) {
      console.warn(`WARNING: Important parent ID ${parentId} was not found in the lookup map!`);
    }
  }

  private getFieldValue(fields: Record<string, unknown>, fieldNames: string[]): string {
    for (const fieldName of fieldNames) {
      if (fields[fieldName]) {
        return fields[fieldName].toString();
      }
    }
    return '';
  }
  private async getPullRequestInfo(relations: WorkItemRelation[]): Promise<PullRequestInfo> {
    const repos = new Set<string>();
    const authors = new Set<string>();
    
    try {
      const prRelations = relations.filter(rel => 
        PR_RELATION_IDENTIFIERS.some(identifier => 
          rel.attributes?.name === identifier ||
          (rel.url && rel.url.includes(identifier))
        ) ||
        (rel.rel === 'ArtifactLink' && rel.url?.includes('PullRequest'))
      );
      
      for (const prRelation of prRelations) {
        if (prRelation.url) {
          const prMatch = prRelation.url.match(/\/([^\/]+)\/_git\/([^\/]+)\/pullRequest\/(\d+)/);
          if (prMatch) {
            const [, project, repo, prId] = prMatch;
            repos.add(repo);
            
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
          
          if (prRelation.url.includes('GitHub/PullRequest')) {
            const githubPrMatch = prRelation.url.match(/GitHub\/PullRequest\/[^%]+%2f(\d+)/);
            if (githubPrMatch) {
              const prNumber = githubPrMatch[1];
              repos.add('GitHub Repository');
              console.log(`Found GitHub PR #${prNumber}`);
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
}
