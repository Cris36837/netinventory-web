import { useMemo, useState } from 'react';

export default function useSearchPagination(items) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((item) => JSON.stringify(item).toLocaleLowerCase().includes(term));
  }, [items, search]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () => filteredItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [currentPage, filteredItems, pageSize],
  );

  const changeSearch = (value) => {
    setSearch(value);
    setPage(0);
  };

  const changePageSize = (value) => {
    setPageSize(value);
    setPage(0);
  };

  return {
    search,
    setSearch: changeSearch,
    page: currentPage,
    setPage,
    pageSize,
    setPageSize: changePageSize,
    pageItems,
    total: filteredItems.length,
  };
}
