import { useEffect, useState } from 'react';
import { formatApiError } from '../utils/errors';
import ListControls from './ListControls';

const DEFAULT_PAGE_SIZE = 20;

function buildFilterQuery(filters, offset = 0, pageSize = DEFAULT_PAGE_SIZE) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(pageSize) });
  if (filters.accion.trim()) params.set('accion', filters.accion.trim());
  if (filters.usuario.trim()) params.set('usuario', filters.usuario.trim());
  if (filters.desde) params.set('desde', new Date(filters.desde).toISOString());
  if (filters.hasta) params.set('hasta', new Date(filters.hasta).toISOString());
  return params.toString();
}

export default function AuditPanel({ apiRequest }) {
  const [filters, setFilters] = useState({ accion: '', usuario: '', desde: '', hasta: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await apiRequest(
          `/api/v1/audit-logs?${buildFilterQuery(appliedFilters, offset, pageSize)}`,
        );
        if (active) {
          setLogs(result.items);
          setTotal(result.total);
          setError('');
        }
      } catch (loadError) {
        if (active) setError(formatApiError(loadError?.message || loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [apiRequest, appliedFilters, offset, pageSize]);

  const applyFilters = (event) => {
    event.preventDefault();
    if (filters.desde && filters.hasta && filters.desde > filters.hasta) {
      setError('La fecha inicial debe ser anterior a la fecha final.');
      return;
    }
    setError('');
    setOffset(0);
    setAppliedFilters({ ...filters });
  };

  const exportLogs = async () => {
    setError('');
    setExporting(true);
    try {
      const token = localStorage.getItem('netinventory_token');
      const response = await fetch(`/api/v1/audit-logs/export?${buildFilterQuery(appliedFilters)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(formatApiError(data?.detail));
      }
      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bitacora-auditoria.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (exportError) {
      setError(formatApiError(exportError?.message || exportError));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Bitácora de auditoría</h2>
          <p className="muted">Filtra los eventos registrados y exporta el resultado como CSV.</p>
        </div>
        <button type="button" className="secondary-button" onClick={exportLogs} disabled={exporting}>
          {exporting ? 'Preparando CSV…' : 'Exportar CSV'}
        </button>
      </div>
      {error ? <div className="error-box page-message">{error}</div> : null}
      <form className="data-form audit-filters" onSubmit={applyFilters}>
        <label>Acción<input maxLength="100" value={filters.accion} onChange={(event) => setFilters({ ...filters, accion: event.target.value })} placeholder="Ej. sandbox.simulation" /></label>
        <label>Usuario<input maxLength="150" value={filters.usuario} onChange={(event) => setFilters({ ...filters, usuario: event.target.value })} placeholder="Nombre o correo" /></label>
        <label>Desde<input type="datetime-local" value={filters.desde} onChange={(event) => setFilters({ ...filters, desde: event.target.value })} /></label>
        <label>Hasta<input type="datetime-local" value={filters.hasta} onChange={(event) => setFilters({ ...filters, hasta: event.target.value })} /></label>
        <div className="form-actions"><button type="submit">Aplicar filtros</button></div>
      </form>
      {loading ? <p className="muted">Cargando bitácora...</p> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalles</th><th>IP de origen</th></tr></thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id_auditoria}>
                    <td>{new Date(log.fecha_creacion).toLocaleString()}</td>
                    <td>{log.usuario}</td>
                    <td>{log.accion}</td>
                    <td>{log.detalles || '—'}</td>
                    <td>{log.ip_origen || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!logs.length ? <p className="muted">No hay eventos que coincidan con los filtros.</p> : null}
          <ListControls
            showSearch={false}
            search=""
            onSearchChange={setFilters}
            page={Math.floor(offset / pageSize)}
            pageSize={pageSize}
            total={total}
            onPageChange={(page) => setOffset(page * pageSize)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setOffset(0);
            }}
          />
        </>
      )}
    </section>
  );
}
