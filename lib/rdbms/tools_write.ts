import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { executeUnsafeSQL } from "./sql";

const confirmSchema = z.object({ confirm: z.literal(true).describe("You must set confirm=true to execute this write operation.") });

export const rdbmsWriteTools = {
  createTable: tool({
    description: "Create a table with provided DDL. Requires confirm=true.",
    inputSchema: confirmSchema.extend({ ddl: z.string().describe("CREATE TABLE ... statement") }),
    execute: async ({ ddl }) => {
      await executeUnsafeSQL({ sql: ddl });
      return "Table created.";
    },
  }),
  createIndex: tool({
    description: "Create an index. Requires confirm=true.",
    inputSchema: confirmSchema.extend({ ddl: z.string().describe("CREATE INDEX ... statement") }),
    execute: async ({ ddl }) => {
      await executeUnsafeSQL({ sql: ddl });
      return "Index created.";
    },
  }),
  createView: tool({
    description: "Create a view. Requires confirm=true.",
    inputSchema: confirmSchema.extend({ ddl: z.string().describe("CREATE VIEW ... AS SELECT ...") }),
    execute: async ({ ddl }) => {
      await executeUnsafeSQL({ sql: ddl });
      return "View created.";
    },
  }),
  dropObject: tool({
    description: "Drop a table/index/view/schema object. Requires confirm=true.",
    inputSchema: confirmSchema.extend({ ddl: z.string().describe("DROP TABLE/INDEX/VIEW ...") }),
    execute: async ({ ddl }) => {
      await executeUnsafeSQL({ sql: ddl });
      return "Object dropped.";
    },
  }),
  insertRows: tool({
    description: "Insert rows via explicit INSERT statement. Requires confirm=true.",
    inputSchema: confirmSchema.extend({ sql: z.string().describe("INSERT INTO ... VALUES ...") }),
    execute: async ({ sql }) => {
      const rows = await executeUnsafeSQL({ sql });
      return JSON.stringify(rows);
    },
  }),
  updateRows: tool({
    description: "Update rows via explicit UPDATE statement. Requires confirm=true.",
    inputSchema: confirmSchema.extend({ sql: z.string().describe("UPDATE ... SET ... WHERE ...") }),
    execute: async ({ sql }) => {
      const rows = await executeUnsafeSQL({ sql });
      return JSON.stringify(rows);
    },
  }),
  deleteRows: tool({
    description: "Delete rows via explicit DELETE statement. Requires confirm=true.",
    inputSchema: confirmSchema.extend({ sql: z.string().describe("DELETE FROM ... WHERE ...") }),
    execute: async ({ sql }) => {
      const rows = await executeUnsafeSQL({ sql });
      return JSON.stringify(rows);
    },
  }),
} satisfies ToolSet;

export type RdbmsWriteTools = typeof rdbmsWriteTools;


