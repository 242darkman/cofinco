import type { Express } from "express";
import { requireAuth } from "./auth";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  open: number;
  latestTradingDay: string;
}

interface MarketIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

const stockCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute cache

const popularStocks = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
];

const africanStocks = [
  { symbol: 'SNTS.JO', name: 'Sanlam Ltd (JSE)' },
  { symbol: 'SOL.JO', name: 'Sasol Ltd (JSE)' },
  { symbol: 'MTN.JO', name: 'MTN Group (JSE)' },
  { symbol: 'NPN.JO', name: 'Naspers (JSE)' },
  { symbol: 'SBK.JO', name: 'Standard Bank (JSE)' },
];

const marketIndices: MarketIndex[] = [
  { symbol: 'DJI', name: 'Dow Jones', value: 0, change: 0, changePercent: 0 },
  { symbol: 'SPX', name: 'S&P 500', value: 0, change: 0, changePercent: 0 },
  { symbol: 'IXIC', name: 'NASDAQ', value: 0, change: 0, changePercent: 0 },
  { symbol: 'FTSE', name: 'FTSE 100', value: 0, change: 0, changePercent: 0 },
  { symbol: 'CAC', name: 'CAC 40', value: 0, change: 0, changePercent: 0 },
];

async function fetchWithCache(url: string, cacheKey: string): Promise<any> {
  const cached = stockCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    stockCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`[Stock API] Fetch error for ${cacheKey}:`, error);
    if (cached) return cached.data;
    throw error;
  }
}

