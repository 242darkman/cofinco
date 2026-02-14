
import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';

interface DistributionItem {
  name: string;
  value: number;
  color: string;
}

interface PortfolioDistributionChartProps {
  data: DistributionItem[];
  height?: number;
}

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={5}
      />
    </g>
  );
};

export default function PortfolioDistributionChart({ 
  data, 
  height = 350 
}: PortfolioDistributionChartProps) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(undefined);
  };

  // Calculate total for center display
  const total = data.reduce((acc, item) => acc + item.value, 0);
  const activeItem = activeIndex !== undefined ? data[activeIndex] : null;

  return (
    <div className="bg-surface-base border border-edge rounded-2xl overflow-hidden shadow-sm flex flex-col h-full min-h-[350px]">
      <div className="p-5 border-b border-edge/50">
        <h3 className="text-base font-bold text-content-primary mb-1">
          {t('repartitionPortefeuille') || 'Répartition Portefeuille'}
        </h3>
        <p className="text-xs text-content-muted">
          {t('vueDensembleComptes') || "Vue d'ensemble par type de produit"}
        </p>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-4">
        <div className="w-full h-[200px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                cornerRadius={5}
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                 contentStyle={{ 
                   backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                   borderColor: '#334155', 
                   borderRadius: '12px', 
                   fontSize: '12px',
                   boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                   backdropFilter: 'blur(8px)'
                 }}
                 itemStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                 separator=": "
                 formatter={(value, name, props) => [`${value}%`, props.payload.name]}
              />
            </PieChart>
          </ResponsiveContainer>
          
          {/* Centre du Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
             <div className="text-2xl font-bold text-content-primary tabular-nums">
               {activeItem ? `${activeItem.value}%` : '100%'}
             </div>
             <div className="text-[10px] text-content-muted uppercase tracking-widest font-medium mt-1">
               {activeItem ? activeItem.name : (t('global') || 'GLOBAL')}
             </div>
          </div>
        </div>

        {/* Custom Legend */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-6 w-full px-4">
          {data.map((item, index) => (
            <div 
              key={item.name} 
              className={`flex items-center gap-3 transition-opacity duration-200 ${activeIndex !== undefined && activeIndex !== index ? 'opacity-30' : 'opacity-100'}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-content-muted font-medium truncate flex-1">{item.name}</span>
              <span className="text-xs font-bold text-content-primary tabular-nums">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
