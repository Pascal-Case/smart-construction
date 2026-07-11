export function auditPagination(rawPage: string | undefined, total: number, pageSize = 20) {
  const requested = Number.parseInt(rawPage ?? "", 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 1, totalPages);

  return { page, pageSize, totalPages, skip: (page - 1) * pageSize };
}
