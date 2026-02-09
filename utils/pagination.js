export function getPaginationParams(query) {
  const page = parseInt(query.page || '1', 10);
  const limit = parseInt(query.limit || '20', 10);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
