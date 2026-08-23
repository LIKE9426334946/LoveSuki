export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

export async function readJsonBody(request, maximumBytes = 48 * 1024 * 1024) {
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > maximumBytes) {
    throw new ApiError(413, "提交的内容过大。");
  }

  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maximumBytes) {
      throw new ApiError(413, "提交的内容过大。");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "请求内容不是有效的 JSON。");
  }
}

export function requireText(value, fieldName, maximumLength, { allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName}格式不正确。`);
  }

  const text = allowEmpty ? value : value.trim();
  if (!allowEmpty && !text) {
    throw new ApiError(400, `${fieldName}不能为空。`);
  }
  if (text.length > maximumLength) {
    throw new ApiError(400, `${fieldName}长度不能超过 ${maximumLength} 个字符。`);
  }
  return text;
}
