export const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  const message = err.message || "Internal Server Error";

  console.error("\n [Pixora Error Log]");
  console.error("→ Message:", message);
  console.error("→ Status:", statusCode);
  if (err.context) console.error("→ Context:", err.context);
  if (process.env.NODE_ENV === "development" && err.stack)
    console.error("→ Stack:", err.stack);

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    ...(err.context && { context: err.context }),
  });
};
