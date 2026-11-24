import { useRef, useState } from 'react';
import { formatApiError } from '../utils/errors';

function createFormData(file) {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

export default function DeviceImportPanel({ apiRequest, onImported }) {
  const [file, setFile] = useState(null);
  const fileInput = useRef(null);
  const [preview, setPreview] = useState(null);
  const [confirmActive, setConfirmActive] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectFile = (event) => {
    setFile(event.target.files?.[0] || null);
    setPreview(null);
    setConfirmActive(false);
    setError('');
    setNotice('');
  };

  const analyzeFile = async (event) => {
    event.preventDefault();
    if (!file) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest('/api/v1/devices/import/preview', {
        method: 'POST',
        body: createFormData(file),
      });
      setPreview(result);
      setConfirmActive(false);
    } catch (requestError) {
      setPreview(null);
      setError(formatApiError(requestError));
    } finally {
      setWorking(false);
    }
  };

  const importFile = async () => {
    if (!file || !preview || preview.valid_count === 0) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest('/api/v1/devices/import', {
        method: 'POST',
        body: createFormData(file),
      });
      setNotice(
        `Importación completada: ${result.imported_count} activos agregados; `
        + `${result.duplicate_count} duplicados y ${result.invalid_count} filas inválidas omitidas.`,
      );
      setFile(null);
      setPreview(null);
      setConfirmActive(false);
      if (fileInput.current) fileInput.current.value = '';
      try {
        await onImported();
      } catch (refreshError) {
        setError(
          `La importación se completó, pero no se pudo actualizar el listado: `
          + formatApiError(refreshError),
        );
      }
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel">
      <h2>Importar activos desde CSV</h2>
      <p className="muted">
        Sube un CSV de hasta 2 MB y 1,000 filas. Primero se validará; los registros
        existentes no se sobrescriben.
      </p>
      <p className="muted">
        Columnas obligatorias: <code>id_tipo</code> y <code>nombre_host</code>.
        Las demás columnas del archivo de prueba son opcionales.
      </p>

      {error ? <div className="error-box page-message" role="alert">{error}</div> : null}
      {notice ? <div className="success-box page-message" role="status">{notice}</div> : null}

      <form className="data-form" onSubmit={analyzeFile}>
        <label>
          Archivo CSV
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={selectFile}
            disabled={working}
          />
        </label>
        {file ? <span className="muted">{file.name}</span> : null}
        <div className="form-actions">
          <button type="submit" disabled={!file || working}>
            {working ? 'Analizando…' : 'Analizar archivo'}
          </button>
        </div>
      </form>

      {preview ? (
        <div>
          <div className="stats-grid">
            <article className="stat-card green">
              <span>Listos para importar</span>
              <strong>{preview.valid_count}</strong>
            </article>
            <article className="stat-card amber">
              <span>Duplicados omitidos</span>
              <strong>{preview.duplicate_count}</strong>
            </article>
            <article className="stat-card purple">
              <span>Filas con errores</span>
              <strong>{preview.invalid_count}</strong>
            </article>
          </div>

          {preview.preview.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Fila</th><th>Host</th><th>IP de gestión</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {preview.preview.map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.nombre_host}</td>
                      <td>{row.ip_gestion || '—'}</td>
                      <td>{row.estado_operativo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.valid_count > preview.preview.length ? (
                <p className="muted">Vista previa de las primeras {preview.preview.length} filas válidas.</p>
              ) : null}
            </div>
          ) : null}

          {preview.issues.length ? (
            <details className="import-issues">
              <summary>Ver filas omitidas ({preview.duplicate_count + preview.invalid_count})</summary>
              <ul>
                {preview.issues.map((issue, index) => (
                  <li key={`${issue.line}-${issue.kind}-${index}`}>
                    Fila {issue.line}: {issue.kind === 'duplicate'
                      ? `duplicada en ${issue.fields.join(', ')}`
                      : issue.messages.join('; ')}
                  </li>
                ))}
              </ul>
              {preview.report_truncated ? <p className="muted">Se muestran las primeras 100 incidencias.</p> : null}
            </details>
          ) : null}

          {preview.active_count > 0 ? (
            <div className="import-warning">
              <strong>Atención:</strong> {preview.active_count} registros están marcados como
              activos y el monitor intentará sondearlos después de importarlos.
              <label>
                <input
                  type="checkbox"
                  checked={confirmActive}
                  onChange={(event) => setConfirmActive(event.target.checked)}
                  disabled={working}
                />
                Confirmo que quiero importar estos activos y habilitar su sondeo.
              </label>
            </div>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              onClick={importFile}
              disabled={
                working
                || preview.valid_count === 0
                || (preview.active_count > 0 && !confirmActive)
              }
            >
              {working ? 'Importando…' : `Importar ${preview.valid_count} registros válidos`}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
