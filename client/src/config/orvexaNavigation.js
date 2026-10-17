// Source: Main-files/orvexa/src/assets/js/data/navigation-data.js (Orvexa 1.0.0).
// Exact original labels, groups, icons and HTML destinations retained for the React transition.
// Do not remove demo items until the real project navigation is approved.
export const orvexaNavigation = [
  {
    "id": "command-center",
    "label": "Dashboard",
    "icon": "layout-dashboard",
    "href": "index.html"
  },
  {
    "label": "Command",
    "id": "command",
    "icon": "radar",
    "items": [
      {
        "id": "live-operations",
        "label": "Live Operations",
        "icon": "activity",
        "href": "pages/live-operations.html"
      },
      {
        "id": "ai-issues",
        "label": "AI Issues & Insights",
        "icon": "scan-search",
        "href": "pages/ai-issues.html"
      },
      {
        "id": "requests-runs",
        "label": "Requests & Runs",
        "icon": "list-tree",
        "href": "pages/requests-runs.html"
      },
      {
        "id": "approval-center",
        "label": "Approval Center",
        "icon": "shield-check",
        "href": "pages/approval-center.html"
      }
    ]
  },
  {
    "label": "Build",
    "id": "build",
    "icon": "blocks",
    "items": [
      {
        "id": "applications",
        "label": "Applications",
        "icon": "panels-top-left",
        "href": "pages/applications.html"
      },
      {
        "id": "contact-center",
        "label": "AI Contact Center",
        "icon": "headphones",
        "href": "pages/contact-center.html"
      },
      {
        "id": "agents",
        "label": "Agents & Automations",
        "icon": "bot",
        "href": "pages/agents.html"
      },
      {
        "id": "test-console",
        "label": "Admin Test Console",
        "icon": "square-terminal",
        "href": "pages/test-console.html"
      }
    ]
  },
  {
    "label": "Intelligence",
    "id": "intelligence",
    "icon": "brain-circuit",
    "items": [
      {
        "id": "ai-gateway",
        "label": "AI Gateway",
        "icon": "waypoints",
        "href": "pages/ai-gateway.html"
      },
      {
        "id": "models-routing",
        "label": "Models & Providers",
        "icon": "cpu",
        "href": "pages/models-routing.html"
      },
      {
        "id": "knowledge-group",
        "label": "Knowledge & RAG",
        "icon": "database-zap",
        "children": [
          {
            "id": "knowledge-rag",
            "label": "Knowledge Overview",
            "href": "pages/knowledge-rag.html",
            "icon": "database"
          },
          {
            "id": "sources-ingestion",
            "label": "Sources & Ingestion",
            "href": "pages/sources-ingestion.html",
            "icon": "cloud-download"
          },
          {
            "id": "retrieval-grounding",
            "label": "Retrieval & Grounding",
            "href": "pages/retrieval-grounding.html",
            "icon": "search-check"
          },
          {
            "id": "context-memory",
            "label": "Context & Memory",
            "href": "pages/context-memory.html",
            "icon": "brain-circuit"
          }
        ]
      },
      {
        "id": "prompts",
        "label": "Prompts & Instructions",
        "icon": "braces",
        "href": "pages/prompts.html"
      },
      {
        "id": "tools-mcp",
        "label": "Tools & MCP",
        "icon": "plug-zap",
        "href": "pages/tools-mcp.html"
      }
    ]
  },
  {
    "label": "Quality & Safety",
    "id": "quality",
    "icon": "shield-check",
    "items": [
      {
        "id": "datasets",
        "label": "Datasets & Test Cases",
        "icon": "table-properties",
        "href": "pages/datasets.html"
      },
      {
        "id": "evaluations",
        "label": "Evaluations",
        "href": "pages/evaluations.html",
        "icon": "flask-conical"
      },
      {
        "id": "quality-feedback",
        "label": "Quality & Feedback",
        "href": "pages/quality-feedback.html",
        "icon": "messages-square"
      },
      {
        "id": "policies-guardrails",
        "label": "Guardrails & Policies",
        "icon": "shield-check",
        "href": "pages/policies-guardrails.html"
      },
      {
        "id": "safety-redteam",
        "label": "Safety & Red Team",
        "icon": "shield-alert",
        "href": "pages/safety-redteam.html"
      },
      {
        "id": "human-review",
        "label": "Human Review",
        "icon": "user-check",
        "href": "pages/human-review.html"
      },
      {
        "id": "experiments-releases",
        "label": "Experiments & Releases",
        "icon": "git-compare-arrows",
        "href": "pages/experiments-releases.html"
      }
    ]
  },
  {
    "label": "Observe",
    "id": "observe",
    "icon": "activity",
    "items": [
      {
        "id": "traces",
        "label": "Traces",
        "icon": "git-branch",
        "href": "pages/traces.html"
      },
      {
        "id": "sessions",
        "label": "Sessions & Threads",
        "icon": "messages-square",
        "href": "pages/sessions.html"
      },
      {
        "id": "logs-errors",
        "label": "Logs & Errors",
        "icon": "file-warning",
        "href": "pages/logs-errors.html"
      },
      {
        "id": "performance-slo",
        "label": "Performance & SLO",
        "icon": "gauge",
        "href": "pages/performance-slo.html"
      },
      {
        "id": "alerts-incidents",
        "label": "Alerts & Incidents",
        "icon": "siren",
        "href": "pages/alerts-incidents.html"
      },
      {
        "id": "reliability-capacity",
        "label": "Reliability & Capacity",
        "icon": "server-cog",
        "href": "pages/reliability-capacity.html"
      }
    ]
  },
  {
    "label": "Analytics",
    "id": "analytics",
    "icon": "chart-no-axes-combined",
    "items": [
      {
        "id": "usage-analytics",
        "label": "Usage Analytics",
        "icon": "chart-no-axes-combined",
        "href": "pages/usage-analytics.html"
      },
      {
        "id": "end-user-usage",
        "label": "User & Feature Usage",
        "icon": "users-round",
        "href": "pages/end-user-usage.html"
      },
      {
        "id": "cost-budgets",
        "label": "AI Cost & Budgets",
        "icon": "circle-dollar-sign",
        "href": "pages/cost-budgets.html"
      },
      {
        "id": "rate-limits-quotas",
        "label": "Rate Limits & Quotas",
        "icon": "traffic-cone",
        "href": "pages/rate-limits-quotas.html"
      }
    ]
  },
  {
    "label": "Monetize",
    "id": "monetize",
    "icon": "badge-dollar-sign",
    "items": [
      {
        "id": "customers",
        "label": "Customers",
        "icon": "building-2",
        "href": "pages/customers.html"
      },
      {
        "id": "plans-entitlements",
        "label": "Plans & Entitlements",
        "icon": "layers-3",
        "href": "pages/plans-entitlements.html"
      },
      {
        "id": "subscriptions-billing",
        "label": "Subscriptions & Billing",
        "icon": "receipt-text",
        "href": "pages/subscriptions-billing.html"
      },
      {
        "id": "usage-credits",
        "label": "Usage & Credits",
        "icon": "coins",
        "href": "pages/usage-credits.html"
      }
    ]
  },
  {
    "label": "Platform",
    "id": "platform",
    "icon": "server-cog",
    "items": [
      {
        "id": "workspaces-tenants",
        "label": "Organizations & Workspaces",
        "icon": "building-2",
        "href": "pages/workspaces-tenants.html"
      },
      {
        "id": "team-members",
        "label": "Team & Members",
        "icon": "users",
        "href": "pages/team-members.html"
      },
      {
        "id": "environments",
        "label": "Environments",
        "icon": "git-branch",
        "href": "pages/environments.html"
      },
      {
        "id": "api-access",
        "label": "API Access & Identities",
        "href": "pages/api-access.html",
        "icon": "key-round"
      },
      {
        "id": "integrations",
        "label": "Integrations & Webhooks",
        "href": "pages/integrations.html",
        "icon": "webhook"
      },
      {
        "id": "data-privacy",
        "label": "Data & Privacy",
        "href": "pages/data-privacy.html",
        "icon": "shield-half"
      },
      {
        "id": "secrets-credentials",
        "label": "Secrets & Credentials",
        "href": "pages/secrets-credentials.html",
        "icon": "vault"
      },
      {
        "id": "security-sessions",
        "label": "Account Security & Sessions",
        "href": "pages/security-sessions.html",
        "icon": "fingerprint"
      },
      {
        "id": "roles-audit",
        "label": "Roles & Audit",
        "icon": "user-cog",
        "href": "pages/roles-audit.html"
      }
    ]
  },
  {
    "label": "System",
    "id": "system",
    "icon": "bell-ring",
    "items": [
      {
        "id": "notification-center",
        "label": "Notifications",
        "icon": "bell-ring",
        "href": "pages/notification-center.html"
      },
      {
        "id": "settings",
        "label": "Settings",
        "icon": "settings-2",
        "href": "pages/settings.html"
      }
    ]
  }
]

export const orvexaSecondaryPages = {
  "application-detail": "applications",
  "agent-detail": "agents",
  "customer-detail": "customers",
  "plan-detail": "plans-entitlements",
  "subscription-detail": "subscriptions-billing",
  "workspace-detail": "workspaces-tenants",
  "member-detail": "team-members",
  "environment-detail": "environments",
  "identity-detail": "api-access",
  "integration-detail": "integrations",
  "policy-detail": "data-privacy",
  "privacy-request-detail": "data-privacy",
  "secret-detail": "secrets-credentials",
  "session-detail": "security-sessions"
}
