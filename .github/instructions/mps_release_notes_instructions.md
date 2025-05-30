# Azure DevOps MCP Release Notes Tool Instructions

## Overview
This workspace contains an Azure DevOps Model Context Protocol (MCP) server with a release notes tool that can export work items to Excel format. Follow these instructions to successfully use the tool.

## Prerequisites
- The MCP server is already built and configured
- Azure DevOps authentication is set up via config file
- The release notes tool uses **exact path matching** for sprint and area paths

## Key Information
- **Sprint Path Format**: Use the complete iteration path exactly as it appears in Azure DevOps
- **Area Path Format**: Use the complete area path exactly as it appears in Azure DevOps
- **Tool Name**: `releaseNotes`
- **Operation**: `exportToExcel`

## Required Parameter Format
The tool expects these exact parameter names and format:

```json
{
  "operation": "exportToExcel",
  "exportToExcelParams": {
    "sprintPath": "Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21",
    "teamName": "Sledgehammer\\Editor\\BearHawks",
    "outputPath": "c:\\temp\\release-notes-output.xlsx"
  }
}
```

## Step-by-Step Usage

### 1. Call the MCP Tool
Use the `releaseNotes` tool with the following structure:

**Tool Name**: `releaseNotes`

**Parameters**:
- `operation`: Must be `"exportToExcel"`
- `exportToExcelParams`: Object containing the required and optional parameters

### 2. Parameter Details

#### Required Parameters:
- **sprintPath**: The exact iteration path from Azure DevOps
  - Example: `"Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21"`
  - Note: Use double backslashes in JSON strings

#### Optional Parameters:
- **teamName**: The exact area path from Azure DevOps (recommended for filtering)
  - Example: `"Sledgehammer\\Editor\\BearHawks"`
  - Note: Use double backslashes in JSON strings

- **outputPath**: Full path where to save the Excel file
  - Default: Current directory with generated filename
  - Example: `"c:\\temp\\release-notes-output.xlsx"`

### 3. Example Call
For a natural language request like "Generate release notes for sprint 'Sledgehammer\Phase 12 (2025)\Sprint 12.06 Apr 21' and area 'Sledgehammer\Editor\BearHawks'", the AI assistant should call:

```
releaseNotes with:
- operation: "exportToExcel"  
- exportToExcelParams: {
    "sprintPath": "Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21",
    "teamName": "Sledgehammer\\Editor\\BearHawks", 
    "outputPath": "c:\\temp\\release-notes-output.xlsx"
  }
```

## Expected Output
The tool will:
1. Query Azure DevOps for work items matching the exact sprint and area paths
2. Retrieve detailed work item information including:
   - Work item details (ID, title, type, state, assigned to)
   - Parent work item information
   - Feature flag data
   - Linked pull request information
   - Repository and author data
3. Create an Excel file with all the release notes data (manual fields will be empty for completion)
4. Return success confirmation with file path and work item count

## Common Pitfalls to Avoid

### 1. Path Format Issues
- ❌ Don't use partial paths like `"Sprint 12.06"` or `"BearHawks"`
- ✅ Use complete paths: `"Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21"`

### 2. JSON Escaping
- ❌ Don't use single backslashes: `"Sledgehammer\Phase 12"`
- ✅ Use double backslashes in JSON: `"Sledgehammer\\Phase 12"`

### 3. Parameter Structure
- ❌ Don't pass parameters directly to the tool
- ✅ Wrap all parameters in `exportToExcelParams` object

## Validation
After calling the tool, you should see:
- A success message with the file path
- The number of work items processed
- An Excel file created at the specified location

## Troubleshooting
- If no work items are found, verify the exact sprint and area paths in Azure DevOps
- If the tool fails, check that the exportToExcelParams is properly formatted JSON
- Ensure all backslashes are properly escaped in the JSON string
- If VS Code shows schema validation errors, restart VS Code to refresh the MCP tool schemas

## Working Example
For the prompt "Generate release notes for sprint 'Sledgehammer\Phase 12 (2025)\Sprint 12.06 Apr 21' and area 'Sledgehammer\Editor\BearHawks'":

Use these exact parameters:
- sprintPath: `"Sledgehammer\\Phase 12 (2025)\\Sprint 12.06 Apr 21"`
- teamName: `"Sledgehammer\\Editor\\BearHawks"`
- outputPath: `"c:\\temp\\release-notes-output.xlsx"`

Expected result: Excel file with 20 work items and comprehensive release notes data.
