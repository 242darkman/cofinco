import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { OrgChart } from 'd3-org-chart';
import {
  Building2, Search, RefreshCw, Minus, Plus, Download, ZoomIn, ZoomOut,
  Maximize2, FileImage, FileText, Code, ShieldAlert, ChevronDown, ChevronRight,
  Users, Loader2, UserCog
} from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { Employe } from '../../hooks/hr/useEmployes';
import { resolveStorageUrl } from '@/lib/format';
import { toast } from '../../lib/toast';
import jsPDF from 'jspdf';

// --- Interfaces ---
interface OrgChartNode {
  id: string;
  parentId: string | null;
  name: string;
  title: string;
  department: string;
  email?: string;
  imageUrl?: string;
  statut?: string;
  _directSubordinates?: number;
  _totalSubordinates?: number;
}

interface OrganigrammeViewProps {
  employes?: Employe[];
}

interface ReassignData {
  employeId: string;
  employeName: string;
  currentManagerId: string | null;
}

// --- Helpers ---
function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ID spécial pour la racine virtuelle (entreprise)
const VIRTUAL_ROOT_ID = '__company_root__';

function transformApiDataToOrgChart(apiData: any[]): OrgChartNode[] {
  if (!apiData || apiData.length === 0) return [];

  const nodes: OrgChartNode[] = [];

  function flatten(node: any, parentId: string | null = null) {
    if (!node || !node.id) return;

    nodes.push({
      id: node.id,
      parentId: parentId,
      name: `${node.nom || ''} ${node.prenom || ''}`.trim() || 'Sans nom',
      title: node.poste || '',
      department: node.departement || '',
      email: node.email,
      imageUrl: node.photoProfile ? resolveStorageUrl(node.photoProfile) : undefined,
      statut: node.statut,
    });

    if (node.subordinates && Array.isArray(node.subordinates)) {
      node.subordinates.forEach((sub: any) => flatten(sub, node.id));
    }
  }

  // Flatten tous les noeuds - TOUJOURS attacher à la racine virtuelle
  apiData.forEach(root => flatten(root, VIRTUAL_ROOT_ID));

  // Toujours ajouter un noeud racine virtuel "Entreprise" pour éviter l'erreur "multiple roots"
  nodes.unshift({
    id: VIRTUAL_ROOT_ID,
    parentId: null,
    name: 'COFINCO',
    title: 'Organisation',
    department: '',
    statut: 'ACTIVE',
  });

  return nodes;
}

// --- Reassign Modal ---
const ReassignModal = ({
  reassignData,
  availableManagers,
  onAccept,
  onCancel,
  isSubmitting,
}: {
  reassignData: ReassignData;
  availableManagers: OrgChartNode[];
  onAccept: (newManagerId: string | null) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) => {
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(
    reassignData.currentManagerId
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in duration-200">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <UserCog size={20} className="text-cyan-400" />
          Réassigner l'employé
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Sélectionnez le nouveau supérieur hiérarchique pour{' '}
          <span className="text-white font-medium">{reassignData.employeName}</span>
        </p>

        <div className="mb-4">
          <label className="block text-xs text-slate-500 mb-2">Nouveau supérieur:</label>
          <select
            value={selectedManagerId || ''}
            onChange={(e) => setSelectedManagerId(e.target.value || null)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">Aucun (niveau direction)</option>
            {availableManagers
              .filter(m => m.id !== reassignData.employeId && m.id !== VIRTUAL_ROOT_ID)
              .map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} - {m.title || 'Poste non défini'}
                </option>
              ))
            }
          </select>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onAccept(selectedManagerId)}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-sm bg-cyan-600 text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ChevronRight size={14} />
            )}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Export Menu Dropdown ---
