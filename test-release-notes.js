import { ReleaseNotesTool } from './build/tools/release-notes.tool.js';
import { ADOApiClient } from './build/api/client/index.js';
import { ConfigManager } from './build/config/index.js';

async function testReleaseNotes() {
  console.log('Starting release notes generation...');
  try {
    console.log('Loading configuration...');
    const config = ConfigManager.loadConfig();
    console.log('Config loaded:', config.organization, config.project);
    
    console.log('Creating API client...');
    const apiClient = new ADOApiClient(config);
    
    console.log('Creating release notes tool...');
    const releaseTool = new ReleaseNotesTool(apiClient);
    
    console.log('Calling export function...');
    const result = await releaseTool.exportReleaseNotesToExcel({
      sprintPath: 'Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21',
      teamName: 'Sledgehammer\\Editor\\BearHawks',
      outputPath: 'C:\\Users\\rr829771\\base\\skunk\\ado-mcp\\release-notes-sprint-12-06.xlsx',
      userInputs: {
        whichFlowsImpacted: 'Login and Authentication flows',
        databaseChanges: 'No significant database changes',
        comments: 'Generated via direct tool call'
      }
    });
    
    console.log('Release notes result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error generating release notes:', error);
    console.error('Stack trace:', error.stack);
  }
}

testReleaseNotes();
