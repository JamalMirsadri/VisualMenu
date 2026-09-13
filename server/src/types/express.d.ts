/**
 * Express 5 types `req.params` values as `string | string[]` to support
 * wildcard / repeatable route parameters (e.g. `/:id*`).
 *
 * This codebase only ever declares single-value named parameters
 * (`:id`, `:restaurantId`, `:slug`, `:orderId`, ...). Narrow the params object
 * back to `string` on the `express` module's `Request` interface so request
 * params type-check as the single value the router actually provides, instead
 * of surfacing a pervasive `string | string[]` assignability error across every
 * route handler.
 *
 * Note: this must be declared on the `express` module's `Request` interface
 * (which inherits `params: P` from `express-serve-static-core`'s `Request`),
 * not on the global `Express.Request` namespace or on
 * `express-serve-static-core`'s `ParamsDictionary` — neither of those narrows
 * the type actually seen by route handlers.
 */
declare module 'express' {
  interface Request {
    params: { [key: string]: string };
  }
}

export {};
