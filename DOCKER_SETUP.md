# Docker Setup for Excalidraw MCP

## Quick Start

1. Build images:
   ```bash
   docker build -t sanjibdevnath/mcp-excalidraw-local:latest -f Dockerfile .
   docker build -t sanjibdevnath/mcp-excalidraw-local-canvas:latest -f Dockerfile.canvas .
   ```

2. Start services:
   ```bash
   docker-compose --profile full up -d
   ```

3. Access canvas: http://localhost:3000

4. Stop services:
   ```bash
   docker-compose --profile full down
   ```

## Services

- **canvas**: Web UI and REST API (port 3000)
- **mcp**: MCP stdio server connected to canvas

## Data Persistence

SQLite database persists in `/app/data/excalidraw.db` within containers.
