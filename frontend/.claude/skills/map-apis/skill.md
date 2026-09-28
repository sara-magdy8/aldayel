---

name: Map APIs
description: Link Laravel apis and React page
tools: Read, Edit, Grep, TodoWrite
model: sonnet
color: magenta
maxTurns: 12
------------

# Goal

Connect a Laravel apis and React component.

Arguments:

* $1 = Laravel controller file
* $2 = React page file

---

# Global Rules

* Preserve existing architecture
* Preserve UI styling
* Preserve TypeScript types
* Keep changes minimal
* Do not invent database columns
* Do not rewrite unrelated logic
* Reuse existing services/actions/DTOs if present
* Preserve authorization and middleware
* Preserve validation behavior

---
This skill uses multiple subagents to break down the task:
1. Backend Agent
2. Frontend Agent
3. Coordinator

---
# Backend Agent

Analyze backend apis.

Tasks:

* Inspect routes referencing the controller
* Inspect Form Requests used by controller methods
* Inspect API Resources and Transformers
* Follow response data to its source before mapping

Output:

* Backend apis routes with required parameters and response format

---

# Frontend Agent

Analyze and update React page.

API Configuration:

Never hardcode API URLs
Use a centralized API configuration
Read API base URL from .env file
Reuse existing API service/client if present
Create one if missing

Environment Variables:

VITE_API_BASE_URL=http://localhost:8000/api
All API calls must use this value

Preferred Structure:

src/
├── services/
│ ├── api.ts
│ └── users.ts
├── pages/
└── components/

Example:

// services/api.ts
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL;

export const api = axios.create({
  baseURL: API_BASE_URL,
});

Requirements:

Replace any hardcoded URLs with API_BASE_URL
Reuse existing axios/fetch wrapper if available
Create typed service functions when appropriate
React pages should call service functions rather than constructing URLs directly
Switching environments must require changing only environment variables

Tasks:

* Replace mock table data with backend apis calls
* Connect filters to backend query params
* handle pagination if needed
* Connect export button if needed
* Replace static dropdown data with backend apis calls if needed
* Connect status toggle actions if present
* Connect save/update/delete actions to backend apis calls if present
* If charts exist, load chart data from the backend apis calls
* Preserve filter state during pagination and export
* If charts exist, load chart data from the full filtered dataset, not only the current paginated page
* Ensure charts react correctly to active filters and search parameters
* Keep all existing component structure, styling, and UX behavior unchanged
* Preserve and improve TypeScript type safety where needed
* If route cannot be located, report it as missing

Analyze:

* Existing component patterns
* Shared components

Output:

* Updated React page
* Mapping summary
* Missing dependencies/issues

---

# Final Coordinator Output

Return:

1. Backend changes
2. Frontend changes
3. API endpoint mappings
4. Assumptions
5. Remaining manual work if needed
