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
Use ADO to fetch the parent item before showing the results, so you can include parent id, type, and title in the response.

<!-- - @ado Rule - Query Single Work Item Directly: When asked about one ADO work item, use the workItems tool with operation "get" and expand "Relations" to get full details. Do not attempt to use terminals, curl commands, or local MCP servers. Format the response as a clear summary including:
  - Work Item Title and ID
  - Type and Status
  - Area and Iteration Path
  - Assignment and Timeline
  - Feature Details (Feature Flags, Description)
  - Related Artifacts (PRs, Commits)
  - Any other relevant fields like Story Points or Custom Fields
  - Release version
  - Parent work item ID ()
  - Parent work item type
  - Parent work item title
  - Toggle
  - Repos changed
  - Authors -->


## Error Handling
1. Return clear error messages
2. Include HTTP status codes
3. Provide guidance for common errors:
   - Authentication failures
   - Rate limiting
   - Invalid queries