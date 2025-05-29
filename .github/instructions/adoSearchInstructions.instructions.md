# Azure DevOps Search Instructions

## Purpose
These instructions guide the chatbot in handling Azure DevOps (ADO) related queries and operations.

## General Guidelines
1. All ADO API requests should use PAT (Personal Access Token) authentication
2. Search queries should be properly encoded
3. Handle pagination for large result sets
4. Implement error handling for failed requests
5. Respect rate limits

## Search Operations
- When searching work items:
  - Use `/_apis/wit/wiql` endpoint
  - Include "Sledgehammer" project scope unless a project scope is provided.
  - Support both ID and keyword-based searches
  

## Response Formatting
When asked to provide release notes, use ADO to populate the following fields for each work item (of any type or state) in the given sprint:
When handling Parent work item id, type, and title, use ADO to fetch the parent item and include its details in the response.
return the data as csv, so that it can be applied to a table with the following columns.
Fill in the data as best you can, and let me know what you need me to fill in manually.

- Include the following fields in the response:
  - Release version
  - Parent work item ID ()
  - Parent work item type
  - Parent work item title
  - Toggle
  - Repos changed
  - Authors
  - Which flows impacted?
  - Which user functions impacted?
  - Database changes?
  - Persisted data structures changed?
  - Inter-process interfaces, message formats, or protocol changes?
  - Dev risk assessment (1-3)
  - Configurations changed?
  - Description of configuration changes
  - Automated tests written, updated, or covering new or changed code’s functionality?
  - Back out game plan
  - Comments


## Error Handling
1. Return clear error messages
2. Include HTTP status codes
3. Provide guidance for common errors:
   - Authentication failures
   - Rate limiting
   - Invalid queries