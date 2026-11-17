import { useEffect, useState } from 'react';
import { formatApiError } from '../utils/errors';
import ListControls from './ListControls';
import useSearchPagination from '../utils/useSearchPagination';

export default function MonitoringPanel({ apiRequest, devices, user }) {
  const [statuses, setStatuses] = useState([]);
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsOffset, setResultsOffset] = useState(0);
  const [resultsPageSize, setResultsPageSize] = useState(20);
  const [resultsSearch, setResultsSearch] = useState('');
  const [appliedResultsSearch, setAppliedResultsSearch] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [protocol, setProtocol] = useState('tcp');
  const [ports, setPorts] = useState('22, 80, 443');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const canTest = user.rol === 'Admin' || user.rol === 'Técnico';
  const statusList = useSearchPagination(statuses.filter((item) => item.ip_gestion));
  const matchingDevices = devices.filter((device) => (
    `${device.nombre_host} ${device.ip_gestion || ''}`
      .toLocaleLowerCase()
      .includes(deviceSearch.trim().toLocaleLowerCase())
  ));
  const selectedDevice = devices.find((device) => String(device.id_dispositivo) === deviceId);
  const visibleDevices = selectedDevice && !matchingDevices.includes(selectedDevice)
    ? [selectedDevice, ...matchingDevices]
    : matchingDevices;

  const refresh = async () => {
    const params = new URLSearchParams({
      offset: String(resultsOffset),
      limit: String(resultsPageSize),
    });
    if (appliedResultsSearch.trim()) params.set('search', appliedResultsSearch.trim());
    const [nextStatuses, nextResults] = await Promise.all([
      apiRequest('/api/v1/monitoring/status'),
      apiRequest(`/api/v1/monitoring/results/page?${params}`),
    ]);
    setStatuses(nextStatuses);
    setResults(nextResults.items);
    setResultsTotal(nextResults.total);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          offset: String(resultsOffset),
          limit: String(resultsPageSize),
        });
        if (appliedResultsSearch.trim()) params.set('search', appliedResultsSearch.trim());
        const [nextStatuses, nextResults] = await Promise.all([
          apiRequest('/api/v1/monitoring/status'),
          apiRequest(`/api/v1/monitoring/results/page?${params}`),
        ]);
        if (active) {
          setStatuses(nextStatuses);
          setResults(nextResults.items);
          setResultsTotal(nextResults.total);
          setError('');
        }
      } catch (loadError) {
        if (active) setError(formatApiError(loadError));
      }
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiRequest, appliedResultsSearch, resultsOffset, resultsPageSize]);

  const runPing = async () => {
    if (!deviceId) return;
    setError('');
    setNotice('');
    setWorking(true);
    try {
      const result = await apiRequest(`/api/v1/devices/${deviceId}/diagnostics/ping`, {
        method: 'POST',
      });
      setNotice(
        `Ping ICMP ${result.estado === 'disponible' ? 'correcto' : 'sin respuesta'} · ${result.latencia_ms} ms`,
      );
      await refresh();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setWorking(false);
    }
  };

  const runPortScan = async (event) => {
    event.preventDefault();
    if (!deviceId) return;
    const requestedPorts = ports.split(',').map((port) => Number(port.trim()));
    if (
      !requestedPorts.length
      || requestedPorts.length > 100
      || requestedPorts.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
      || new Set(requestedPorts).size !== requestedPorts.length
    ) {
      setError('Ingresa de 1 a 100 puertos únicos entre 1 y 65535, separados por comas.');
      return;
    }
    setError('');
    setNotice('');
    setWorking(true);
    try {
      const result = await apiRequest(`/api/v1/devices/${deviceId}/diagnostics/ports`, {
        method: 'POST',
        body: JSON.stringify({ protocolo: protocol, puertos: requestedPorts }),
      });
      setNotice(`Escaneo ${protocol.toUpperCase()} completado · ${result.resultados.length} puertos.`);
      await refresh();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="monitoring-layout">
      {canTest ? (
        <article className="panel">
          <h2>Prueba manual</h2>
          <p className="muted">Las pruebas se ejecutan únicamente contra activos registrados con IP de gestión.</p>
          <label className="monitoring-field">
            Buscar activo
            <input
              type="search"
              value={deviceSearch}
              onChange={(event) => setDeviceSearch(event.target.value)}
              placeholder="Nombre o IP"
            />
          </label>
          <label className="monitoring-field">
            Activo
            <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
              <option value="">Selecciona un activo</option>
              {visibleDevices.map((device) => (
                <option
                  key={device.id_dispositivo}
                  value={device.id_dispositivo}
                  disabled={!device.ip_gestion}
                >
                  {device.nombre_host}{device.ip_gestion ? ` · ${device.ip_gestion}` : ' · sin IP'}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions monitoring-actions">
            <button type="button" disabled={!deviceId || working} onClick={runPing}>
              {working ? 'Ejecutando…' : 'Ejecutar ping ICMP'}
            </button>
          </div>
          <form className="data-form monitoring-scan-form" onSubmit={runPortScan}>
            <label>
              Protocolo
              <select value={protocol} onChange={(event) => setProtocol(event.target.value)}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </label>
            <label>
              Puertos (máximo 100)
              <input value={ports} onChange={(event) => setPorts(event.target.value)} />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={!deviceId || working}>Escanear puertos</button>
            </div>
          </form>
        </article>
      ) : null}

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Disponibilidad en tiempo real</h2>
            <p className="muted">Sondeo ICMP periódico para activos operativos con IP de gestión.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => refresh().catch((loadError) => setError(formatApiError(loadError)))}>
            Actualizar
          </button>
        </div>
        {error ? <div className="error-box page-message">{error}</div> : null}
        {notice ? <div className="success-box page-message">{notice}</div> : null}
        <ListControls
          search={statusList.search}
          onSearchChange={statusList.setSearch}
          page={statusList.page}
          pageSize={statusList.pageSize}
          total={statusList.total}
          onPageChange={statusList.setPage}
          onPageSizeChange={statusList.setPageSize}
          placeholder="Nombre del activo o IP"
          label="Buscar disponibilidad"
        />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Activo</th><th>IP de gestión</th><th>Disponibilidad</th><th>Última prueba</th><th>Latencia</th></tr></thead>
            <tbody>
              {statusList.pageItems.map((item) => (
                <tr key={item.id_dispositivo}>
                  <td>{item.nombre_host}</td>
                  <td>{item.ip_gestion}</td>
                  <td>
                    {item.ultimo_sondeo ? (
                      <span className={`status-pill ${item.ultimo_sondeo.estado === 'disponible' ? '' : 'inactivo'}`}>
                        {item.ultimo_sondeo.estado === 'disponible' ? 'Disponible' : 'Sin respuesta'}
                      </span>
                    ) : <span className="muted">Pendiente</span>}
                  </td>
                  <td>{item.ultimo_sondeo ? new Date(item.ultimo_sondeo.fecha_sondeo).toLocaleString() : '—'}</td>
                  <td>{item.ultimo_sondeo?.latencia_ms != null ? `${item.ultimo_sondeo.latencia_ms} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!statusList.total ? <p className="muted">No hay activos con IP de gestión para monitorear.</p> : null}
        </div>
      </article>

      <article className="panel">
        <h2>Historial reciente</h2>
        <ListControls
          search={appliedResultsSearch}
          onSearchChange={setAppliedResultsSearch}
          draftSearch={resultsSearch}
          onDraftSearchChange={setResultsSearch}
          onSearchSubmit={() => {
            setAppliedResultsSearch(resultsSearch.trim());
            setResultsOffset(0);
          }}
          submitSearch
          page={Math.floor(resultsOffset / resultsPageSize)}
          pageSize={resultsPageSize}
          total={resultsTotal}
          onPageChange={(page) => setResultsOffset(page * resultsPageSize)}
          onPageSizeChange={(size) => {
            setResultsPageSize(size);
            setResultsOffset(0);
          }}
          placeholder="Host, IP, tipo, resultado..."
          label="Buscar historial de monitoreo"
        />
        {results.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Activo</th><th>Prueba</th><th>Origen</th><th>Resultado</th></tr></thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id_resultado}>
                    <td>{new Date(result.fecha_sondeo).toLocaleString()}</td>
                    <td>{result.nombre_host}</td>
                    <td>{result.tipo.toUpperCase()}</td>
                    <td>{result.origen === 'automatico' ? 'Automático' : 'Manual'}</td>
                    <td>
                      {result.tipo.endsWith('_scan')
                        ? result.detalle.resultados.map(({ port, estado }) => `${port}: ${estado}`).join(' · ')
                        : result.estado}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            {appliedResultsSearch ? 'No hay resultados que coincidan con la búsqueda.' : 'Todavía no hay resultados de sondeo.'}
          </p>
        )}
      </article>
    </section>
  );
}
