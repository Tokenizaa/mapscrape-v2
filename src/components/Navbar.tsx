import React from 'react';
import { Search, Table2, FileDown, History, MapPin } from 'lucide-react';

export type ScreenTab = 'search' | 'results' | 'export' | 'history';

interface NavbarProps {
  currentTab: ScreenTab;
  onTabChange: (tab: ScreenTab) => void;
  totalPlaces: number;
  selectedCount: number;
  isScrapingActive: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  totalPlaces,
  selectedCount,
  isScrapingActive,
}) => {
  const tabs = [
    {
      id: 'search' as ScreenTab,
      label: '1. Pesquisar',
      icon: Search,
      badge: isScrapingActive ? 'Ativo' : undefined,
      badgeColor: 'bg-emerald-500 text-white animate-pulse',
    },
    {
      id: 'results' as ScreenTab,
      label: '2. Resultados',
      icon: Table2,
      badge: totalPlaces > 0 ? String(totalPlaces) : undefined,
      badgeColor: 'bg-zinc-100 text-zinc-700',
    },
    {
      id: 'export' as ScreenTab,
      label: '3. Exportar CSV',
      icon: FileDown,
      badge: selectedCount > 0 ? `${selectedCount} sel.` : undefined,
      badgeColor: 'bg-blue-100 text-blue-700 font-medium',
    },
    {
      id: 'history' as ScreenTab,
      label: '4. Histórico',
      icon: History,
    },
  ];

  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-900 text-lg tracking-tight">MapScrape</span>
                <span className="text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                  Google Maps
                </span>
              </div>
              <p className="text-xs text-zinc-500 hidden sm:block">
                Extração direta de fichas públicas para CSV
              </p>
            </div>
          </div>

          <nav className="flex space-x-1 sm:space-x-2" aria-label="Navegação principal">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors duration-150 ${
                    isActive
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500'}`} />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-zinc-800 text-zinc-200' : tab.badgeColor}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
