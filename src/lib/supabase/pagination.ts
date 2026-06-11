type QueryError = {
  message: string;
  code?: string;
};

type PageResult<T> = {
  data: T[] | null;
  error: QueryError | null;
};

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
) {
  const data: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data, error: result.error };

    const page = result.data ?? [];
    data.push(...page);
    if (page.length < pageSize) return { data, error: null };
  }
}
