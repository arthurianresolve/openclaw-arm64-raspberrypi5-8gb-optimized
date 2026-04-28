type ConvexMutationConfig<TResult> = {
  args: Record<string, unknown>;
  handler: (ctx: any, args: any) => Promise<TResult> | TResult;
};

type ConvexQueryConfig<TResult> = {
  args: Record<string, unknown>;
  handler: (ctx: any, args: any) => Promise<TResult> | TResult;
};

export function internalMutation<TResult = unknown>(config: ConvexMutationConfig<TResult>): unknown;

export function internalQuery<TResult = unknown>(config: ConvexQueryConfig<TResult>): unknown;

export function httpAction(
  handler: (
    ctx: {
      runMutation(ref: unknown, args: Record<string, unknown>): Promise<any>;
      runQuery(ref: unknown, args: Record<string, unknown>): Promise<any>;
    },
    request: Request,
  ) => Promise<Response> | Response,
): (ctx: any, request: Request) => Promise<Response> | Response;
