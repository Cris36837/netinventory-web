import React, { useState, useEffect } from 'react';

const RackElevationPanel = () => {
  const [rackSize, setRackSize] = useState(42);
  const [mountedAssets, setMountedAssets] = useState([
    { id: 1, name: 'Core-Switch-01', ru: 40, height: 2, type: 'Switch', position: 'front' },
    { id: 2, name: 'Server-Web-01', ru: 25, height: 4, type: 'Servidor', position: 'front' },
    { id: 3, name: 'Storage-NAS', ru: 10, height: 4, type: 'Storage', position: 'rear' }
  ]);

  const [selectedRu, setSelectedRu] = useState(null);
  const [newAsset, setNewAsset] = useState({ name: '', height: 1, type: 'Servidor', position: 'front' });

  // Calcular ocupación (HU-17)
  const totalOccupiedRu = mountedAssets.reduce((acc, asset) => acc + asset.height, 0);
  const occupancyPercentage = ((totalOccupiedRu / rackSize) * 100).toFixed(1);
  const availableRu = rackSize - totalOccupiedRu;

  // Manejar montaje de activo (HU-16)
  const handleMountAsset = (e) => {
    e.preventDefault();
    if (!selectedRu || !newAsset.name) return;

    // Verificar si el espacio está libre
    const conflict = mountedAssets.some(
      asset => selectedRu <= asset.ru && selectedRu > asset.ru - asset.height
    );

    if (conflict) {
      alert('Error: El espacio seleccionado ya se encuentra ocupado.');
      return;
    }

    const assetToAdd = {
      id: Date.now(),
      name: newAsset.name,
      ru: selectedRu,
      height: parseInt(newAsset.height),
      type: newAsset.type,
      position: newAsset.position
    };

    setMountedAssets([...mountedAssets, assetToAdd]);
    setNewAsset({ name: '', height: 1, type: 'Servidor', position: 'front' });
    setSelectedRu(null);
  };

  const handleRemoveAsset = (id) => {
    setMountedAssets(mountedAssets.filter(asset => asset.id !== id));
  };

  return (
    <div className="p-6 bg-slate-900 text-slate-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-cyan-400">NETINVENTORY / SPRINT 8</h1>
          <h2 className="text-3xl font-extrabold mt-1">Rack Elevation & Maquetación Física</h2>
          <p className="text-slate-400 mt-2">Gestión de gabinetes, montaje de activos por RU y control de ocupación física.</p>
        </header>

        {/* Panel de Estadísticas / Ocupación (HU-17) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <span className="text-slate-400 text-sm">Capacidad del Rack</span>
            <p className="text-2xl font-bold mt-1">{rackSize} RU</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <span className="text-slate-400 text-sm">Espacio Ocupado</span>
            <p className="text-2xl font-bold text-amber-400 mt-1">{totalOccupiedRu} RU ({occupancyPercentage}%)</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <span className="text-slate-400 text-sm">Espacio Disponible</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{availableRu} RU</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Visualización Gráfica del Rack (HU-16 / HU-17) */}
          <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Gabinete Principal (Rack-A1)</h3>
              <span className="text-xs bg-cyan-900 text-cyan-300 px-2.5 py-1 rounded-full font-medium">Vista Interactiva</span>
            </div>

            <div className="w-full max-w-md bg-slate-950 border-4 border-slate-700 rounded-lg p-2 overflow-y-auto max-h-[600px]">
              {Array.from({ length: rackSize }, (_, index) => {
                const currentRu = rackSize - index;
                
                // Buscar si hay un activo en esta RU
                const assetInRu = mountedAssets.find(
                  asset => currentRu <= asset.ru && currentRu > asset.ru - asset.height
                );

                // Si es la base superior del activo, mostramos su tarjeta
                const isAssetStart = assetInRu && assetInRu.ru === currentRu;

                return (
                  <div 
                    key={currentRu}
                    onClick={() => !assetInRu && setSelectedRu(currentRu)}
                    className={`flex items-center text-xs h-8 border-b border-slate-800 px-2 transition-all ${
                      assetInRu 
                        ? 'bg-cyan-900/60 border-cyan-700 text-cyan-200 cursor-pointer' 
                        : selectedRu === currentRu 
                        ? 'bg-amber-500/30 border-amber-500 cursor-pointer' 
                        : 'hover:bg-slate-900 text-slate-500 cursor-pointer'
                    }`}
                  >
                    <span className="w-8 font-mono text-right pr-3 text-slate-400">{currentRu}</span>
                    <div className="flex-1 truncate font-medium">
                      {isAssetStart ? (
                        <div className="flex justify-between items-center">
                          <span>🚀 {assetInRu.name} <span className="text-[10px] opacity-75">({assetInRu.type} - {assetInRu.height}U - {assetInRu.position})</span></span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleRemoveAsset(assetInRu.id); }}
                            className="text-red-400 hover:text-red-300 px-1 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ) : assetInRu ? (
                        <span className="opacity-40">| (Ocupado por {assetInRu.name})</span>
                      ) : (
                        <span className="text-slate-600 italic">Libre (Clic para montar)</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Formulario de Montaje de Activos (HU-16) */}
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-4">Montaje de Activo (HU-16)</h3>
              
              {selectedRu ? (
                <div className="bg-cyan-950/50 border border-cyan-800 p-3 rounded-lg mb-4 text-sm text-cyan-300">
                  RU seleccionada: <strong className="text-white">#{selectedRu}</strong>
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg mb-4 text-sm text-slate-400">
                  Haz clic en cualquier slot libre de la columna del rack para iniciar el montaje.
                </div>
              )}

              <form onSubmit={handleMountAsset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nombre del Activo</label>
                  <input 
                    type="text" 
                    value={newAsset.name}
                    onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                    placeholder="Ej. Router-Core-02"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Altura (Unidades de Rack - RU)</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="10"
                    value={newAsset.height}
                    onChange={(e) => setNewAsset({...newAsset, height: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tipo de Dispositivo</label>
                  <select 
                    value={newAsset.type}
                    onChange={(e) => setNewAsset({...newAsset, type: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Servidor">Servidor</option>
                    <option value="Switch">Switch</option>
                    <option value="Router">Router</option>
                    <option value="Storage">Storage (NAS/SAN)</option>
                    <option value="Firewall">Firewall</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Orientación del Gabinete</label>
                  <select 
                    value={newAsset.position}
                    onChange={(e) => setNewAsset({...newAsset, position: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="front">Frontal (Front)</option>
                    <option value="rear">Trasero (Rear)</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  disabled={!selectedRu}
                  className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                    selectedRu 
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer' 
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Montar en Rack
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700 text-xs text-slate-400">
              <p>💡 <strong className="text-slate-300">Nota técnica:</strong> Las posiciones se validan contra superposiciones y actualizan dinámicamente el porcentaje de ocupación global del centro de datos.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RackElevationPanel;