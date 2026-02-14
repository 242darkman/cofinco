import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';

// Fix Leaflet/Vite icon issue
const defaultIcon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Custom Icon for Agents (maybe different color or icon)
const agentIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers-default/blue-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface AgentLocation {
    userId: string;
    latitude: number;
    longitude: number;
    lastSeen: Date;
    username?: string; // Would be nice to have, but for now we might only have ID from WS or need to fetch
}

export function AgentTrackingMap() {
    const { socket, isConnected } = useWebSocket();
    const [agents, setAgents] = useState<Record<string, AgentLocation>>({});

    // Center on Cameroon/Yaoundé by default
    const center: [number, number] = [3.8480, 11.5021];

    useEffect(() => {
        if (!socket) return;

        const handleMessage = (event: MessageEvent) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'USER_LOCATION') {
                    const { userId, latitude, longitude } = message.payload;
                    setAgents(prev => ({
                        ...prev,
                        [userId]: {
                            userId,
                            latitude: Number(latitude),
                            longitude: Number(longitude),
                            lastSeen: new Date()
                        }
                    }));
                }
            } catch (e) {
                // ignore
            }
        };

        socket.addEventListener('message', handleMessage);
        return () => {
            socket.removeEventListener('message', handleMessage);
        };
    }, [socket]);

    return (
        <Card className="p-4 h-[600px] flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    🗺️ Supervision Agents Terrain
                    <Badge 
                        variant="neutral" 
                        value={isConnected ? 'Temps Réel' : 'Déconnecté'}
                        className={isConnected ? "bg-status-success-bg text-status-success border-status-success/30" : "bg-status-danger-bg text-status-danger border-status-danger/30"}
                    />
                </h3>
                <div className="text-sm text-content-muted">
                    {Object.keys(agents).length} agents actifs
                </div>
            </div>
            
            <div className="flex-1 rounded-lg overflow-hidden border border-edge">
                <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {Object.values(agents).map((agent) => (
                        <Marker 
                            key={agent.userId} 
                            position={[agent.latitude, agent.longitude]} 
                            icon={agentIcon}
                        >
                            <Popup>
                                <div className="text-content-primary">
                                    <strong>Agent #{agent.userId.substring(0, 5)}...</strong><br/>
                                    Vu à: {agent.lastSeen.toLocaleTimeString()}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </Card>
    );
}
