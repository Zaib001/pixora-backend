

export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      error.context = {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        body: req.body,
      };
      next(error);
    });
  };
};
