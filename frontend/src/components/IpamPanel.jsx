import { useEffect, useState } from 'react';
import { formatApiError } from '../utils/errors';
import ListControls from './ListControls';

const emptySubnet = { cidr: '', etiqueta_vlan: '', nombre_segmento: '', descripcion: '' };

export default function IpamPanel({ apiRequest, user }) {
  const [subnets, setSubnets] = useState([]);
  const [subnetSearch, setSubnetSearch] = useState('');
  const [selectedSubnetId, setSelectedSubnetId] = useState('');
  const [addresses, setAddresses] = useState({ ips: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [ipSearch, setIpSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [subnetForm, setSubnetForm] = useState(emptySubnet);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const selectedSubnet = subnets.find((subnet) => String(subnet.id_vlan) === selectedSubnetId);
  const matchingSubnets = subnets.filter((subnet) => (
    `VLAN ${subnet.etiqueta_vlan} ${subnet.nombre_segmento} ${subnet.cidr}`
      .toLocaleLowerCase()
      .includes(subnetSearch.trim().toLocaleLowerCase())
  ));
  const visibleSubnets = selectedSubnet && !matchingSubnets.includes(selectedSubnet)
    ? [selectedSubnet, ...matchingSubnets]
    : matchingSubnets;

  const loadSubnets = async (preferredId) => {
    const items = await apiRequest('/api/v1/ipam/subnets');
    setSubnets(items);
    const nextId = preferredId || selectedSubnetId || (items[0] ? String(items[0].id_vlan) : '');
    setSelectedSubnetId(items.some((item) => String(item.id_vlan) === nextId) ? nextId : '');
  };

  const loadAddresses = async () => {
    if (!selectedSubnetId) {
      setAddresses({ ips: [], total: 0 });
      return;
    }
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(pageSize),
    });
    if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
    const result = await apiRequest(
      `/api/v1/ipam/subnets/${selectedSubnetId}/addresses?${params}`,
    );
    setAddresses(result);
  };

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/ipam/subnets')
      .then((items) => {
        if (!active) return;
        setSubnets(items);
        if (items.length) setSelectedSubnetId(String(items[0].id_vlan));
      })
      .catch((loadError) => {
        if (active) setError(formatApiError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiRequest]);

  useEffect(() => {
    let active = true;
    if (!selectedSubnetId) return undefined;
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(pageSize),
    });
    if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
    apiRequest(`/api/v1/ipam/subnets/${selectedSubnetId}/addresses?${params}`)
      .then((result) => {
        if (active) {
          setAddresses(result);
          setError('');
        }
      })
      .catch((loadError) => {
        if (active) setError(formatApiError(loadError));
      });
    return () => {
      active = false;
    };
  }, [apiRequest, appliedSearch, offset, pageSize, selectedSubnetId]);

  const createSubnet = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const created = await apiRequest('/api/v1/ipam/subnets', {
        method: 'POST',
        body: JSON.stringify({
          ...subnetForm,
          etiqueta_vlan: Number(subnetForm.etiqueta_vlan),
          descripcion: subnetForm.descripcion.trim() || null,
        }),
      });
      setSubnetForm(emptySubnet);
      setOffset(0);
      setIpSearch('');
      setAppliedSearch('');
      await loadSubnets(String(created.id_vlan));
      setNotice('Subred creada.');
    } catch (requestError) {
      setError(formatApiError(requestError));
    }
  };

  const reserveAddress = async (address) => {
    const purpose = window.prompt(`¿Para qué se reserva ${address}?`);
    if (purpose === null) return;
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/ipam/subnets/${selectedSubnetId}/reservations`, {
        method: 'POST',
        body: JSON.stringify({ direccion: address, proposito: purpose.trim() || null }),
      });
      await loadAddresses();
      setNotice(`${address} quedó reservada.`);
    } catch (requestError) {
      setError(formatApiError(requestError));
    }
  };

  const releaseAddress = async (address) => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/ipam/reservations/${address.id_ip}`, { method: 'DELETE' });
      await loadAddresses();
      setNotice(`${address.direccion} volvió a estar libre.`);
    } catch (requestError) {
      setError(formatApiError(requestError));
    }
  };

  return (
    <section className="panel">
      <h2>Gestión IPAM</h2>
      <p className="muted">Consulta las IP ocupadas por activos y administra reservas de cada subred.</p>
      {error ? <div className="error-box page-message">{error}</div> : null}
      {notice ? <div className="success-box page-message">{notice}</div> : null}

      {user.rol !== 'Auditor' ? (
        <form className="data-form" onSubmit={createSubnet}>
          <label>
            Red CIDR
            <input
              required
              value={subnetForm.cidr}
              onChange={(event) => setSubnetForm({ ...subnetForm, cidr: event.target.value })}
              placeholder="192.168.1.0/24"
            />
          </label>
          <label>
            VLAN
            <input
              required
              type="number"
              min="1"
              max="4094"
              value={subnetForm.etiqueta_vlan}
              onChange={(event) => setSubnetForm({ ...subnetForm, etiqueta_vlan: event.target.value })}
            />
          </label>
          <label>
            Nombre del segmento
            <input
              required
              maxLength="100"
              value={subnetForm.nombre_segmento}
              onChange={(event) => setSubnetForm({ ...subnetForm, nombre_segmento: event.target.value })}
            />
          </label>
          <label>
            Descripción (opcional)
            <input
              maxLength="1000"
              value={subnetForm.descripcion}
              onChange={(event) => setSubnetForm({ ...subnetForm, descripcion: event.target.value })}
            />
          </label>
          <div className="form-actions"><button type="submit">Crear subred</button></div>
        </form>
      ) : null}

      {loading ? <p className="muted">Cargando subredes...</p> : null}
      {!loading && !subnets.length ? <p className="muted">Todavía no hay subredes registradas.</p> : null}
      {subnets.length ? (
        <>
          <label className="ipam-subnet-select">
            Buscar subred
            <input
              type="search"
              value={subnetSearch}
              onChange={(event) => setSubnetSearch(event.target.value)}
              placeholder="VLAN, nombre o CIDR"
            />
          </label>
          <label className="ipam-subnet-select">
            Subred
            <select
              value={selectedSubnetId}
              onChange={(event) => {
                setOffset(0);
                setSelectedSubnetId(event.target.value);
              }}
            >
              {visibleSubnets.map((subnet) => (
                <option key={subnet.id_vlan} value={subnet.id_vlan}>
                  VLAN {subnet.etiqueta_vlan} · {subnet.nombre_segmento} · {subnet.cidr} · {subnet.total_ips} IPs
                </option>
              ))}
            </select>
          </label>
          <ListControls
            search={appliedSearch}
            onSearchChange={setAppliedSearch}
            draftSearch={ipSearch}
            onDraftSearchChange={setIpSearch}
            onSearchSubmit={() => {
              setAppliedSearch(ipSearch.trim());
              setOffset(0);
            }}
            submitSearch
            page={Math.floor(offset / pageSize)}
            pageSize={pageSize}
            total={addresses.total}
            onPageChange={(page) => setOffset(page * pageSize)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setOffset(0);
            }}
            placeholder="IP exacta o rango CIDR"
            label="Buscar IP o rango CIDR"
          />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Dirección IP</th><th>Estado</th><th>Uso / activo</th>{user.rol !== 'Auditor' ? <th>Acción</th> : null}</tr></thead>
              <tbody>
                {addresses.ips.map((address) => (
                  <tr key={address.direccion}>
                    <td>{address.direccion}</td>
                    <td><span className={`status-pill ip-status-${address.estado}`}>{address.estado}</span></td>
                    <td>{address.proposito || '—'}</td>
                    {user.rol !== 'Auditor' ? (
                      <td className="row-actions">
                        {address.estado === 'libre' ? (
                          <button type="button" className="small-button" onClick={() => reserveAddress(address.direccion)}>Reservar</button>
                        ) : null}
                        {address.estado === 'reservada' ? (
                          <button type="button" className="small-button danger-button" onClick={() => releaseAddress(address)}>Liberar</button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!addresses.ips.length ? (
                  <tr><td colSpan={user.rol !== 'Auditor' ? 4 : 3} className="muted">No hay direcciones que coincidan con la búsqueda.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