async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const data = await fetchWithCache(url, `quote:${symbol}`);
    
    if (data['Global Quote'] && Object.keys(data['Global Quote']).length > 0) {
      const quote = data['Global Quote'];
      return {
        symbol: quote['01. symbol'] || symbol,
        name: popularStocks.find(s => s.symbol === symbol)?.name || symbol,
        price: parseFloat(quote['05. price']) || 0,
        change: parseFloat(quote['09. change']) || 0,
        changePercent: parseFloat(quote['10. change percent']?.replace('%', '')) || 0,
        high: parseFloat(quote['03. high']) || 0,
        low: parseFloat(quote['04. low']) || 0,
        volume: parseInt(quote['06. volume']) || 0,
        previousClose: parseFloat(quote['08. previous close']) || 0,
        open: parseFloat(quote['02. open']) || 0,
        latestTradingDay: quote['07. latest trading day'] || new Date().toISOString().split('T')[0],
      };
    }
    return null;
  } catch (error) {
    console.error(`[Stock API] Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

async function searchStocks(query: string): Promise<Array<{ symbol: string; name: string; type: string; region: string }>> {
  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const data = await fetchWithCache(url, `search:${query}`);
    
    if (data.bestMatches) {
      return data.bestMatches.map((match: any) => ({
        symbol: match['1. symbol'],
        name: match['2. name'],
        type: match['3. type'],
        region: match['4. region'],
      }));
    }
    return [];
  } catch (error) {
    console.error('[Stock API] Search error:', error);
    return [];
  }
}

async function getIntradayData(symbol: string, interval: string = '5min'): Promise<any[]> {
  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const data = await fetchWithCache(url, `intraday:${symbol}:${interval}`);
    
    const timeSeries = data[`Time Series (${interval})`];
    if (timeSeries) {
      return Object.entries(timeSeries).map(([time, values]: [string, any]) => ({
        time,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume']),
      })).slice(0, 50);
    }
    return [];
  } catch (error) {
    console.error(`[Stock API] Intraday error for ${symbol}:`, error);
    return [];
  }
}

function generateMockMarketData(): { indices: MarketIndex[]; stocks: StockQuote[] } {
  const mockIndices: MarketIndex[] = [
    { symbol: 'DJI', name: 'Dow Jones', value: 43275.91 + (Math.random() - 0.5) * 100, change: (Math.random() - 0.5) * 200, changePercent: (Math.random() - 0.5) * 0.5 },
    { symbol: 'SPX', name: 'S&P 500', value: 5930.85 + (Math.random() - 0.5) * 20, change: (Math.random() - 0.5) * 30, changePercent: (Math.random() - 0.5) * 0.4 },
    { symbol: 'IXIC', name: 'NASDAQ', value: 19372.77 + (Math.random() - 0.5) * 50, change: (Math.random() - 0.5) * 80, changePercent: (Math.random() - 0.5) * 0.6 },
    { symbol: 'FTSE', name: 'FTSE 100', value: 8195.20 + (Math.random() - 0.5) * 30, change: (Math.random() - 0.5) * 40, changePercent: (Math.random() - 0.5) * 0.3 },
    { symbol: 'BRVM', name: 'BRVM Composite', value: 235.80 + (Math.random() - 0.5) * 5, change: (Math.random() - 0.5) * 3, changePercent: (Math.random() - 0.5) * 1.2 },
  ];

  const mockStocks: StockQuote[] = [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 248.13 + (Math.random() - 0.5) * 5, change: (Math.random() - 0.5) * 8, changePercent: (Math.random() - 0.5) * 3, high: 250.80, low: 245.20, volume: 45678900, previousClose: 247.50, open: 247.80, latestTradingDay: new Date().toISOString().split('T')[0] },
    { symbol: 'MSFT', name: 'Microsoft Corp.', price: 438.11 + (Math.random() - 0.5) * 8, change: (Math.random() - 0.5) * 10, changePercent: (Math.random() - 0.5) * 2.5, high: 442.30, low: 435.10, volume: 23456780, previousClose: 436.80, open: 437.20, latestTradingDay: new Date().toISOString().split('T')[0] },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 193.95 + (Math.random() - 0.5) * 4, change: (Math.random() - 0.5) * 6, changePercent: (Math.random() - 0.5) * 3, high: 196.50, low: 191.80, volume: 18765430, previousClose: 192.30, open: 193.10, latestTradingDay: new Date().toISOString().split('T')[0] },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 227.03 + (Math.random() - 0.5) * 5, change: (Math.random() - 0.5) * 7, changePercent: (Math.random() - 0.5) * 3, high: 230.20, low: 224.50, volume: 34567890, previousClose: 225.80, open: 226.40, latestTradingDay: new Date().toISOString().split('T')[0] },
    { symbol: 'META', name: 'Meta Platforms', price: 617.12 + (Math.random() - 0.5) * 12, change: (Math.random() - 0.5) * 15, changePercent: (Math.random() - 0.5) * 2.5, high: 625.80, low: 610.30, volume: 12345670, previousClose: 612.50, open: 614.20, latestTradingDay: new Date().toISOString().split('T')[0] },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 134.25 + (Math.random() - 0.5) * 6, change: (Math.random() - 0.5) * 10, changePercent: (Math.random() - 0.5) * 6, high: 138.90, low: 131.20, volume: 56789010, previousClose: 132.80, open: 133.50, latestTradingDay: new Date().toISOString().split('T')[0] },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 436.23 + (Math.random() - 0.5) * 15, change: (Math.random() - 0.5) * 20, changePercent: (Math.random() - 0.5) * 5, high: 448.50, low: 425.80, volume: 78901230, previousClose: 430.10, open: 432.50, latestTradingDay: new Date().toISOString().split('T')[0] },
    { symbol: 'JPM', name: 'JPMorgan Chase', price: 242.32 + (Math.random() - 0.5) * 4, change: (Math.random() - 0.5) * 5, changePercent: (Math.random() - 0.5) * 2, high: 245.10, low: 240.20, volume: 9876540, previousClose: 241.50, open: 241.80, latestTradingDay: new Date().toISOString().split('T')[0] },
  ];

  return { indices: mockIndices, stocks: mockStocks };
}

const XAF_USD_RATE = 610;

export function registerStockMarketRoutes(app: Express): void {
  
  app.get('/api/bourse/market-overview', requireAuth, async (req, res) => {
    try {
      const { indices, stocks } = generateMockMarketData();
      
      res.json({
        success: true,
        data: {
          indices,
          topGainers: stocks.filter(s => s.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
          topLosers: stocks.filter(s => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
          mostActive: stocks.sort((a, b) => b.volume - a.volume).slice(0, 5),
          lastUpdate: new Date().toISOString(),
          marketStatus: isMarketOpen() ? 'open' : 'closed',
          xafUsdRate: XAF_USD_RATE,
        }
      });
    } catch (error: any) {
      console.error('[Stock API] Market overview error:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la récupération des données de marché' });
    }
  });

  app.get('/api/bourse/quote/:symbol', requireAuth, async (req, res) => {
    try {
      const { symbol } = req.params;
      const quote = await getStockQuote(symbol.toUpperCase());
      
      if (quote) {
        res.json({
          success: true,
          data: {
            ...quote,
            priceXAF: Math.round(quote.price * XAF_USD_RATE),
          }
        });
      } else {
        const { stocks } = generateMockMarketData();
        const mockStock = stocks.find(s => s.symbol === symbol.toUpperCase());
        if (mockStock) {
          res.json({
            success: true,
            data: {
              ...mockStock,
              priceXAF: Math.round(mockStock.price * XAF_USD_RATE),
            },
            source: 'mock'
          });
        } else {
          res.status(404).json({ success: false, error: 'Action non trouvée' });
        }
      }
    } catch (error: any) {
      console.error('[Stock API] Quote error:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la récupération du cours' });
    }
  });

  app.get('/api/bourse/search', requireAuth, async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ success: false, error: 'Terme de recherche requis' });
      }
      
      const results = await searchStocks(q);
      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error('[Stock API] Search error:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la recherche' });
    }
  });

  app.get('/api/bourse/intraday/:symbol', requireAuth, async (req, res) => {
    try {
      const { symbol } = req.params;
      const { interval = '5min' } = req.query;
      
      const data = await getIntradayData(symbol.toUpperCase(), interval as string);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('[Stock API] Intraday error:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la récupération des données intraday' });
    }
  });

  app.get('/api/bourse/popular-stocks', requireAuth, async (req, res) => {
    try {
      const { stocks } = generateMockMarketData();
      res.json({
        success: true,
        data: stocks.map(s => ({
          ...s,
          priceXAF: Math.round(s.price * XAF_USD_RATE),
        }))
      });
    } catch (error: any) {
      console.error('[Stock API] Popular stocks error:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la récupération des actions populaires' });
    }
  });

  console.log('[Bourse] Routes du marché boursier enregistrées');
}

function isMarketOpen(): boolean {
  const now = new Date();
  const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = nyTime.getDay();
  const hour = nyTime.getHours();
  const minute = nyTime.getMinutes();
  
  if (day === 0 || day === 6) return false;
  
  const currentMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}