const ExportMenu = ({
  onExportPNG,
  onExportSVG,
  onExportPDF,
  disabled,
}: {
  onExportPNG: () => void;
  onExportSVG: () => void;
  onExportPDF: () => void;
  disabled: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="p-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        title="Exporter"
      >
        <Download size={18} />
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[160px] animate-in fade-in slide-in-from-top-2 duration-200">
            <button
              onClick={() => { onExportPNG(); setIsOpen(false); }}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
            >
              <FileImage size={16} className="text-blue-400" />
              Export PNG
            </button>
            <button
              onClick={() => { onExportSVG(); setIsOpen(false); }}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
            >
              <Code size={16} className="text-green-400" />
              Export SVG
            </button>
            <button
              onClick={() => { onExportPDF(); setIsOpen(false); }}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
            >
              <FileText size={16} className="text-red-400" />
              Export PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// --- Main Component ---
export default function OrganigrammeView({ employes }: OrganigrammeViewProps) {
  const { hasPermission } = usePermissions();
  const canViewOrganigramme = hasPermission('rh', 'view');
  const canEditOrganigramme = hasPermission('rh', 'edit');

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<OrgChart<OrgChartNode> | null>(null);

  // State
  const [data, setData] = useState<OrgChartNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);
  const [reassignData, setReassignData] = useState<ReassignData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Fetch org chart data
  const fetchOrgChart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/organigramme', { credentials: 'include' });
      if (res.ok) {
        const apiData = await res.json();
        console.log('API organigramme data:', apiData);
        const transformed = transformApiDataToOrgChart(apiData);
        console.log('Transformed data:', transformed);
        setData(transformed);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error('Erreur chargement organigramme:', e);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canViewOrganigramme) {
      fetchOrgChart();
    }
  }, [canViewOrganigramme, fetchOrgChart]);

  // Handle node click for reassignment
  const handleNodeClick = useCallback((nodeId: string) => {
    if (!canEditOrganigramme) return;
    if (nodeId === VIRTUAL_ROOT_ID) return;

    const node = data.find(n => n.id === nodeId);
    if (!node) return;

    setReassignData({
      employeId: node.id,
      employeName: node.name,
      currentManagerId: node.parentId === VIRTUAL_ROOT_ID ? null : node.parentId,
    });
  }, [data, canEditOrganigramme]);

  // Initialize/update chart
  useEffect(() => {
    if (!containerRef.current || data.length === 0 || loading) return;

    // Clear existing chart
    if (chartRef.current) {
      containerRef.current.innerHTML = '';
    }

    // Create new chart instance
    const chart = new OrgChart<OrgChartNode>();

    chart
      .container(containerRef.current as any)
      .data(data)
      .nodeWidth(() => 280)
      .nodeHeight(() => 120)
      .childrenMargin(() => 50)
      .compactMarginBetween(() => 35)
      .siblingsMargin(() => 30)
      .neighbourMargin(() => 50)
      .nodeButtonWidth(() => 30)
      .nodeButtonHeight(() => 30)
      .compact(false)
      .initialZoom(0.8)
      .setActiveNodeCentered(true)
      .nodeContent((d: any) => {
        const node = d.data as OrgChartNode;
        const isVirtualRoot = node.id === VIRTUAL_ROOT_ID;
        const isRoot = node.parentId === VIRTUAL_ROOT_ID;

        // Styles inline pour que l'export PNG fonctionne (Tailwind n'est pas disponible dans l'export)
        const baseNodeStyle = `
          font-family: system-ui, -apple-system, sans-serif;
          border-radius: 12px;
          padding: 12px;
          height: 100%;
          width: 100%;
          box-sizing: border-box;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        `;

        // Style spécial pour la racine virtuelle (entreprise)
        if (isVirtualRoot) {
          return `
            <div style="${baseNodeStyle} background: linear-gradient(to bottom right, #312e81, #581c87); border: 2px solid #818cf8;">
              <div style="display: flex; align-items: center; justify-content: center; gap: 12px; height: 100%;">
                <div style="width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #4f46e5; border: 2px solid #a5b4fc;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
                    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
                    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
                    <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
                  </svg>
                </div>
                <div style="text-align: center;">
                  <h4 style="font-weight: bold; color: white; font-size: 16px; margin: 0;">${node.name}</h4>
                  <p style="font-size: 12px; color: #a5b4fc; margin: 4px 0 0 0;">${node.title}</p>
                  ${d._directSubordinates > 0 ? `
                    <span style="font-size: 10px; color: #c7d2fe; margin-top: 4px; display: inline-block;">${d._directSubordinates} direction(s)</span>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        }

        const borderColor = isRoot ? '#6366f1' : '#475569';
        const bgColor = isRoot ? 'linear-gradient(to bottom right, #1e293b, rgba(49, 46, 129, 0.3))' : '#1e293b';
        const avatarBorder = isRoot ? '#818cf8' : '#64748b';
        const avatarBg = isRoot ? '#4f46e5' : '#334155';

        // Avatar: utiliser background-image au lieu de <img> pour un meilleur rendu dans l'export
        const avatarStyle = node.imageUrl
          ? `background-image: url('${node.imageUrl}'); background-size: cover; background-position: center;`
          : `background: ${avatarBg};`;

        return `
          <div style="${baseNodeStyle} background: ${bgColor}; border: 1px solid ${borderColor}; cursor: pointer;" data-node-id="${node.id}">
            <div style="display: flex; align-items: center; gap: 12px; height: 100%;">
              <div style="position: relative; flex-shrink: 0;">
                <div style="width: 56px; height: 56px; min-width: 56px; min-height: 56px; max-width: 56px; max-height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; overflow: hidden; border: 2px solid ${avatarBorder}; ${avatarStyle}">
                  ${!node.imageUrl ? `<span>${getInitials(node.name)}</span>` : ''}
                </div>
                ${d._directSubordinates > 0 ? `
                  <div style="position: absolute; bottom: -4px; right: -4px; background: #0891b2; color: white; font-size: 10px; font-weight: bold; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid #1e293b;">
                    ${d._directSubordinates}
                  </div>
                ` : ''}
              </div>
              <div style="flex: 1; min-width: 0; overflow: hidden;">
                <h4 style="font-weight: bold; color: white; font-size: 14px; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${node.name}</h4>
                <p style="font-size: 12px; color: #94a3b8; margin: 2px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${node.title || 'Non défini'}</p>
                ${node.department ? `
                  <div style="margin-top: 6px;">
                    <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; background: rgba(15, 23, 42, 0.6); padding: 2px 6px; border-radius: 4px;">
                      ${node.department}
                    </span>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      })
      .buttonContent(({ node }: any) => {
        const hasChildren = node.children || node._children;
        if (!hasChildren) return '';
        const isExpanded = node.children && node.children.length > 0;
        return `
          <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: #334155; border-radius: 50%; border: 1px solid #475569; color: white; font-size: 12px;">
            ${isExpanded ? '−' : '+'}
          </div>
        `;
      })
      .render();

    // Add click listener for reassignment
    if (canEditOrganigramme) {
      containerRef.current.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const nodeEl = target.closest('[data-node-id]');
        if (nodeEl) {
          const nodeId = nodeEl.getAttribute('data-node-id');
          if (nodeId) {
            handleNodeClick(nodeId);
          }
        }
      });
    }

    chartRef.current = chart;

    // Cleanup
    return () => {
      chartRef.current = null;
    };
  }, [data, loading, canEditOrganigramme, handleNodeClick]);

  // Confirm reassignment
  const handleConfirmReassign = async (newManagerId: string | null) => {
    if (!reassignData) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/hr/organigramme/reassign', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeId: reassignData.employeId,
          newManagerId: newManagerId,
        }),
      });

      if (res.ok) {
        toast.success('Hiérarchie mise à jour');
        await fetchOrgChart();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Erreur lors du réassignement');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setIsSubmitting(false);
      setReassignData(null);
    }
  };

  // Search filter
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      // Filter data but keep the virtual root
      const filtered = data.filter(node =>
        node.id === VIRTUAL_ROOT_ID ||
        node.name.toLowerCase().includes(searchLower) ||
        node.title.toLowerCase().includes(searchLower) ||
        node.department.toLowerCase().includes(searchLower)
      );
      chartRef.current.data(filtered).render();
    } else {
      chartRef.current.data(data).render();
    }
  }, [searchTerm, data]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (!chartRef.current) return;
    const newZoom = Math.min(zoomLevel + 20, 200);
    chartRef.current.zoomBehavior().scaleTo(
      chartRef.current.getSvgSelection(),
      newZoom / 100
    );
    setZoomLevel(newZoom);
  }, [zoomLevel]);

  const handleZoomOut = useCallback(() => {
    if (!chartRef.current) return;
    const newZoom = Math.max(zoomLevel - 20, 20);
    chartRef.current.zoomBehavior().scaleTo(
      chartRef.current.getSvgSelection(),
      newZoom / 100
    );
    setZoomLevel(newZoom);
  }, [zoomLevel]);

  const handleFit = useCallback(() => {
    if (!chartRef.current) return;
    chartRef.current.fit();
    setZoomLevel(100);
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!chartRef.current) return;
    chartRef.current.expandAll();
  }, []);

  const handleCollapseAll = useCallback(() => {
    if (!chartRef.current) return;
    chartRef.current.collapseAll();
  }, []);

  // Helper function to convert image URL to base64 data URL
  const imageUrlToBase64 = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url, { credentials: 'include' });
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // Helper function to embed images as base64 in SVG clone
  const embedImagesInSvg = async (svgClone: SVGSVGElement) => {
    // Find all elements with background-image style
    const elementsWithBgImage = svgClone.querySelectorAll('[style*="background-image"]');

    for (const el of Array.from(elementsWithBgImage)) {
      const htmlEl = el as HTMLElement;
      const style = htmlEl.getAttribute('style') || '';
      const match = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);

      if (match && match[1]) {
        const imageUrl = match[1];
        // Skip if already a data URL
        if (imageUrl.startsWith('data:')) continue;

        const base64 = await imageUrlToBase64(imageUrl);
        if (base64) {
          const newStyle = style.replace(
            /background-image:\s*url\(['"]?[^'")\s]+['"]?\)/i,
            `background-image: url('${base64}')`
          );
          htmlEl.setAttribute('style', newStyle);
        }
      }
    }
  };

  // Export PNG using SVG serialization and canvas (avoids html2canvas oklab issues)
  const handleExportPNG = useCallback(async () => {
    if (!containerRef.current) return;
    setExporting(true);

    try {
      // Expand all nodes before export
      chartRef.current?.expandAll();
      await new Promise(resolve => setTimeout(resolve, 500));

      const svg = containerRef.current.querySelector('svg');
      if (!svg) throw new Error('SVG not found');

      // Clone SVG and prepare for export
      const svgClone = svg.cloneNode(true) as SVGSVGElement;

      // Embed all profile images as base64
      await embedImagesInSvg(svgClone);

      // Get SVG dimensions
      const bbox = svg.getBBox();
      const width = Math.max(bbox.width + 100, 1200);
      const height = Math.max(bbox.height + 100, 800);

      svgClone.setAttribute('width', String(width));
      svgClone.setAttribute('height', String(height));
      svgClone.setAttribute('viewBox', `${bbox.x - 50} ${bbox.y - 50} ${width} ${height}`);

      // Add background rect
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', String(bbox.x - 50));
      bgRect.setAttribute('y', String(bbox.y - 50));
      bgRect.setAttribute('width', String(width));
      bgRect.setAttribute('height', String(height));
      bgRect.setAttribute('fill', '#0f172a');
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      // Serialize SVG
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create image and draw to canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;  // 2x for better quality
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(2, 2);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Download
          const link = document.createElement('a');
          link.download = `organigramme_${new Date().toISOString().slice(0, 10)}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();

          toast.success('Organigramme exporté en PNG');
        }
        URL.revokeObjectURL(url);
        setExporting(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        toast.error("Erreur lors de l'export PNG");
        setExporting(false);
      };
      img.src = url;
    } catch (e) {
      console.error('Export PNG error:', e);
      toast.error("Erreur lors de l'export PNG");
      setExporting(false);
    }
  }, []);

  const handleExportSVG = useCallback(async () => {
    if (!containerRef.current) return;
    setExporting(true);

    try {
      // For SVG, use the built-in method as it works better
      const svg = containerRef.current.querySelector('svg');
      if (!svg) throw new Error('SVG not found');

      const svgClone = svg.cloneNode(true) as SVGElement;
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const link = document.createElement('a');
      link.download = `organigramme_${new Date().toISOString().slice(0, 10)}.svg`;
      link.href = url;
      link.click();

      URL.revokeObjectURL(url);
      toast.success('Organigramme exporté en SVG');
    } catch (e) {
      console.error('Export SVG error:', e);
      toast.error("Erreur lors de l'export SVG");
    } finally {
      setExporting(false);
    }
  }, []);

  // Export PDF using SVG serialization and canvas
  const handleExportPDF = useCallback(async () => {
    if (!containerRef.current) return;
    setExporting(true);

    try {
      // Expand all nodes before export
      chartRef.current?.expandAll();
      await new Promise(resolve => setTimeout(resolve, 500));

      const svg = containerRef.current.querySelector('svg');
      if (!svg) throw new Error('SVG not found');

      // Clone SVG and prepare for export
      const svgClone = svg.cloneNode(true) as SVGSVGElement;

      // Embed all profile images as base64
      await embedImagesInSvg(svgClone);

      // Get SVG dimensions
      const bbox = svg.getBBox();
      const width = Math.max(bbox.width + 100, 1200);
      const height = Math.max(bbox.height + 100, 800);

      svgClone.setAttribute('width', String(width));
      svgClone.setAttribute('height', String(height));
      svgClone.setAttribute('viewBox', `${bbox.x - 50} ${bbox.y - 50} ${width} ${height}`);

      // Add background rect
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', String(bbox.x - 50));
      bgRect.setAttribute('y', String(bbox.y - 50));
      bgRect.setAttribute('width', String(width));
      bgRect.setAttribute('height', String(height));
      bgRect.setAttribute('fill', '#0f172a');
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      // Serialize SVG
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create image and draw to canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(2, 2);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: width > height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [width, height],
          });

          pdf.addImage(imgData, 'PNG', 0, 0, width, height);
          pdf.save(`organigramme_${new Date().toISOString().slice(0, 10)}.pdf`);

          toast.success('Organigramme exporté en PDF');
        }
        URL.revokeObjectURL(url);
        setExporting(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        toast.error("Erreur lors de l'export PDF");
        setExporting(false);
      };
      img.src = url;
    } catch (e) {
      console.error('Export PDF error:', e);
      toast.error("Erreur lors de l'export PDF");
      setExporting(false);
    }
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Stats (exclure la racine virtuelle du comptage)
  const stats = useMemo(() => {
    const realNodes = data.filter(n => n.id !== VIRTUAL_ROOT_ID);
    const total = realNodes.length;
    const roots = realNodes.filter(n => n.parentId === VIRTUAL_ROOT_ID).length;
    return { total, roots };
  }, [data]);

  // Access denied view
  if (!canViewOrganigramme) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
        <div className="p-6 bg-slate-800 rounded-full mb-6 ring-1 ring-slate-700 shadow-2xl">
          <ShieldAlert size={64} className="text-red-500" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">Accès Restreint</h3>
        <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
          Cette vue contient des informations sensibles sur la structure de l'entreprise.
          Veuillez contacter votre administrateur pour obtenir les droits d'accès.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-full overflow-hidden">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800 backdrop-blur-sm sticky top-0 z-30 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-2.5 bg-blue-500/10 rounded-lg sm:rounded-xl">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white leading-tight">Organigramme</h3>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users size={12} />
                {stats.total} employés
              </span>
              <span>•</span>
              <span>MAJ: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {canEditOrganigramme && (
                <>
                  <span>•</span>
                  <span className="text-cyan-500 font-medium">Cliquez pour réassigner</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative group flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-40 lg:w-52 bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>

          <div className="hidden sm:block h-8 w-px bg-slate-700 mx-1" />

          {/* Zoom Controls */}
          <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
            <button
              onClick={handleZoomOut}
              className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Zoom arrière"
            >
              <ZoomOut size={16} />
            </button>
            <span className="flex items-center px-2 text-xs text-slate-400 min-w-[40px] justify-center">
              {zoomLevel}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Zoom avant"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={handleFit}
              className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Ajuster à la vue"
            >
              <Maximize2 size={16} />
            </button>
          </div>

          {/* Expand/Collapse */}
          <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
            <button
              onClick={handleExpandAll}
              className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Tout développer"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={handleCollapseAll}
              className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Tout réduire"
            >
              <Minus size={16} />
            </button>
          </div>

          {/* Export */}
          <ExportMenu
            onExportPNG={handleExportPNG}
            onExportSVG={handleExportSVG}
            onExportPDF={handleExportPDF}
            disabled={exporting || data.length === 0}
          />

          {/* Refresh */}
          <button
            onClick={fetchOrgChart}
            disabled={loading}
            className="p-2 sm:p-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Actualiser"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 relative min-h-0 bg-slate-950/50 rounded-xl border border-slate-800 overflow-hidden">
        {loading && data.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-400 animate-pulse">Chargement de la structure...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
            <Users size={64} className="text-slate-700 mb-4" />
            <p className="text-slate-400 font-medium">Aucune structure hiérarchique définie.</p>
            <p className="text-slate-600 text-sm mt-1">Commencez par ajouter des managers et des employés.</p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full h-full min-h-[500px] sm:min-h-[600px] lg:min-h-[700px]"
            style={{ background: 'transparent' }}
          />
        )}

        {/* Loading overlay */}
        {loading && data.length > 0 && (
          <div className="absolute top-4 right-4 bg-slate-800/90 px-3 py-2 rounded-lg flex items-center gap-2 text-sm text-slate-300">
            <Loader2 size={14} className="animate-spin" />
            Actualisation...
          </div>
        )}
      </div>

      {/* Reassign Modal */}
      {reassignData && (
        <ReassignModal
          reassignData={reassignData}
          availableManagers={data}
          onAccept={handleConfirmReassign}
          onCancel={() => setReassignData(null)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* CSS for org chart nodes - scoped to avoid affecting other SVGs */}
      <style>{`
        .org-node {
          font-family: inherit;
        }
        .org-node img {
          -webkit-user-drag: none;
        }
      `}</style>
    </div>
  );
}
