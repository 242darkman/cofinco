import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Search, Plus, Minus, Eye, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Clock, Globe, Briefcase, Star, Activity, Zap, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  priceXAF?: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  open: number;
}

interface MarketIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

interface MarketOverview {
  indices: MarketIndex[];
  topGainers: StockQuote[];
  topLosers: StockQuote[];
  mostActive: StockQuote[];
  lastUpdate: string;
  marketStatus: string;
  xafUsdRate: number;
}

interface PortfolioPosition {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  gainLoss: number;
  gainLossPercent: number;
}

export default function BourseModule() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'marche' | 'portefeuille' | 'ordres' | 'watchlist'>('marche');
  const [marketData, setMarketData] = useState<MarketOverview | null>(null);
  const [popularStocks, setPopularStocks] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);
  const [cashBalance, setCashBalance] = useState(5000000); // 5M XAF initial

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMarketData = async () => {
    try {
      const [overviewRes, popularRes] = await Promise.all([
        fetch('/api/bourse/market-overview', { credentials: 'include' }),
        fetch('/api/bourse/popular-stocks', { credentials: 'include' })
      ]);
      
      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setMarketData(data.data);
      }
      
      if (popularRes.ok) {
        const data = await popularRes.json();
        setPopularStocks(data.data);
      }
    } catch (error) {
      console.error('Erreur chargement données marché:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  };

  const formatCurrency = (amount: number, currency: string = 'XAF') => {
    if (currency === 'XAF') {
      return `${formatNumber(amount, 0)} FCFA`;
    }
    return `$${formatNumber(amount)}`;
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toString();
  };

  const handleTrade = (stock: StockQuote, type: 'buy' | 'sell') => {
    setSelectedStock(stock);
    setTradeType(type);
    setTradeQuantity(1);
    setShowTradeModal(true);
  };

  const executeTrade = () => {
    if (!selectedStock) return;
    
    const totalCost = (selectedStock.priceXAF || selectedStock.price * 610) * tradeQuantity;
    
    if (tradeType === 'buy') {
      if (totalCost > cashBalance) {
        alert('Solde insuffisant');
        return;
      }
      setCashBalance(prev => prev - totalCost);
      
      const existingPosition = portfolioPositions.find(p => p.symbol === selectedStock.symbol);
      if (existingPosition) {
        setPortfolioPositions(prev => prev.map(p => 
          p.symbol === selectedStock.symbol 
            ? {
                ...p,
                quantity: p.quantity + tradeQuantity,
                avgPrice: ((p.avgPrice * p.quantity) + totalCost) / (p.quantity + tradeQuantity),
                value: (p.quantity + tradeQuantity) * (selectedStock.priceXAF || selectedStock.price * 610),
              }
            : p
        ));
      } else {
        setPortfolioPositions(prev => [...prev, {
          symbol: selectedStock.symbol,
          name: selectedStock.name,
          quantity: tradeQuantity,
          avgPrice: selectedStock.priceXAF || selectedStock.price * 610,
          currentPrice: selectedStock.priceXAF || selectedStock.price * 610,
          value: totalCost,
          gainLoss: 0,
          gainLossPercent: 0,
        }]);
      }
    } else {
      const position = portfolioPositions.find(p => p.symbol === selectedStock.symbol);
      if (!position || position.quantity < tradeQuantity) {
        alert('Actions insuffisantes');
        return;
      }
      setCashBalance(prev => prev + totalCost);
      
      if (position.quantity === tradeQuantity) {
        setPortfolioPositions(prev => prev.filter(p => p.symbol !== selectedStock.symbol));
      } else {
        setPortfolioPositions(prev => prev.map(p =>
          p.symbol === selectedStock.symbol
            ? { ...p, quantity: p.quantity - tradeQuantity, value: (p.quantity - tradeQuantity) * p.currentPrice }
            : p
        ));
      }
    }
    
    setShowTradeModal(false);
  };

  const renderMarketTab = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {marketData?.indices.map((index) => (
          <div key={index.symbol} className="bg-slate-800/50 rounded-xl p-3 sm:p-4 border border-slate-700/50 min-w-0" data-testid={`index-card-${index.symbol}`}>
            <div className="text-[11px] sm:text-xs text-slate-400 mb-1 truncate">{index.name}</div>
            <div className="text-base sm:text-lg font-bold text-white">{formatNumber(index.value, 0)}</div>
            <div className={`flex items-center gap-1 text-xs sm:text-sm ${index.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {index.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span>{index.change >= 0 ? '+' : ''}{formatNumber(index.change)} ({formatNumber(index.changePercent)}%)</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-white">Actions Populaires</h3>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm ${marketData?.marketStatus === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            <Activity size={12} />
            {marketData?.marketStatus === 'open' ? 'Marché ouvert' : 'Marché fermé'}
          </div>
        </div>
        <button
          onClick={fetchMarketData}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/70 border border-slate-700 rounded-lg text-blue-300 hover:text-blue-200 text-xs sm:text-sm transition"
          data-testid="button-refresh-market"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Rechercher une action (ex: AAPL, MSFT...)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm sm:text-base placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          data-testid="input-search-stock"
        />
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-700/30">
              <th className="text-left px-4 py-3 font-medium text-slate-400 text-[11px] sm:text-xs">Action</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400 text-[11px] sm:text-xs hidden xl:table-cell">Prix USD</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400 text-[11px] sm:text-xs">Prix XAF</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400 text-[11px] sm:text-xs">Variation</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400 text-[11px] sm:text-xs hidden xl:table-cell">Volume</th>
              <th className="text-center px-4 py-3 font-medium text-slate-400 text-[11px] sm:text-xs">Actions</th>
            </tr>
          </thead>
          <tbody>
            {popularStocks
              .filter(s => !searchQuery || s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((stock) => (
              <tr key={stock.symbol} className="border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors" data-testid={`stock-row-${stock.symbol}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                      {stock.symbol.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{stock.symbol}</div>
                      <div className="text-[11px] sm:text-xs text-slate-400 truncate">{stock.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right hidden xl:table-cell">
                  <span className="font-semibold text-white">${formatNumber(stock.price)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-cyan-400">{formatNumber(stock.priceXAF || stock.price * 610, 0)} FCFA</span>
                  <span className="block text-[10px] text-slate-500 xl:hidden">${formatNumber(stock.price)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`flex items-center justify-end gap-1 ${stock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stock.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {stock.change >= 0 ? '+' : ''}{formatNumber(stock.changePercent)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-300 hidden xl:table-cell">
                  {formatVolume(stock.volume)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                    <button
                      onClick={() => handleTrade(stock, 'buy')}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors w-full sm:w-auto"
                      data-testid={`button-buy-${stock.symbol}`}
                    >
                      <Plus size={12} className="inline mr-1" />
                      Acheter
                    </button>
                    <button
                      onClick={() => handleTrade(stock, 'sell')}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors w-full sm:w-auto"
                      data-testid={`button-sell-${stock.symbol}`}
                    >
                      <Minus size={12} className="inline mr-1" />
                      Vendre
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <h4 className="font-semibold text-green-400 mb-3 flex items-center gap-2">
            <TrendingUp size={18} />
            Top Hausses
          </h4>
          <div className="space-y-2">
            {marketData?.topGainers.slice(0, 3).map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <div>
                  <div className="font-medium text-white">{stock.symbol}</div>
                  <div className="text-xs text-slate-400">{stock.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-white">${formatNumber(stock.price)}</div>
                  <div className="text-green-400 text-sm">+{formatNumber(stock.changePercent)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <h4 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
            <TrendingDown size={18} />
            Top Baisses
          </h4>
          <div className="space-y-2">
            {marketData?.topLosers.slice(0, 3).map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <div>
                  <div className="font-medium text-white">{stock.symbol}</div>
                  <div className="text-xs text-slate-400">{stock.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-white">${formatNumber(stock.price)}</div>
                  <div className="text-red-400 text-sm">{formatNumber(stock.changePercent)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <h4 className="font-semibold text-blue-400 mb-3 flex items-center gap-2">
            <Zap size={18} />
            Plus Actifs
          </h4>
          <div className="space-y-2">
            {marketData?.mostActive.slice(0, 3).map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <div>
                  <div className="font-medium text-white">{stock.symbol}</div>
                  <div className="text-xs text-slate-400">{stock.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-white">${formatNumber(stock.price)}</div>
                  <div className="text-blue-400 text-sm">{formatVolume(stock.volume)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPortfolioTab = () => {
    const totalValue = portfolioPositions.reduce((sum, p) => sum + p.value, 0);
    const totalInvested = portfolioPositions.reduce((sum, p) => sum + (p.avgPrice * p.quantity), 0);
    const totalGainLoss = totalValue - totalInvested;
    const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-5" data-testid="card-total-value">
            <div className="flex items-center gap-2 text-blue-200 mb-2">
              <Briefcase size={18} />
              <span className="text-sm">Valeur Totale</span>
            </div>
            <div className="text-2xl font-bold text-white">{formatCurrency(totalValue + cashBalance)}</div>
            <div className="text-sm text-blue-200 mt-1">Portefeuille + Liquidités</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-600 to-cyan-800 rounded-xl p-5" data-testid="card-cash-balance">
            <div className="flex items-center gap-2 text-cyan-200 mb-2">
              <DollarSign size={18} />
              <span className="text-sm">Solde Disponible</span>
            </div>
            <div className="text-2xl font-bold text-white">{formatCurrency(cashBalance)}</div>
            <div className="text-sm text-cyan-200 mt-1">Pour investir</div>
          </div>

          <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-5">
            <div className="flex items-center gap-2 text-purple-200 mb-2">
              <PieChart size={18} />
              <span className="text-sm">Actions Détenues</span>
            </div>
            <div className="text-2xl font-bold text-white">{formatCurrency(totalValue)}</div>
            <div className="text-sm text-purple-200 mt-1">{portfolioPositions.length} position(s)</div>
          </div>

          <div className={`bg-gradient-to-br ${totalGainLoss >= 0 ? 'from-green-600 to-green-800' : 'from-red-600 to-red-800'} rounded-xl p-5`} data-testid="card-gain-loss">
            <div className={`flex items-center gap-2 ${totalGainLoss >= 0 ? 'text-green-200' : 'text-red-200'} mb-2`}>
              {totalGainLoss >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              <span className="text-sm">Gain/Perte</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)}
            </div>
            <div className={`text-sm ${totalGainLoss >= 0 ? 'text-green-200' : 'text-red-200'} mt-1`}>
              {totalGainLoss >= 0 ? '+' : ''}{formatNumber(totalGainLossPercent)}%
            </div>
          </div>
        </div>

        {portfolioPositions.length > 0 ? (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="p-4 border-b border-slate-700/50">
              <h3 className="font-semibold text-white">Mes Positions</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Action</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">Quantité</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">Prix Moyen</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">Prix Actuel</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">Valeur</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">+/- Value</th>
                </tr>
              </thead>
              <tbody>
                {portfolioPositions.map((position) => (
                  <tr key={position.symbol} className="border-t border-slate-700/30 hover:bg-slate-700/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          {position.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{position.symbol}</div>
                          <div className="text-xs text-slate-400">{position.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">{position.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatCurrency(position.avgPrice)}</td>
                    <td className="px-4 py-3 text-right text-white">{formatCurrency(position.currentPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-cyan-400">{formatCurrency(position.value)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={position.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {position.gainLoss >= 0 ? '+' : ''}{formatCurrency(position.gainLoss)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
            <Briefcase className="mx-auto mb-4 text-slate-500" size={48} />
            <h3 className="text-lg font-semibold text-white mb-2">Aucune position</h3>
            <p className="text-slate-400 mb-4">Vous n'avez pas encore d'actions dans votre portefeuille</p>
            <button
              onClick={() => setActiveTab('marche')}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              data-testid="button-go-to-market"
            >
              Explorer le marché
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading && !marketData) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 relative min-h-[600px]" data-testid="bourse-module">
      {/* Coming Soon Overlay */}
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800">
        <div className="text-center p-8 max-w-md">
           <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Clock className="text-amber-500" size={32} />
           </div>
           <h2 className="text-2xl font-bold text-white mb-3">Bientôt Disponible</h2>
           <p className="text-slate-400 mb-6">Le module de bourse est en cours de développement. Cette fonctionnalité sera bientôt activée.</p>
        </div>
      </div>

      <div className="filter blur-[2px] opacity-50 pointer-events-none select-none space-y-4 sm:space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
              <BarChart3 size={20} />
            </div>
            Marché Boursier
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Investissez dans les marchés internationaux en temps réel
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
          <div className="bg-slate-800 rounded-lg px-3 sm:px-4 py-2 border border-slate-700">
            <div className="text-[11px] sm:text-xs text-slate-400">Taux USD/XAF</div>
            <div className="font-semibold text-cyan-400 text-sm sm:text-base">
              1 USD = {marketData?.xafUsdRate || 610} FCFA
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg px-3 sm:px-4 py-2 border border-slate-700">
            <div className="text-[11px] sm:text-xs text-slate-400">Mise à jour</div>
            <div className="font-semibold text-white flex items-center gap-1 text-sm sm:text-base">
              <Clock size={14} />
              {marketData?.lastUpdate ? new Date(marketData.lastUpdate).toLocaleTimeString() : '--:--'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-nowrap sm:flex-wrap gap-2 border-b border-slate-700 pb-2 overflow-x-auto sm:overflow-visible scrollbar-thin">
        {[
          { id: 'marche', label: 'Marché', icon: Globe },
          { id: 'portefeuille', label: 'Portefeuille', icon: Briefcase },
          { id: 'ordres', label: 'Ordres', icon: Activity },
          { id: 'watchlist', label: 'Watchlist', icon: Star },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-all text-xs sm:text-sm whitespace-nowrap ${
              activeTab === id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            data-testid={`tab-${id}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'marche' && renderMarketTab()}
      {activeTab === 'portefeuille' && renderPortfolioTab()}
      {activeTab === 'ordres' && (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <Activity className="mx-auto mb-4 text-slate-500" size={48} />
          <h3 className="text-lg font-semibold text-white mb-2">Historique des ordres</h3>
          <p className="text-slate-400">Vos ordres d'achat et de vente apparaîtront ici</p>
        </div>
      )}
      {activeTab === 'watchlist' && (
        <div className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center">
          <Star className="mx-auto mb-4 text-slate-500" size={48} />
          <h3 className="text-lg font-semibold text-white mb-2">Liste de surveillance</h3>
          <p className="text-slate-400">Ajoutez des actions à surveiller pour recevoir des alertes</p>
        </div>
      )}

      {showTradeModal && selectedStock && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowTradeModal(false)}>
          <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700" onClick={e => e.stopPropagation()} data-testid="trade-modal">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${tradeType === 'buy' ? 'bg-green-600' : 'bg-red-600'}`}>
                {tradeType === 'buy' ? <Plus size={20} /> : <Minus size={20} />}
              </div>
              {tradeType === 'buy' ? 'Acheter' : 'Vendre'} {selectedStock.symbol}
            </h3>

            <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-slate-400">Prix actuel</span>
                <span className="text-white font-semibold">${formatNumber(selectedStock.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">En FCFA</span>
                <span className="text-cyan-400 font-semibold">{formatCurrency(selectedStock.priceXAF || selectedStock.price * 610)}</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">Quantité</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTradeQuantity(Math.max(1, tradeQuantity - 1))}
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <Minus size={18} className="text-white" />
                </button>
                <input
                  type="number"
                  value={tradeQuantity}
                  onChange={(e) => setTradeQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-center text-lg font-semibold"
                  min="1"
                  data-testid="input-trade-quantity"
                />
                <button
                  onClick={() => setTradeQuantity(tradeQuantity + 1)}
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <Plus size={18} className="text-white" />
                </button>
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-slate-400">Montant total</span>
                <span className="text-xl font-bold text-white">
                  {formatCurrency((selectedStock.priceXAF || selectedStock.price * 610) * tradeQuantity)}
                </span>
              </div>
              {tradeType === 'buy' && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Solde après achat</span>
                  <span className={cashBalance - ((selectedStock.priceXAF || selectedStock.price * 610) * tradeQuantity) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatCurrency(cashBalance - ((selectedStock.priceXAF || selectedStock.price * 610) * tradeQuantity))}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTradeModal(false)}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={executeTrade}
                className={`flex-1 px-4 py-3 ${tradeType === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} text-white rounded-lg font-medium transition-colors`}
                data-testid="button-confirm-trade"
              >
                Confirmer {tradeType === 'buy' ? "l'achat" : 'la vente'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
