// bootstrap/http.js
const { Agent, fetch, setGlobalDispatcher } = require("undici");

// Keep-Alive pool for ALL your HTTP calls
const dispatcher = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 60_000,
  connections: 128,
});
setGlobalDispatcher(dispatcher);

// Make global fetch use undici
globalThis.fetch = fetch;
