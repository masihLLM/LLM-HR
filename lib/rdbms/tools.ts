import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { executeReadOnlySQL } from "./sql";
import { listSchemas, listTables, listColumns } from "./introspection";

export const rdbmsTools = {
  listSchemas: tool({
    description: "List available schemas in the connected Postgres database.",
    inputSchema: z.object({}),
    execute: async () => {
      const schemas = await listSchemas();
      return schemas.join("\n");
    },
  }),
  listTables: tool({
    description: "List tables. If schema is omitted, list all schemas' tables.",
    inputSchema: z.object({ schema: z.string().optional() }),
    execute: async ({ schema }) => {
      const tables = await listTables(schema);
      if (!tables.length) return "No tables found.";
      return tables.map((t) => `${t.schema}.${t.name}`).join("\n");
    },
  }),
  listColumns: tool({
    description: "List columns for a given table in a schema.",
    inputSchema: z.object({ schema: z.string(), table: z.string() }),
    execute: async ({ schema, table }) => {
      const cols = await listColumns(schema, table);
      if (!cols.length) return "No columns found.";
      return cols
        .map((c) => `${c.tableSchema}.${c.tableName}.${c.columnName} ${c.dataType} ${c.isNullable ? "nullable" : "not null"}${c.isPrimaryKey ? " pk" : ""}`)
        .join("\n");
    },
  }),
  runReadOnlySQL: tool({
    description: "Execute a read-only SQL query (SELECT/CTE). Returns JSON rows.",
    inputSchema: z.object({ sql: z.string().describe("Read-only SQL to execute") }),
    execute: async ({ sql }) => {
      const rows = await executeReadOnlySQL({ sql });
      return JSON.stringify(rows);
    },
  }),
} satisfies ToolSet;

export type RdbmsTools = typeof rdbmsTools;


