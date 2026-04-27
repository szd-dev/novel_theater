import { resolve } from "node:path";

const DEFAULT_DATA_STORE_DIR = "./.data_store";

export function getDataStoreDir(): string {
  return resolve(process.env.DATA_STORE_DIR || DEFAULT_DATA_STORE_DIR);
}
