const GITHUB_API_VERSION = "2022-11-28";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment value: ${key}`);
  return value;
}

async function dispatchUpdateWorkflow(env) {
  const owner = requireEnv(env, "GITHUB_OWNER");
  const repo = requireEnv(env, "GITHUB_REPO");
  const workflowId = requireEnv(env, "GITHUB_WORKFLOW_ID");
  const ref = env.GITHUB_REF || "main";
  const token = requireEnv(env, "GITHUB_TOKEN");
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "world-cup-pool-results-cron",
      "x-github-api-version": GITHUB_API_VERSION,
    },
    body: JSON.stringify({ ref }),
  });

  if (response.status === 204) {
    return {
      ok: true,
      status: response.status,
      message: `Dispatched ${workflowId} on ${owner}/${repo}@${ref}.`,
    };
  }

  const text = await response.text();
  return {
    ok: false,
    status: response.status,
    message: text || response.statusText,
  };
}

async function runScheduledUpdate(env) {
  const result = await dispatchUpdateWorkflow(env);
  if (!result.ok) {
    throw new Error(`GitHub workflow dispatch failed (${result.status}): ${result.message}`);
  }
  return result;
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledUpdate(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        schedule: "*/15 * * * *",
      });
    }

    if (url.pathname === "/run") {
      const expectedToken = env.RUN_TOKEN;
      if (!expectedToken) {
        return jsonResponse({ ok: false, message: "Manual trigger disabled. Set RUN_TOKEN to enable it." }, 403);
      }

      const providedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (providedToken !== expectedToken) {
        return jsonResponse({ ok: false, message: "Unauthorized." }, 401);
      }

      const result = await dispatchUpdateWorkflow(env);
      return jsonResponse(result, result.ok ? 202 : 502);
    }

    return jsonResponse({
      ok: true,
      message: "World Cup pool results cron worker.",
      endpoints: ["/health", "/run"],
    });
  },
};
