---
name: dafke-deploy
description: Use when the user wants to check deployment status, monitor releases, or review DORA deployment metrics
category: observability
allowed-tools:
  - Bash
  - Read
  - Grep
---

# /dafke-deploy

Monitor deployment status and provide DORA metrics.

## Steps

1. **Read manifest** — Load `.dafke/manifest.yaml` for deployment config:
   - Platform: `azure-app-service` | `kubernetes` | `vercel` | `aws` | etc.
   - Environments: dev, staging, production.
   - Health check URLs.

2. **Check deployment status**:
   - **GitHub**: `gh api repos/{owner}/{repo}/deployments --jq '.[0:5]'`.
   - **Azure**: `az webapp deployment list` or pipeline deploy stage status.
   - Show: Environment, Version, Status, Timestamp, Deployer.

3. **Verify health checks** — For each configured health endpoint:
   - Run `curl -sf <url>/health` (or configured path).
   - Report: HTTP status, response time, health payload.
   - Flag any unhealthy services.

4. **Calculate DORA metrics** for this deployment:

   | Metric | How to Calculate |
   |--------|-----------------|
   | Deployment Frequency | Count deploys in last 7/30 days |
   | Lead Time for Changes | Time from first commit to deploy |
   | Change Failure Rate | Failed deploys / total deploys (last 30 days) |
   | Mean Time to Recovery | Avg time between failure detection and fix deploy |

5. **Alert on anomalies**:
   - Deploy took significantly longer than average.
   - Health check degraded after deploy.
   - Rollback detected.
   - Error rate spike in monitoring (if configured).

6. **Report**:
   ```
   ## Deployment Status

   ### Current State
   | Environment | Version | Status | Deployed |
   |-------------|---------|--------|----------|
   | production  | v1.4.2  | healthy | 2h ago  |
   | staging     | v1.4.3  | healthy | 30m ago |

   ### Health Checks
   - production/health: 200 OK (42ms)
   - production/ready: 200 OK (15ms)

   ### DORA Metrics (30-day)
   - Deployment Frequency: 12/month (daily target)
   - Lead Time: 2.3 days (target: <1 day)
   - Change Failure Rate: 8.3% (target: <15%)
   - MTTR: 45 min (target: <1 hour)
   ```

## Error Handling

- No deployment config: suggest configuring via `/dafke-init`.
- Health check timeout: report with warning, suggest checking network/firewall.
- Missing metrics data: show what is available, note gaps.
