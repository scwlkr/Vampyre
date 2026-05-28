export function buildServiceUnit(workspaceRoot: string): string {
  return `[Unit]
Description=Vampyre central daemon
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${workspaceRoot}/app
Environment=VAMPYRE_WORKSPACE_ROOT=${workspaceRoot}
EnvironmentFile=${workspaceRoot}/config/vampyre.env
ExecStart=/usr/bin/node ${workspaceRoot}/app/dist/daemon/runDaemon.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
}
