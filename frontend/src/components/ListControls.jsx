export default function ListControls({
  search,
  onSearchChange,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  placeholder = 'Buscar...',
  label = 'Buscar en esta lista',
  submitSearch = false,
  showSearch = true,
  draftSearch = search,
  onDraftSearchChange = onSearchChange,
  onSearchSubmit,
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const firstItem = total ? currentPage * pageSize + 1 : 0;
  const lastItem = Math.min((currentPage + 1) * pageSize, total);

  return (
    <div className="list-controls">
      {!showSearch ? null : submitSearch ? (
        <form
          className="list-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (onSearchSubmit) onSearchSubmit();
            else onSearchChange(draftSearch);
          }}
        >
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={draftSearch}
            onChange={(event) => onDraftSearchChange(event.target.value)}
            placeholder={placeholder}
            aria-label={label}
          />
          {draftSearch ? (
            <button type="button" className="search-clear" onClick={() => onDraftSearchChange('')} aria-label="Limpiar búsqueda">
              ×
            </button>
          ) : null}
          <button type="submit" className="search-submit">Buscar</button>
        </form>
      ) : (
        <label className="list-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            aria-label={label}
          />
          {search ? (
            <button type="button" className="search-clear" onClick={() => onSearchChange('')} aria-label="Limpiar búsqueda">
              ×
            </button>
          ) : null}
        </label>
      )}
      <div className="list-pagination">
        <label className="page-size-select">
          <span>Filas</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Filas por página"
          >
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <span className="list-count">
          {total ? `${firstItem}–${lastItem} de ${total}` : '0 resultados'}
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={currentPage === 0}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Anterior
        </button>
        <span className="list-page-number">{currentPage + 1} / {pageCount}</span>
        <button
          type="button"
          className="secondary-button"
          disabled={currentPage + 1 >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
