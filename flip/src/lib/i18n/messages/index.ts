import { type Dict, type Table, LANGS } from "./types";
import { nav } from "./nav";
import { analyze } from "./analyze";
import { document as documentNs } from "./document";
import { tools } from "./tools";
import { settings } from "./settings";

function merge(...dicts: Dict[]): Dict {
  const out = {} as Dict;
  for (const l of LANGS) {
    out[l] = Object.assign({} as Table, ...dicts.map((d) => d[l] ?? {}));
  }
  return out;
}

/** Full merged message table for every language. */
export const messages: Dict = merge(nav, analyze, documentNs, tools, settings);

export type { Dict, Table };
