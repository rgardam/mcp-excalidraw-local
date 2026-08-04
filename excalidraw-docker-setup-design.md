# Excalidraw MCP Docker Containerization Design

## Overview

Enable the Excalidraw MCP server to run in Docker containers using the existing Docker Compose configuration. This provides a consistent, isolated environment for the MCP server and canvas interface.

## Architecture

The project includes pre-built Docker infrastructure with two container options:

### Container Components
- **MCP Server Container** (`Dockerfile`): Runs the MCP stdio server with 32 tools + embedded canvas server
- **Canvas Container** (`Dockerfile.canvas`): Runs the complete stack (MCP + Express + WebSocket + React frontend)

### Data Flow
```
Docker Compose → Canvas Container → MCP Server (embedded) → SQLite DB
                              ↓
                         WebSocket + HTTP API
                              ↓
                         React Frontend (port 3000)
```

## Implementation Approach

### Using Docker Compose "full" Profile
- Leverage existing `docker-compose.yml` with "full" profile
- Utilizes both `Dockerfile` (MCP only) and `Dockerfile.canvas` (complete stack)
- Handles container networking and service dependencies automatically
- Exposes canvas interface on port 3000

### Data Persistence
- SQLite database persists within container filesystem
- Container logs accessible via Docker logging system
- Configuration via environment variables

### Service Access Points
- **MCP Tools**: Accessible via stdio interface from canvas container
- **Web Interface**: Available at `http://localhost:3000`
- **Health Check**: Endpoint at `http://localhost:3000/health`
- **API**: REST endpoints for diagram operations

## Setup Process

1. **Build containers**: Use docker-compose to build both MCP and canvas images
2. **Start services**: Launch with "full" profile to run complete stack
3. **Verify connectivity**: Check health endpoint and web interface
4. **Test MCP functionality**: Validate tool access and diagram creation

## Benefits

- **Isolation**: Containerized environment prevents conflicts
- **Consistency**: Same environment across different machines
- **Simplicity**: Uses existing Docker infrastructure
- **Complete stack**: Both MCP server and web interface available
- **Easy management**: Single docker-compose command to manage services

## Success Criteria

- Canvas server accessible at localhost:3000
- MCP tools respond correctly via container
- Diagram creation and persistence working
- Health check endpoint returns success