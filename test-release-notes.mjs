// Test the release notes tool end-to-end with performance monitoring
import { ReleaseNotesTool } from './build/tools/release-notes.tool.js';
import { ADOApiClient } from './build/api/client/index.js';
import fs from 'fs';

console.log('🚀 Testing Release Notes Tool');
console.log('==============================');

// Load configuration
const config = JSON.parse(fs.readFileSync('./config/azuredevops.json', 'utf8'));

// Create API client
const apiClient = new ADOApiClient({
  organization: config.organization,
  project: config.project,
  credentials: {
    pat: config.credentials.pat
  },
  baseUrl: config.api?.baseUrl,
  version: config.api?.version,
  retry: config.api?.retry
});

// Create release notes tool
const tool = new ReleaseNotesTool(apiClient);

// Test parameters
const testParams = {
  sprintPath: 'Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21',
  outputPath: 'c:\\temp\\optimized-release-notes-test.xlsx'
};

console.log(`📋 Testing sprint: ${testParams.sprintPath}`);
console.log(`📁 Output file: ${testParams.outputPath}`);
console.log('');

const startTime = Date.now();

try {
  console.log('⏱️  Starting release notes generation...');
  
  const result = await tool.exportReleaseNotesToExcel(testParams);
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log('');
  console.log('📊 RESULTS:');
  console.log('===========');
    if (result.success) {
    console.log(`✅ Success! Generated in ${Math.round(duration / 1000)}s (${duration}ms)`);
    console.log(`📝 Work items processed: ${result.workItemsCount || result.totalItems || 'Unknown'}`);
    console.log(`👥 Parent items found: ${result.parentItemsCount || 'Unknown'}`);
    console.log(`📁 Output file: ${result.filePath}`);
    
    // Check file size and existence
    if (fs.existsSync(result.filePath)) {
      const stats = fs.statSync(result.filePath);
      console.log(`📊 File size: ${Math.round(stats.size / 1024)}KB`);
      
      // Performance analysis
      if (result.workItemsCount || result.totalItems) {
        const itemCount = result.workItemsCount || result.totalItems;
        const timePerItem = duration / itemCount;
        console.log(`⚡ Performance: ${Math.round(timePerItem)}ms per work item`);
        
        if (timePerItem < 100) {
          console.log('🚀 Excellent performance!');
        } else if (timePerItem < 500) {
          console.log('✅ Good performance');
        } else {
          console.log('⚠️  Performance could be improved');
        }
      }
    } else {
      console.log('❌ Output file was not created');
    }
  } else {
    console.log(`❌ Failed: ${result.message}`);
  }
  
} catch (error) {
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log('');
  console.log('❌ ERROR:');
  console.log('=========');
  console.log(`Failed after ${Math.round(duration / 1000)}s (${duration}ms)`);
  console.log(`Error: ${error.message}`);
  
  if (error.stack) {
    console.log('Stack trace:');
    console.log(error.stack);
  }
}

console.log('');
console.log('🏁 Test completed');
