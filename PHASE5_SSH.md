# Phase 5: VPS SSH single-command MVP

Status: implemented on feature branch, **disabled by default; not deployed or E2E-verified**. Phase 4 remains on hold. The original requirement for interactive terminal input remains open; this MVP handles a single non-interactive command per interaction.

## Scope and boundaries

- The operator-only Discord guild uses `/xplay-vps exec command:<one command>`; reply is visible only to the requester.
- The Bot connects from the app VPS's container to the Minecraft VPS over SSH as a **dedicated, non-root account**. This is **not** the DiscordSRV Minecraft console and does not use Minecraft's `minecraft` or Linux `root` identity.
- Remote command text is interpreted by that account's remote shell. Operators can run shell syntax, but the command must be one line (1–400 characters). Restrict actual capabilities with Unix file permissions, network restrictions and no sudo; a string filter is not a sandbox.
- 20-second client timeout, 8 KiB cumulative output limit, 1 SSH subprocess per invocation, no interactive TTY, no stdin, and output truncated to ~1500 characters per ephemeral reply. A detached remote process may survive SSH termination; do not assume timeout is a remote kill guarantee.
- Logs retain user ID, interaction ID, command SHA-256 prefix, result, exit code and duration, **not command text or stdout/stderr**. Do not enter secrets as commands or print secret files into Discord: ephemeral messages are not a secure secrets manager.
- Future interactive sessions are still Phase 5 work; they require owner/session locking, input/output routing, inactivity timeouts and independent review.

## Safety and command namespace

- `VPS_SSH_ENABLED=false` by default. The optional `compose.ssh.yaml` sets it to true and mounts a private key and independently verified known_hosts file as read-only secrets. Do not use that override before provisioning.
- Runtime rejects invalid Guild/Channel/Role IDs, missing SSH target, `root` SSH user, missing/empty secret files and group/world-readable private key.
- Discord checks **all three**: configured guild ID, channel ID and membership in at least one configured role. A guild-local `/xplay-vps` command is registered with default permissions disabled; explicitly grant the configured role access using Discord's Integrations command permissions. Even if an Administrator can see it, runtime authorization still applies.
- A pre-existing global command with the same name or a non-XPlay guild command with the same name stops registration instead of silently replacing DiscordSRV's commands.
- OpenSSH runs with `StrictHostKeyChecking=yes`, a dedicated known_hosts file, disabled password/agent authentication and forwarding, no custom SSH config and no PTY. Pinning the host key is mandatory. No additional inbound API port is created.
- **Do not enable two Bot instances for the same operator guild simultaneously.** They share the same Bot Application; both could process one Discord interaction and run the command twice. Disable Phase 5 on production while testing in development, or use separate operator guilds and non-overlapping deployment permissions.

## Prerequisites requiring operator action

1. On the Minecraft VPS, create a dedicated unprivileged SSH account (e.g. `xplaybot`) with its own home, no sudo group membership and no access to `/opt/minecraft/server/.env` or other credentials. Keep the existing service account separate. Ensure the account's authorized_keys line contains the Bot-only **public** key; prefer `restrict` and optionally `from="APP_VPS_EGRESS_IP"` key options. Never add a root key or reuse a human operator's SSH key.
2. Generate a new ed25519 SSH key pair **outside Git** on an operator-controlled host. Transfer only the public key to the Minecraft VPS; store the private key on the app VPS in a root-administered secrets directory. On Linux, arrange the private-key file to be readable by container UID 1000 only (e.g. owner UID 1000, mode 0400). File-backed Compose secrets are bind mounts and **do not remap uid/gid/mode**. On Windows use a WSL2/Linux filesystem for permissions, or test with a Linux test host.
3. Obtain the Minecraft VPS's SSH host public key through a trusted channel (for example the existing authenticated VPS console), record its SHA-256 fingerprint, and compare it with the fingerprint of a `ssh-keyscan` result **before** placing the scanned line in the private known_hosts file. `ssh-keyscan` alone does not authenticate a host. For non-default ports, its known_hosts entry begins `[host]:port`.
4. Confirm the app VPS can reach the Minecraft VPS's existing SSH port. Where practical, firewall-restrict the source to the app VPS. No new HTTP/SSH listener is needed in the Bot.
5. Set the values in the Bot host's Git-ignored `.env` (sample in `.env.example`): `VPS_ADMIN_GUILD_ID`, `VPS_ADMIN_CHANNEL_ID`, `VPS_ADMIN_ROLE_IDS`, `VPS_SSH_HOST`, `VPS_SSH_PORT`, `VPS_SSH_USER`, `VPS_SSH_KEY_SOURCE`, and `VPS_SSH_KNOWN_HOSTS_SOURCE`. These paths are **host** paths (not container paths); both files must already exist. Do not paste actual IDs, IPs or any private key into this repository's tracked files.
6. In the operator Discord guild, enable the `xplay-vps` command for the appropriate role(s) via Server Settings → Integrations and deny other members/channels. Bot-side checks are mandatory regardless of UI permissions.

## Development test (Windows 11 / Docker Desktop + WSL2)

From the VSCode terminal at the repository root, after supplying a test SSH target and operator guild values:

```powershell
git switch feature/phase5-vps-ssh
git pull --ff-only origin feature/phase5-vps-ssh
npm ci
npm run verify
docker compose -f compose.yaml -f compose.dev.yaml -f compose.ssh.yaml up -d --build
docker compose -f compose.yaml -f compose.dev.yaml -f compose.ssh.yaml logs --tail=100 bot
```

Before testing, **ensure the production Bot does not have Phase 5 enabled for the same guild**. Test `whoami` (must return the dedicated account), `pwd`, a deliberate nonzero exit, wrong role/channel rejection, SSH authentication/host-key failure, timeout and output cap. The response must be ephemeral and the token/key/command/output must not appear in Bot logs. Disable again using the original Compose files (without `compose.ssh.yaml`); `restart` alone does not remove an override from an existing container:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml -f compose.ssh.yaml down
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

## Production deployment (only after development verification)

Review feature changes and merge them into `develop` separately. Pull the chosen revision on the app VPS; keep the Minecraft VPS's Git repo untouched for this feature. Provision the production-only SSH key and pinned host key there, then rebuild/recreate with the optional overlay:

```bash
git pull --ff-only origin develop
docker compose -f compose.yaml -f compose.prod.yaml -f compose.ssh.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml -f compose.ssh.yaml ps bot
docker compose -f compose.yaml -f compose.prod.yaml -f compose.ssh.yaml logs --tail=100 bot
```

To disable Phase 5 again, remove the optional overlay and **recreate** the container using only `compose.yaml` + `compose.prod.yaml`, first taking down the SSH-enabled stack if necessary. Stop the Bot before rotating/revoking its SSH key. Never push private keys or verified known_hosts content into Git.

## Remaining decisions and E2E acceptance

- Operator must choose actual target host/port, dedicated account privileges, administrator guild/channel/role IDs, and trusted SSH host key; no values are invented in code.
- Verify the dedicated account can perform the intended tasks without access to other users' secrets. Actions requiring `sudo`, service restart or access to Minecraft-owned files are **not** granted by this MVP; a separately designed, narrow privileged helper is required if those are desired.
- E2E testing and production promotion remain unconfirmed until the operator provisions SSH and performs the tests above.
