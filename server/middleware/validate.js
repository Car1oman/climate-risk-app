/**
 * Zod validation middleware factory.
 * Usage: router.post('/', validate(mySchema), handler)
 *
 * Validates req.body against the provided Zod schema.
 * On failure, calls next() with a ZodError — caught by errorHandler.
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(result.error);
    }
    req.body = result.data; // use coerced/trimmed data from this point on
    next();
  };
}

/**
 * Validates req.query instead of req.body.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(result.error);
    }
    req.query = result.data;
    next();
  };
}
