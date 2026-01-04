import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle as LeafletCircle, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import Card from '../ui/Card';

const BRAZZAVILLE_CENTER: [number, number] = [-4.2634, 15.2429];

const zoneColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

interface Agent {
  id: string;
  nom: string;
  prenom: string;
  zoneAffectation: string;
  zoneLatitude: string | null;
  zoneLongitude: string | null;
  zoneRayon: string | null;
}

interface MapProps {
  agentsWithZones: Agent[];
  selectedAgentId: string | null;
  editingAgentId: string | null;
  editingPosition: { latitude: string; longitude: string; rayon: string; zoneAffectation: string } | null;
  onMapClick: (lat: number, lng: number) => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AdminGestionZonesMap({
  agentsWithZones,
  selectedAgentId,
  editingAgentId,
  editingPosition,
  onMapClick
}: MapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  if (!isClient) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
            <MapContainer
            center={BRAZZAVILLE_CENTER}
            zoom={12}
            className="h-full w-full"
            style={{ zIndex: 1 }}
            >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <MapClickHandler onMapClick={onMapClick} />

            {agentsWithZones.map((agent, index) => {
                const lat = parseFloat(agent.zoneLatitude!);
                const lng = parseFloat(agent.zoneLongitude!);
                const rayon = parseFloat(agent.zoneRayon || '2') * 1000;
                const color = zoneColors[index % zoneColors.length];
                const isSelected = selectedAgentId === agent.id || editingAgentId === agent.id;

                return (
                <div key={agent.id}>
                    <LeafletCircle
                    center={[lat, lng]}
                    radius={rayon}
                    pathOptions={{
                        color: color,
                        fillColor: color,
                        fillOpacity: isSelected ? 0.4 : 0.2,
                        weight: isSelected ? 3 : 2
                    }}
                    />
                    <Marker position={[lat, lng]}>
                    <Popup>
                        <div className="text-center">
                        <strong>{agent.prenom} {agent.nom}</strong>
                        <br />
                        <span className="text-gray-600">{agent.zoneAffectation}</span>
                        <br />
                        <span className="text-sm">Rayon: {agent.zoneRayon || '2'} km</span>
                        </div>
                    </Popup>
                    </Marker>
                </div>
                );
            })}

            {editingPosition && editingPosition.latitude && editingPosition.longitude && (
                <>
                <LeafletCircle
                    center={[parseFloat(editingPosition.latitude), parseFloat(editingPosition.longitude)]}
                    radius={parseFloat(editingPosition.rayon) * 1000}
                    pathOptions={{
                    color: '#3B82F6',
                    fillColor: '#3B82F6',
                    fillOpacity: 0.3,
                    weight: 3,
                    dashArray: '10, 5'
                    }}
                />
                <Marker position={[parseFloat(editingPosition.latitude), parseFloat(editingPosition.longitude)]}>
                    <Popup>
                    <div className="text-center">
                        <strong>Nouvelle position</strong>
                        <br />
                        <span>{editingPosition.zoneAffectation}</span>
                    </div>
                    </Popup>
                </Marker>
            </>
            )}
            </MapContainer>
    </div>
  );
}
