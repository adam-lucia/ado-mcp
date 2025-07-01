# Open WebUI Integration Guide: Gemini & ADO-MCP Tool Server

This guide explains how to:

- Enable Google Gemini in Open WebUI
- Add your ADO-MCP server as a tool server in Open WebUI

---

## 1. Enable Gemini in Open WebUI

### Prerequisites

- You have a valid Gemini API key (example: `AIzaSyD8HCYHvV7QQDNPDp-N4PxNt4klrET_KWE`)
- You are running Open WebUI via Docker Compose or similar

### Steps

1. **Set Environment Variables**

   - In your `.env` file (in the same directory as your Docker Compose file), add:
     ```env
     GEMINI_API_KEY=your_gemini_api_key_here
     GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
     ```
   - Replace `your_gemini_api_key_here` with your actual Gemini API key.

2. **Restart Open WebUI**

   ```sh
   docker compose -f docker-compose.openwebui.yml up -d
   ```

3. **Add Gemini as a Connection in Open WebUI**

   - Go to **Settings > Connections** in the Open WebUI interface.
   - Click the `+` next to "Manage OpenAI API Connections".
   - For **API URL**, enter:
     ```
     https://generativelanguage.googleapis.com/v1beta
     ```
   - For **API Key**, enter your Gemini API key.
   - Save the connection.
   - Manually add a model (e.g., `gemini-1.5-flash` or `gemini-2.0-flash`) if prompted.

4. **Test Gemini**
   - Select the Gemini model in the model dropdown and try a prompt.

---

## 2. Add ADO-MCP as a Tool Server in Open WebUI

### Prerequisites

- ADO-MCP is running as a service in your Docker Compose setup
- The API key for ADO-MCP is: `azure-devops-mcp-server`

### Steps

1. **Find the Internal URL for ADO-MCP**

   - If using Docker Compose, the service name is usually `ado-mcp` and the port is `8000`.
   - The internal URL (from Open WebUI's perspective) is:
     ```
     http://ado-mcp:8000/openapi.json
     ```

2. **Add as a Tool Server in Open WebUI**

   - Go to **Settings > Connections > Direct Connections** (or "OpenAPI Tool Servers").
   - Click the `+` to add a new connection.
   - For **URL**, enter:
     ```
     http://ado-mcp:8000/openapi.json
     ```
   - For **API Key**, enter:
     ```
     azure-devops-mcp-server
     ```
   - Save the connection.

3. **Verify Tool Availability**
   - Go to the **Tools** section in Open WebUI.
   - You should see tools like Projects, Repositories, WorkItems, etc., from your ADO-MCP server.
   - Try running a tool (e.g., list projects) to verify connectivity.

---

## 3. Example Test Prompts for ADO-MCP Tools

### List Projects

```
{
  "operation": "list",
  "listParams": {
    "maxResults": 5
  }
}
```

### Get Project Details

```
{
  "operation": "get",
  "getParams": {
    "projectId": "MyProject",
    "includeCapabilities": true
  }
}
```

---

## Troubleshooting

- If you see `Invalid API key`, double-check the API key in both Open WebUI and your ADO-MCP server configuration.
- If Gemini does not appear, ensure your environment variables are set and the container is restarted.
- For network issues, ensure both services are on the same Docker network.

---

For further help, check the Open WebUI and ADO-MCP logs, or reach out to the project maintainers.
