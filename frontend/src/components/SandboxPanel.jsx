import { useEffect, useState } from 'react';
import { formatApiError } from '../utils/errors';
import ListControls from './ListControls';
import useSearchPagination from '../utils/useSearchPagination';

const initialChanges = '{\n  "hostname": "edge-lab-01",\n  "management_ip": "192.0.2.20",\n  "vlan": 20\n}';

export default function SandboxPanel({ apiRequest, devices, user }) {
  const [templates, setTemplates] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [targetType, setTargetType] = useState('container');
  const [targetName, setTargetName] = useState('lab-netinventory');
  const [changesText, setChangesText] = useState(initialChanges);
  const [latestSimulation, setLatestSimulation] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const simulationList = useSearchPagination(simulations);

  const refresh = async (preferredId) => {
    const [nextTemplates, nextSimulations] = await Promise.all([
      apiRequest('/api/v1/sandbox/templates'),
      apiRequest('/api/v1/sandbox/simulations'),
    ]);
    setTemplates(nextTemplates);
    setSimulations(nextSimulations);
    const nextId = preferredId || templateId || (nextTemplates[0] ? String(nextTemplates[0].id_plantilla) : '');
    setTemplateId(nextTemplates.some((template) => String(template.id_plantilla) === nextId) ? nextId : '');
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest('/api/v1/sandbox/templates'),
      apiRequest('/api/v1/sandbox/simulations'),
    ]).then(([nextTemplates, nextSimulations]) => {
      if (!active) return;
      setTemplates(nextTemplates);
      setSimulations(nextSimulations);
      if (nextTemplates.length) setTemplateId(String(nextTemplates[0].id_plantilla));
    }).catch((loadError) => {
      if (active) setError(formatApiError(loadError?.message || loadError));
    });
    return () => { active = false; };
  }, [apiRequest]);

  const saveGeneratedTemplate = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setWorking(true);
    try {
      const selectedDevice = event.currentTarget.elements.device.value;
      const result = await apiRequest('/api/v1/sandbox/templates/generate', {
        method: 'POST',
        body: JSON.stringify({
          id_dispositivo: selectedDevice ? Number(selectedDevice) : null,
        }),
      });
      await refresh(String(result.id_plantilla));
      setNotice(`Plantilla "${result.nombre}" generada.`);
    } catch (requestError) {
      setError(formatApiError(requestError?.message || requestError));
    } finally {
      setWorking(false);
    }
  };

  const importTemplate = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const parsed = JSON.parse(await file.text());
      const configuration = parsed.configuracion ?? parsed.configuration ?? parsed;
      if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
        throw new Error('El archivo debe ser un objeto JSON de configuración.');
      }
      const result = await apiRequest('/api/v1/sandbox/templates', {
        method: 'POST',
        body: JSON.stringify({
          nombre: parsed.nombre || parsed.name || file.name.replace(/\.json$/i, ''),
          descripcion: parsed.descripcion || parsed.description || 'Plantilla importada desde archivo JSON.',
          fabricante: parsed.fabricante || parsed.vendor || null,
          configuracion: configuration,
        }),
      });
      await refresh(String(result.id_plantilla));
      setNotice(`Plantilla "${result.nombre}" importada.`);
    } catch (requestError) {
      setError(requestError instanceof SyntaxError
        ? 'El archivo no contiene JSON válido.'
        : formatApiError(requestError?.message || requestError));
    }
  };

  const simulate = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    let changes;
    try {
      changes = JSON.parse(changesText);
    } catch {
      setError('Los cambios deben ser un objeto JSON válido.');
      return;
    }
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      setError('Los cambios deben ser un objeto JSON con parámetros y valores.');
      return;
    }
    setWorking(true);
    try {
      const result = await apiRequest('/api/v1/sandbox/simulations', {
        method: 'POST',
        body: JSON.stringify({
          tipo_objetivo: targetType,
          nombre_objetivo: targetName.trim(),
          id_plantilla: templateId ? Number(templateId) : null,
          cambios: changes,
        }),
      });
      setLatestSimulation(result);
      await refresh(templateId);
      setNotice('Simulación completada; ningún cambio fue aplicado al entorno real.');
    } catch (requestError) {
      setError(formatApiError(requestError?.message || requestError));
    } finally {
      setWorking(false);
    }
  };

  const selectedTemplate = templates.find((template) => String(template.id_plantilla) === templateId);
  const visibleTemplates = templates.filter((template) => (
    `${template.nombre} ${template.fabricante || ''} ${template.descripcion || ''}`
      .toLocaleLowerCase()
      .includes(templateSearch.trim().toLocaleLowerCase())
  ));
  const selectableTemplates = selectedTemplate && !visibleTemplates.includes(selectedTemplate)
    ? [selectedTemplate, ...visibleTemplates]
    : visibleTemplates;
  const visibleDevices = devices.filter((device) => (
    device.nombre_host.toLocaleLowerCase().includes(deviceSearch.trim().toLocaleLowerCase())
  ));

  return (
    <section className="sandbox-layout">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Plantillas de configuración</h2>
            <p className="muted">Genera una base desde el inventario o carga un archivo JSON.</p>
          </div>
          <span className="sandbox-badge">ENTORNO AISLADO</span>
        </div>
        {user.rol !== 'Auditor' ? (
          <>
            <label className="monitoring-field">
              Buscar activo para generar plantilla
              <input
                type="search"
                value={deviceSearch}
                onChange={(event) => setDeviceSearch(event.target.value)}
                placeholder="Nombre del host"
              />
            </label>
            <div className="data-form sandbox-template-actions">
              <form onSubmit={saveGeneratedTemplate}>
                <label>
                  Generar desde activo (opcional)
                  <select name="device">
                    <option value="">Plantilla genérica</option>
                    {visibleDevices.map((device) => (
                      <option key={device.id_dispositivo} value={device.id_dispositivo}>{device.nombre_host}</option>
                    ))}
                  </select>
                </label>
                <div className="form-actions"><button type="submit" disabled={working}>Generar plantilla</button></div>
              </form>
              <label className="file-upload">
                Cargar plantilla .json
                <input type="file" accept=".json,application/json" onChange={importTemplate} disabled={working} />
              </label>
            </div>
          </>
        ) : <p className="muted">El rol Auditor tiene acceso de solo lectura al sandbox.</p>}
        <label className="monitoring-field">
          Buscar plantilla
          <input
            type="search"
            value={templateSearch}
            onChange={(event) => setTemplateSearch(event.target.value)}
            placeholder="Nombre o fabricante"
          />
        </label>
        <label className="monitoring-field">
          Plantilla para la simulación
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Selecciona una plantilla</option>
            {selectableTemplates.map((template) => (
              <option key={template.id_plantilla} value={template.id_plantilla}>
                {template.nombre}{template.fabricante ? ` · ${template.fabricante}` : ''}
              </option>
            ))}
          </select>
        </label>
        {selectedTemplate ? (
          <details className="sandbox-config-preview">
            <summary>Ver configuración base · {selectedTemplate.nombre}</summary>
            <pre>{JSON.stringify(selectedTemplate.configuracion, null, 2)}</pre>
          </details>
        ) : null}
      </article>

      <article className="panel">
        <h2>Simular cambios</h2>
        <p className="muted">
          Se calcula la diferencia y se validan parámetros conocidos. Esta herramienta no se conecta ni modifica
          contenedores, appliances o dispositivos reales.
        </p>
        {error ? <div className="error-box page-message">{error}</div> : null}
        {notice ? <div className="success-box page-message">{notice}</div> : null}
        {user.rol === 'Auditor' ? (
          <p className="muted">El rol Auditor puede consultar el historial, pero no ejecutar simulaciones.</p>
        ) : (
          <form className="data-form sandbox-simulation-form" onSubmit={simulate}>
            <label>
              Tipo de objetivo
              <select value={targetType} onChange={(event) => setTargetType(event.target.value)}>
                <option value="container">Container</option>
                <option value="virtual_appliance">Virtual appliance</option>
              </select>
            </label>
            <label>
              Nombre del entorno
              <input required maxLength="120" value={targetName} onChange={(event) => setTargetName(event.target.value)} />
            </label>
            <label className="sandbox-json-field">
              Cambios (objeto JSON)
              <textarea required value={changesText} onChange={(event) => setChangesText(event.target.value)} spellCheck="false" />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={working || !templateId}>
                {working ? 'Simulando…' : 'Ejecutar simulación'}
              </button>
              {!templateId ? <span className="muted">Selecciona o genera una plantilla primero.</span> : null}
            </div>
          </form>
        )}
      </article>

      {latestSimulation ? (
        <article className="panel">
          <h2>Resultado · #{latestSimulation.id_simulacion}</h2>
          <p className="muted">
            {latestSimulation.nombre_objetivo} · {latestSimulation.tipo_objetivo === 'container' ? 'Container' : 'Virtual appliance'}
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Parámetro</th><th>Antes</th><th>Después</th><th>Resultado</th></tr></thead>
              <tbody>
                {latestSimulation.diferencias.map((difference) => (
                  <tr key={difference.campo}>
                    <td>{difference.campo}</td>
                    <td>{difference.valor_anterior == null ? '—' : JSON.stringify(difference.valor_anterior)}</td>
                    <td>{difference.valor_nuevo == null ? '—' : JSON.stringify(difference.valor_nuevo)}</td>
                    <td>{difference.tipo === 'sin_cambios' ? 'Sin cambios' : difference.tipo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Validaciones</h3>
          <ul className="sandbox-checks">
            {latestSimulation.validaciones.map((check) => (
              <li key={check.campo} className={`sandbox-check ${check.estado}`}>
                <strong>{check.estado.toUpperCase()}</strong> · {check.campo}: {check.mensaje}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <article className="panel">
        <h2>Historial de simulaciones</h2>
        <ListControls
          search={simulationList.search}
          onSearchChange={simulationList.setSearch}
          page={simulationList.page}
          pageSize={simulationList.pageSize}
          total={simulationList.total}
          onPageChange={simulationList.setPage}
          onPageSizeChange={simulationList.setPageSize}
          placeholder="Nombre del entorno, tipo..."
          label="Buscar historial de simulaciones"
        />
        {simulations.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Objetivo</th><th>Cambios</th><th>Validación</th></tr></thead>
              <tbody>
                {simulationList.pageItems.map((simulation) => (
                  <tr key={simulation.id_simulacion}>
                    <td>{new Date(simulation.fecha_creacion).toLocaleString()}</td>
                    <td>{simulation.nombre_objetivo}<small>{simulation.tipo_objetivo === 'container' ? 'Container' : 'Virtual appliance'}</small></td>
                    <td>{simulation.diferencias.filter((change) => change.tipo !== 'sin_cambios').length}</td>
                    <td>{simulation.validaciones.some((check) => check.estado === 'error') ? 'Con errores' : 'Revisar resultado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Aún no hay simulaciones.</p>}
        {simulations.length > 0 && !simulationList.pageItems.length ? (
          <p className="muted">No hay simulaciones que coincidan con la búsqueda.</p>
        ) : null}
      </article>
    </section>
  );
}
