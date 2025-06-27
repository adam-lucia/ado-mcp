# Azure DevOps MCP Tool - Usage Instructions

## Quick Start Guide for Work Item Queries

This guide shows you how to use natural language queries to retrieve Azure DevOps work items in both table format and automatically export them to CSV files.

## 🚀 Basic Usage Pattern

### Single Command for Table + CSV Export

Use this pattern to get work items displayed in your terminal AND automatically saved to a CSV file.  On structuring the 
a query from natural language, if more than one criteria is specified, the query will be executed with all criteria applied:

```
Query: "get all active work items assigned to adam lucia"
```

**What happens:**
1. ✅ Displays results in formatted table in terminal
2. ✅ Automatically creates a CSV file: `work_items_export_YYYYMMDD_HHMMSS.csv`
3. ✅ Shows summary statistics (count, types, sprints, etc.)

## 📊 Output Formats

### 1. Terminal Table Display
```
Found 5 active work items

| ID     | Type        | Title                                    | State  | Sprint              |
|--------|-------------|------------------------------------------|--------|---------------------|
| 337248 | User Story  | [AB Improvements] "Locked anchor"...    | Active | Sprint 12.09 Jun 23 |
| 334502 | User Story  | [Test after fix Bug 353449]...          | Active | Sprint 12.09 Jun 23 |
| 348304 | User Story  | Shift Left Create custom snippet...     | Active | Sprint Tech Debt    |
```

### 2. Automatic CSV Export
**File:** `work_items_export_20250530_143022.csv`
```csv
Work Item ID,Type,Title,State,Assigned To,Iteration,Area,URL
337248,User Story,"[AB Improvements] ""Locked anchor"" setting - import functionality",Active,Adam Lucia,Sledgehammer\Phase 12 (2025)\Sprint 12.09 Jun 23,Sledgehammer\Editor\BearHawks,https://dev.azure.com/DFIN/Sledgehammer/_workitems/edit/337248
```

## 🎯 Advanced Query Options

### Limit Results
```
"get first 10 active work items assigned to me"
"show latest 25 completed user stories"
```

### Specific Time Ranges
```
"show work items created this week"
"get work items updated in last 7 days"
"find work items closed yesterday"
```

### Include Additional Fields
Add these phrases to get more data in your export:
```
"with descriptions" - includes work item descriptions
"with acceptance criteria" - includes acceptance criteria
"with tags" - includes work item tags
"with comments" - includes latest comments
```

Example:
```
"get all active user stories assigned to me with descriptions and tags"
```

## 📁 File Management

### CSV File Naming Convention
- **Pattern:** `work_items_export_YYYYMMDD_HHMMSS.csv`
- **Location:** Current workspace directory
- **Example:** `work_items_export_20250530_143022.csv`

### Custom File Names
You can specify a custom filename:
```
"export active work items to sprint_12_09_items.csv"
"save my work items as adam_backlog.csv"
```

## 🔧 Configuration & Setup

### Required Environment Variables
Make sure these are set in your MCP configuration:

```json
{
  "env": {
    "ADO_ORGANIZATION": "DFIN",
    "ADO_PROJECT": "Sledgehammer", 
    "ADO_PAT": "your_personal_access_token"
  }
}
```

## 📚 Additional Resources

- **Azure DevOps REST API:** [Official Documentation](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
- **WIQL Reference:** [Work Item Query Language](https://docs.microsoft.com/en-us/azure/devops/boards/queries/wiql-syntax)
- **MCP Protocol:** [Model Context Protocol Specification](https://modelcontextprotocol.io/docs)

---

## 🎯 Quick Reference Card

| **Goal** | **Natural Language Query** |
|----------|----------------------------|
| My active work | `"get my active work items"` |
| Sprint items | `"show work items in current sprint"` |
| Team bugs | `"find all bugs for BearHawks team"` |
| Export to file | `"export active work items to my_items.csv"` |
| With details | `"get my work items with descriptions"` |
| Count only | `"count active work items by type"` |

**Remember:** Every query automatically provides both terminal display AND CSV export!
