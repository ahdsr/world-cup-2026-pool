import assert from "node:assert/strict";
import worker from "../workers/update-results-cron/src/index.js";

const env = {
  GITHUB_OWNER: "owner",
  GITHUB_REPO: "repo",
  GITHUB_WORKFLOW_ID: "update-results.yml",
  GITHUB_REF: "main",
  GITHUB_TOKEN: "github-token",
  RUN_TOKEN: "run-token",
};

async function parseJson(response) {
  return JSON.parse(await response.text());
}

async function testHealthEndpoint() {
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    ok: true,
    schedule: "*/15 * * * *",
  });
}

async function testRunRequiresConfiguredToken() {
  const response = await worker.fetch(new Request("https://worker.example/run"), {
    ...env,
    RUN_TOKEN: "",
  });
  const body = await parseJson(response);

  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
}

async function testRunRejectsWrongToken() {
  const response = await worker.fetch(
    new Request("https://worker.example/run", {
      headers: {
        authorization: "Bearer wrong-token",
      },
    }),
    env,
  );
  const body = await parseJson(response);

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
}

async function testRunDispatchesWorkflow() {
  const originalFetch = globalThis.fetch;
  let call;

  globalThis.fetch = async (url, init) => {
    call = { url, init };
    return new Response(null, { status: 204 });
  };

  try {
    const response = await worker.fetch(
      new Request("https://worker.example/run", {
        headers: {
          authorization: "Bearer run-token",
        },
      }),
      env,
    );
    const body = await parseJson(response);

    assert.equal(response.status, 202);
    assert.equal(body.ok, true);
    assert.equal(
      call.url,
      "https://api.github.com/repos/owner/repo/actions/workflows/update-results.yml/dispatches",
    );
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.authorization, "Bearer github-token");
    assert.deepEqual(JSON.parse(call.init.body), { ref: "main" });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await testHealthEndpoint();
await testRunRequiresConfiguredToken();
await testRunRejectsWrongToken();
await testRunDispatchesWorkflow();

console.log("Update results cron worker tests passed.");
