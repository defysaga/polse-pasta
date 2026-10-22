// Kjører Workeren og Durable Objecten i Node, med node:sqlite i stedet for Cloudflare sin SQLite.
// Brukes bare til testing her, ikke av Cloudflare.
import { DatabaseSync } from "node:sqlite";
import worker, { Hjem } from "../src/worker.js";

function makeSql(db) {
  return {
    exec(query, ...binds) {
      const st = db.prepare(query);
      const b = binds.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v));
      const returnsRows = /^\s*(select|pragma|with)/i.test(query);
      let rows = [], written = 0;
      if (returnsRows) rows = st.all(...b).map((r) => {
        const o = {};
        for (const [k, v] of Object.entries(r)) o[k] = v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v;
        return o;
      });
      else written = st.run(...b).changes;
      return { toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator](), rowsWritten: written };
    }
  };
}

export function makeEnv(file = ":memory:", extra = {}) {
  const db = new DatabaseSync(file);
  let instance = null;
  const env = Object.assign({ ALLOW_LOCAL_PUSH: "1" }, extra);
  env.HJEM = {
    idFromName: () => "hjem",
    get: () => ({
      fetch: (req) => {
        if (!instance) instance = new Hjem({ storage: { sql: makeSql(db) } }, env);
        return instance.fetch(req);
      }
    })
  };
  return { env, db, worker };
}
