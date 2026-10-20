// Standard JSON envelope defined in docs/02-API_DEVELOPMENT_STANDARDS.md §5.

function buildMeta(res) {
  return { requestId: res.req.id };
}

export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, meta: buildMeta(res) });
}

export function sendError(res, statusCode, { code, message, details }) {
  const error = details ? { code, message, details } : { code, message };
  return res.status(statusCode).json({ success: false, error, meta: buildMeta(res) });
}

/** Paginated list envelope (docs/02 §5.2, total-count contract). */
export function sendPaginated(res, items, { page, limit, total }) {
  const totalPages = Math.ceil(total / limit);
  return res.status(200).json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    meta: buildMeta(res),
  });
}
