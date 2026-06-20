import chalk from 'chalk';

const DOCS = `
WREXER DEVELOPER & ARCHITECTURE GUIDE
=====================================

1. DATABASES & SSL
------------------
Wrexer managed databases are fully isolated within your tenant namespace.
Because traffic is routed internally via Kubernetes DNS (.svc.cluster.local), 
connections are NOT encrypted with SSL/TLS.
* CRITICAL RULE: When connecting to a Wrexer database using drivers like 'pg' (PostgreSQL), 
  do NOT use \`ssl: true\` or \`ssl: { rejectUnauthorized: false }\`. 
  Doing so will result in "The server does not support SSL connections" errors.

2. ENVIRONMENT VARIABLES
------------------------
Environment variables cannot be set dynamically after an app is deployed.
* CRITICAL RULE: When deploying an app that needs a database or API key, 
  you MUST pass the variables during deployment using the \`--env\` flag.
  Example: \`wrexer deploy --name api --image my/api:v1 --port 3000 --plan small --env DATABASE_URL="..."\`

3. IDENTIFIERS (NAME vs ID)
---------------------------
Apps and Databases have both a human-readable 'name' and a UUID 'id'.
* Creating/Deploying: You define the \`name\`.
* Stopping/Waiting/Deleting: You MUST use the \`id\` (UUID).
  Example: \`wrexer wait app 56adc7cd-851b-4714-aed6-7c56083fefc4\`

4. INTERNAL NETWORKING
----------------------
To communicate between two applications (e.g., frontend talking to backend), 
use the internal URLs provided by \`wrexer list apps\`.
Do not try to bind to localhost (127.0.0.1) or ::1 if you expect external traffic. 
Your application MUST listen on \`0.0.0.0\` to receive traffic.

5. DEBUGGING
------------
If an application is crashing or "Connection Refused" occurs:
1. Verify the app is listening on \`0.0.0.0\` and the correct \`port\`.
2. Check the logs: \`wrexer logs <id>\`
3. If it's a database connection issue, verify you removed the SSL config.
`;

export async function docs() {
  console.log(chalk.cyan(DOCS));
}
