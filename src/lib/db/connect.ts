import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import process from "node:process";
import * as schema from "./schema";

console.log("Loading SQLite file at", path.join(process.cwd(), "./db.sqlite"));

const client = createClient({
  url:
    process.env.DATABASE_URL ??
    "file:" + path.join(process.cwd(), "./db.sqlite"),
});

export const db = drizzle(client, {
  schema: schema,
  casing: "snake_case",
});

// If you need to export the type:
export type Database = typeof db;
