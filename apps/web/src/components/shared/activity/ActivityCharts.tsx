import React from 'react';
import Card from '../../ui/Card';

export default function ActivityCharts() {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-surface p-6">
        <h3 className="text-xl font-bold text-content-primary mb-4">Activité par Heure</h3>
        <div className="h-64 flex items-end justify-around gap-1">
          {Array.from({ length: 24 }, (_, i) => {
            const height = Math.random() * 80 + 20;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full bg-gradient-to-t from-accent to-status-info rounded-t transition-all group-hover:opacity-80"
                  style={{ height: `${height}%` }}
                ></div>
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-surface-base text-content-primary text-xs p-1 rounded z-10 whitespace-nowrap">
                  {i}h: {Math.round(height)} actions
                </div>
                {i % 4 === 0 && <span className="text-xs text-content-muted">{i}h</span>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="bg-surface p-6">
        <h3 className="text-xl font-bold text-content-primary mb-4">Modules les Plus Utilisés</h3>
        <div className="space-y-4">
          {[
            { module: 'Clients', count: 1250, color: 'from-status-info to-accent' },
            { module: 'Crédits', count: 980, color: 'from-status-success to-status-success' },
            { module: 'Épargnes', count: 720, color: 'from-status-success to-accent' },
            { module: 'Tontines', count: 540, color: 'from-status-success to-status-info' },
            { module: 'Comptabilité', count: 380, color: 'from-accent to-status-info' }
          ].map((item, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-content-secondary font-medium">{item.module}</span>
                <span className="text-content-primary font-bold">{item.count}</span>
              </div>
              <div className="h-2.5 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full bg-linear-to-r ${item.color} rounded-full`}
                  style={{ width: `${(item.count / 1250) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
