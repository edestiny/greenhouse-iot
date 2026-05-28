// ============================================================
// 全局错误处理中间件
// ============================================================
const errorHandler = (err, req, res, _next) => {
  console.error('[Error]', err);

  // 已知错误（业务逻辑抛出的）
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      code: err.statusCode,
      message: err.message,
    });
  }

  // 未知错误
  return res.status(500).json({
    code: 500,
    message: process.env.NODE_ENV === 'production'
      ? '服务内部错误'
      : err.message,
  });
};

// 业务错误类
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { errorHandler, AppError };
