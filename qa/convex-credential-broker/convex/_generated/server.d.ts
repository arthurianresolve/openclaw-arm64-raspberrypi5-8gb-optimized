type ConvexMutationConfig<TArgs extends Record<string, unknown>, TResult, TCtx = unknown> = {
  args: Record<string, unknown>;
  handler: (ctx: TCtx, args: TArgs) => Promise<TResult> | TResult;
};

type ConvexQueryConfig<TArgs extends Record<string, unknown>, TResult, TCtx = unknown> = {
  args: Record<string, unknown>;
  handler: (ctx: TCtx, args: TArgs) => Promise<TResult> | TResult;
};

export function internalMutation<
  TArgs extends Record<string, unknown>,
  TResult = unknown,
  TCtx = unknown,
>(config: ConvexMutationConfig<TArgs, TResult, TCtx>): unknown;

export function internalQuery<
  TArgs extends Record<string, unknown>,
  TResult = unknown,
  TCtx = unknown,
>(config: ConvexQueryConfig<TArgs, TResult, TCtx>): unknown;

export function httpAction<
  TCtx = {
    runMutation(ref: unknown, args: Record<string, unknown>): Promise<unknown>;
    runQuery(ref: unknown, args: Record<string, unknown>): Promise<unknown>;
  },
>(
  handler: (ctx: TCtx, request: Request) => Promise<Response> | Response,
): (ctx: unknown, request: Request) => Promise<Response> | Response;
