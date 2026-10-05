// Test helpers for the CommonJS services. The services read their Stripe and
// Supabase clients once at require() time, so tests swap those modules in
// Node's require cache and then load a fresh copy of the module under test.
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");

// Loads `modulePath` (relative to the repo root) with the given modules
// replaced, e.g. { "services/stripeClient": { stripe, stripeConfigured } }.
// Every repo module is evicted first so no test sees another test's state.
function loadWith(modulePath, fakes = {}) {
  for (const key of Object.keys(require.cache))
    if (key.startsWith(root) && !key.includes("node_modules"))
      delete require.cache[key];
  for (const [name, exports] of Object.entries(fakes)) {
    const filename = require.resolve(path.join(root, name));
    const fake = new Module(filename);
    fake.filename = filename;
    fake.loaded = true;
    fake.exports = exports;
    require.cache[filename] = fake;
  }
  return require(path.join(root, modulePath));
}

// A minimal stand-in for the Supabase query builder. `respond(query)` gets
// { table, op, filters, payload } and returns { data, error }; every query
// is also recorded in `queries` so tests can assert on what was written.
function fakeSupabase(respond = () => ({ data: null, error: null })) {
  const queries = [];
  const from = (table) => {
    const query = { table, op: "select", filters: [], payload: undefined };
    queries.push(query);
    const builder = {
      then: (resolve, reject) =>
        Promise.resolve()
          .then(() => respond(query))
          .then(resolve, reject),
    };
    for (const op of ["insert", "update", "upsert", "delete"])
      builder[op] = (payload) => {
        query.op = op;
        query.payload = payload;
        return builder;
      };
    for (const filter of ["eq", "neq", "lte", "gte", "order", "limit"])
      builder[filter] = (...args) => {
        query.filters.push([filter, ...args]);
        return builder;
      };
    builder.select = () => builder;
    builder.single = () => builder;
    builder.maybeSingle = () => builder;
    return builder;
  };
  return { client: { from }, queries };
}

module.exports = { loadWith, fakeSupabase };
