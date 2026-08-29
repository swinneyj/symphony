// fal billing usage — exact per-model charges
const res = await fetch(
  "https://rest.alpha.fal.ai/billing/usage?from=2026-08-20T00:00:00Z&to=2026-08-30T00:00:00Z",
  { headers: { authorization: "Key " + process.env.FAL_KEY } }
);
console.log("status", res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 1).slice(0, 4000));
