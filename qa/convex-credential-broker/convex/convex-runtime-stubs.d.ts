declare module "convex/values" {
  export const v: {
    any(): unknown;
    boolean(): unknown;
    id(tableName: string): unknown;
    literal(value: string): unknown;
    number(): unknown;
    object(shape: Record<string, unknown>): unknown;
    optional(value: unknown): unknown;
    string(): unknown;
    union(...values: unknown[]): unknown;
  };
}

declare module "convex/server" {
  type IndexedTable = {
    index(name: string, fields: string[]): IndexedTable;
  };

  export function defineSchema(schema: Record<string, unknown>): unknown;
  export function defineTable(schema: Record<string, unknown>): IndexedTable;

  export function cronJobs(): {
    interval(
      name: string,
      schedule: Record<string, number>,
      handler: unknown,
      args: Record<string, unknown>,
    ): void;
  };

  export function httpRouter(): {
    route(config: {
      path: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response> | Response;
    }): void;
  };
}
