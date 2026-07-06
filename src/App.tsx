import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, Calculator, Copy, ChevronLeft, ChevronRight, Check, Play, AlertTriangle, Star, Plus, X, ChevronDown, ChevronUp, GripVertical, Edit2, Search, Menu, Sidebar, EyeOff, Eye, Wand2, Lock, Unlock, Sparkles, Bot, Loader2 } from 'lucide-react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

const formatARS = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
};

type Match = {
  id: string;
  name: string;
  team1?: string;
  team2?: string;
  outcomes: {
    gana: boolean;
    empata: boolean;
    pierde: boolean;
  };
  odds: {
    gana: string;
    empata: string;
    pierde: string;
  };
};

type SavedBet = {
  id: string;
  items: { name: string, outcome: string, outcomeDisplayName?: string }[];
  timestamp: number;
  originalIndex: number;
  payout?: string;
  wager?: string;
  isRealized?: boolean;
};

type Ticket = {
  id: string;
  name: string;
  matches: Match[];
  savedBets: SavedBet[];
  baseWager?: string;
  customWagers?: Record<number, string>;
  lockedWagers?: number[];
};

const getTicketCombinations = (ticket: Ticket) => {
  if (ticket.matches.length === 0) return 0;
  return ticket.matches.reduce((acc, m) => {
    let active = 0;
    if (m.outcomes.gana) active++;
    if (m.outcomes.empata) active++;
    if (m.outcomes.pierde) active++;
    return acc * active;
  }, 1);
};

const getAllComboSignaturesForTicket = (ticket: Ticket): string[] => {
  const numMatches = ticket.matches.length;
  if (numMatches === 0) return [];
  const totalCombos = getTicketCombinations(ticket);
  
  const signatures: string[] = [];
  
  // 1. Añadir firmas de las combinaciones generadas activamente
  if (totalCombos <= 5000) { // safety limit to prevent freezing
    const activeOutcomesPerMatch = ticket.matches.map(m => {
      const active = [];
      if (m.outcomes.gana) active.push('gana');
      if (m.outcomes.empata) active.push('empata');
      if (m.outcomes.pierde) active.push('pierde');
      return { matchName: m.name.trim().toLowerCase(), active };
    });

    for (let i = 0; i < totalCombos; i++) {
      let temp = i;
      const items = [];
      for (let j = 0; j < numMatches; j++) {
        const outcomes = activeOutcomesPerMatch[j].active;
        const numOutcomes = outcomes.length;
        const outcomeIndex = temp % numOutcomes;
        items.push(`${activeOutcomesPerMatch[j].matchName}:${outcomes[outcomeIndex]}`);
        temp = Math.floor(temp / numOutcomes);
      }
      signatures.push(items.sort().join('|'));
    }
  }

  // 2. Añadir firmas de las apuestas guardadas (pueden no estar activas en los checkboxes)
  if (ticket.savedBets && ticket.savedBets.length > 0) {
    for (const bet of ticket.savedBets) {
      if (bet.items && bet.items.length > 0) {
        const betSig = bet.items.map(c => `${c.name.trim().toLowerCase()}:${c.outcome}`).sort().join('|');
        signatures.push(betSig);
      }
    }
  }

  return signatures;
};

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem('apuestas_tickets_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Error loading tickets", e);
      }
    }
    return [{ id: 'default', name: 'Lista 1', matches: [], savedBets: [] }];
  });

  const [activeTicketId, setActiveTicketId] = useState<string>(tickets[0]?.id || 'default');
  
  useEffect(() => {
    localStorage.setItem('apuestas_tickets_v1', JSON.stringify(tickets));
  }, [tickets]);

  const activeTicket = useMemo(() => {
    return tickets.find(t => t.id === activeTicketId) || tickets[0];
  }, [tickets, activeTicketId]);

  const updateActiveTicket = useCallback((updater: (ticket: Ticket) => Ticket) => {
    setTickets(prev => prev.map(t => t.id === activeTicketId ? updater(t) : t));
  }, [activeTicketId]);

  const [bulkInput, setBulkInput] = useState('');
  const [isInputExpanded, setIsInputExpanded] = useState(true);
  const [isDesktop, setIsDesktop] = useState(true);
  
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [copiedPage, setCopiedPage] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [groupRest, setGroupRest] = useState(false); // Can be removed or kept, let's keep it false default
  const [selectedComboIndex, setSelectedComboIndex] = useState<number | null>(null);
  const [hideStarred, setHideStarred] = useState(false);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [realizedSearchQuery, setRealizedSearchQuery] = useState("");
  const [activeMiddleTab, setActiveMiddleTab] = useState<'lista' | 'simulador'>('lista');
  const [simulationFilters, setSimulationFilters] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hidden_columns_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem('hidden_columns_v1', JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);
  const [combosFilterMatch, setCombosFilterMatch] = useState<string>('todos');
  const [combosFilterOutcome, setCombosFilterOutcome] = useState<string>('todos');
  const [combosSortOrder, setCombosSortOrder] = useState<'original' | 'asc' | 'desc' | 'avg' | 'win-asc' | 'win-desc'>('original');
  const [smartDistOpen, setSmartDistOpen] = useState(false);
  const [smartTargetWin, setSmartTargetWin] = useState<string>('');
  const [smartMinWager, setSmartMinWager] = useState<string>('100');
  const [smartError, setSmartError] = useState<string | null>(null);

  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState<string>("");
  
  const ITEMS_PER_PAGE = 50;

  const matches = activeTicket.matches;
  const savedBets = activeTicket.savedBets;
  const pendingBets = savedBets.filter(b => !b.isRealized);
  const realizedBets = savedBets.filter(b => b.isRealized);
  
  const filteredRealizedBets = useMemo(() => {
    if (!realizedSearchQuery.trim()) return realizedBets;
    const query = realizedSearchQuery.trim().toLowerCase();
    return realizedBets.filter(bet => 
      bet.items.some(item => 
        item.name.toLowerCase().includes(query) ||
        (item.outcomeDisplayName && item.outcomeDisplayName.toLowerCase().includes(query)) ||
        item.outcome.toLowerCase().includes(query)
      )
    );
  }, [realizedBets, realizedSearchQuery]);

  const externalComboSignatures = useMemo(() => {
    const sigs = new Map<string, string[]>();
    const activeIndex = tickets.findIndex(t => t.id === activeTicketId);
    if (activeIndex === -1) return sigs;

    for (let i = 0; i < activeIndex; i++) {
      const ticket = tickets[i];
      const ticketSigs = getAllComboSignaturesForTicket(ticket);
      for (const sig of ticketSigs) {
        if (!sigs.has(sig)) {
          sigs.set(sig, []);
        }
        const ticketNames = sigs.get(sig)!;
        if (!ticketNames.includes(ticket.name)) {
          ticketNames.push(ticket.name);
        }
      }
    }
    return sigs;
  }, [tickets, activeTicketId]);

  const allRealizedSignatures = useMemo(() => {
    const sigs = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.savedBets) {
        for (const bet of ticket.savedBets) {
          if (bet.isRealized && bet.items && bet.items.length > 0) {
            const betSig = bet.items.map(c => `${c.name.trim().toLowerCase()}:${c.outcome}`).sort().join('|');
            sigs.add(betSig);
          }
        }
      }
    }
    return sigs;
  }, [tickets]);

  const pendingStats = useMemo(() => {
    let totalCost = 0;
    const potentials: number[] = [];
    
    pendingBets.forEach(bet => {
      const wager = parseFloat(bet.wager || '0');
      const payout = parseFloat(bet.payout || '0');
      
      if (!isNaN(wager) && wager > 0) {
        totalCost += wager;
      }
      
      if (!isNaN(wager) && !isNaN(payout) && wager > 0 && payout > 0) {
        potentials.push(wager * payout);
      }
    });

    return {
      totalCost,
      minWin: potentials.length > 0 ? Math.min(...potentials) : 0,
      maxWin: potentials.length > 0 ? Math.max(...potentials) : 0,
      avgWin: potentials.length > 0 ? potentials.reduce((a, b) => a + b, 0) / potentials.length : 0
    };
  }, [pendingBets]);

  const realizedStats = useMemo(() => {
    let totalInvested = 0;
    const potentials: number[] = [];
    
    realizedBets.forEach(bet => {
      const wager = parseFloat(bet.wager || '0');
      const payout = parseFloat(bet.payout || '0');
      
      if (!isNaN(wager) && wager > 0) {
        totalInvested += wager;
      }
      
      if (!isNaN(wager) && !isNaN(payout) && wager > 0 && payout > 0) {
        potentials.push(wager * payout);
      }
    });

    return {
      totalInvested,
      minWin: potentials.length > 0 ? Math.min(...potentials) : 0,
      maxWin: potentials.length > 0 ? Math.max(...potentials) : 0
    };
  }, [realizedBets]);

  const handleCreateTicket = () => {
    const newId = Date.now().toString();
    setTickets(prev => [...prev, { id: newId, name: `Lista ${prev.length + 1}`, matches: [], savedBets: [] }]);
    setActiveTicketId(newId);
    setBulkInput('');
    setPage(1);
  };

  const handleDuplicateTicketMatches = () => {
    const newId = Date.now().toString();
    setTickets(prev => [...prev, { 
      id: newId, 
      name: `${activeTicket.name} (Copia)`, 
      matches: activeTicket.matches.map(m => ({
        ...m,
        id: `${m.id}_copy_${Date.now()}`
      })), 
      savedBets: [] 
    }]);
    setActiveTicketId(newId);
    setBulkInput('');
    setPage(1);
  };

  const handleDeleteTicket = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tickets.length <= 1) return;
    setTickets(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (activeTicketId === id) setActiveTicketId(filtered[0].id);
      return filtered;
    });
  };

  const handleBulkAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim()) return;
    
    const items = bulkInput.split(';').map(n => n.trim()).filter(Boolean);
    
    updateActiveTicket(ticket => {
      const existingIds = new Set(ticket.matches.map(m => m.id));
      const newMatches = [];
      
      for (const item of items) {
        const teams = item.split(',').map(t => t.trim()).filter(Boolean);
        let name = item;
        let team1 = teams[0];
        let team2 = teams[1];
        
        if (teams.length >= 2) {
          name = `${team1} vs ${team2}`;
        }
        
        const baseId = btoa(encodeURIComponent(name.toLowerCase())).replace(/[^a-zA-Z0-9]/g, '');
        let uniqueId = baseId;
        let counter = 1;
        while (existingIds.has(uniqueId)) {
          uniqueId = `${baseId}_${counter}`;
          counter++;
        }
        existingIds.add(uniqueId);
        
        newMatches.push({
          id: uniqueId,
          name,
          team1,
          team2,
          outcomes: { gana: true, empata: false, pierde: false },
          odds: { gana: '', empata: '', pierde: '' }
        });
      }
      return { ...ticket, matches: [...ticket.matches, ...newMatches] };
    });
    
    setBulkInput('');
    setIsInputExpanded(false);
  };

  const moveTicket = (index: number, direction: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    setTickets(prev => {
      const next = [...prev];
      if (direction === 'left' && index > 0) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      } else if (direction === 'right' && index < next.length - 1) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
      return next;
    });
  };

  const removeMatch = (id: string) => {
    updateActiveTicket(ticket => ({
      ...ticket,
      matches: ticket.matches.filter(m => m.id !== id)
    }));
  };

  const moveMatch = (index: number, direction: 'up' | 'down') => {
    updateActiveTicket(ticket => {
      const nextMatches = [...ticket.matches];
      if (direction === 'up' && index > 0) {
        [nextMatches[index - 1], nextMatches[index]] = [nextMatches[index], nextMatches[index - 1]];
      } else if (direction === 'down' && index < nextMatches.length - 1) {
        [nextMatches[index], nextMatches[index + 1]] = [nextMatches[index + 1], nextMatches[index]];
      }
      return { ...ticket, matches: nextMatches };
    });
  };

  const clearAll = () => {
    updateActiveTicket(ticket => ({ ...ticket, matches: [], savedBets: [] }));
    setShowConfirmClear(false);
    setPage(1);
  };

  const toggleOutcome = (matchId: string, outcome: 'gana' | 'empata' | 'pierde') => {
    updateActiveTicket(ticket => {
      const match = ticket.matches.find(m => m.id === matchId);
      if (!match) return ticket;
      
      const newOutcomes = { ...match.outcomes, [outcome]: !match.outcomes[outcome] };
      const hasAnyActive = Object.values(newOutcomes).some(Boolean);
      
      if (!hasAnyActive) return ticket;

      return {
        ...ticket,
        matches: ticket.matches.map(m => m.id === matchId ? { ...m, outcomes: newOutcomes } : m)
      };
    });
  };

  const updateMatchOdds = (matchId: string, outcome: 'gana' | 'empata' | 'pierde', val: string) => {
    updateActiveTicket(ticket => ({
      ...ticket,
      matches: ticket.matches.map(m => m.id === matchId ? { 
        ...m, 
        odds: m.odds ? { ...m.odds, [outcome]: val } : { gana: '', empata: '', pierde: '', [outcome]: val }
      } : m)
    }));
  };

  const updateCustomWager = (index: number, wager: string) => {
    updateActiveTicket(ticket => {
      const newCustomWagers = { ...ticket.customWagers };
      const newLockedWagers = new Set(ticket.lockedWagers || []);
      if (wager === '' || wager === ticket.baseWager) {
        delete newCustomWagers[index];
        newLockedWagers.delete(index);
      } else {
        newCustomWagers[index] = wager;
        newLockedWagers.add(index);
      }
      return { 
        ...ticket, 
        customWagers: newCustomWagers,
        lockedWagers: Array.from(newLockedWagers)
      };
    });
  };

  const toggleLockedWager = (index: number) => {
    updateActiveTicket(ticket => {
      const newLockedWagers = new Set(ticket.lockedWagers || []);
      if (newLockedWagers.has(index)) {
        newLockedWagers.delete(index);
      } else {
        newLockedWagers.add(index);
      }
      return { ...ticket, lockedWagers: Array.from(newLockedWagers) };
    });
  };

  const totalCombinations = useMemo(() => {
    if (matches.length === 0) return 0;
    return matches.reduce((acc, m) => {
      let active = 0;
      if (m.outcomes.gana) active++;
      if (m.outcomes.empata) active++;
      if (m.outcomes.pierde) active++;
      return acc * active;
    }, 1);
  }, [matches]);

  const currentSimulatedRemaining = useMemo(() => {
    if (matches.length === 0) return 0;
    let total = 1;
    for (const match of matches) {
      let active = 0;
      if (match.outcomes.gana) active++;
      if (match.outcomes.empata) active++;
      if (match.outcomes.pierde) active++;
      
      if (active === 0) return 0;
      
      if (simulationFilters[match.id]) {
         total *= 1;
      } else {
         total *= active;
      }
    }
    return total;
  }, [matches, simulationFilters]);

  const getCombinationAtIndex = useCallback((index: number) => {
    if (index >= totalCombinations || index < 0) return null;
    
    const N = matches.length;
    const bases = matches.map(m => {
      let active = 0;
      if (m.outcomes.gana) active++;
      if (m.outcomes.empata) active++;
      if (m.outcomes.pierde) active++;
      return active;
    });

    let temp = index;
    const d = new Array(N).fill(0);
    for (let i = N - 1; i >= 0; i--) {
      d[i] = temp % bases[i];
      temp = Math.floor(temp / bases[i]);
    }

    const g = new Array(N).fill(0);
    let sumHigher = 0;
    for (let i = 0; i < N; i++) {
      if (sumHigher % 2 === 0) {
        g[i] = d[i];
      } else {
        g[i] = bases[i] - 1 - d[i];
      }
      sumHigher += d[i];
    }

    const combo: { matchId: string, matchName: string, outcome: string, outcomeDisplayName: string, odd: string }[] = [];
    let totalPayout = 1;
    let allOddsPresent = true;
    
    for (let i = 0; i < N; i++) {
      const match = matches[i];
      const activeOutcomes = [];
      if (match.outcomes.gana) activeOutcomes.push('gana');
      if (match.outcomes.empata) activeOutcomes.push('empata');
      if (match.outcomes.pierde) activeOutcomes.push('pierde');
      
      const outcome = activeOutcomes[g[i]];
      
      const outcomeDisplayName = match.team1 && match.team2 
        ? (outcome === 'gana' ? match.team1 : outcome === 'empata' ? 'Empate' : match.team2)
        : outcome;
        
      const odd = match.odds?.[outcome as 'gana' | 'empata' | 'pierde'] || '';
      if (odd) {
        totalPayout *= parseFloat(odd);
      } else {
        allOddsPresent = false;
      }
        
      combo.push({ matchId: match.id, matchName: match.name, outcome, outcomeDisplayName, odd });
    }

    return {
      index,
      combo,
      totalPayout: allOddsPresent ? totalPayout.toFixed(2) : null
    };
  }, [matches, totalCombinations]);

  const getOriginalIndexFromCombo = useCallback((combo: {matchId: string, outcome: string}[]) => {
    const N = matches.length;
    const bases = matches.map(m => {
      let active = 0;
      if (m.outcomes.gana) active++;
      if (m.outcomes.empata) active++;
      if (m.outcomes.pierde) active++;
      return active;
    });

    const g = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const match = matches[i];
      const activeOutcomes = [];
      if (match.outcomes.gana) activeOutcomes.push('gana');
      if (match.outcomes.empata) activeOutcomes.push('empata');
      if (match.outcomes.pierde) activeOutcomes.push('pierde');
      
      const outcomeInCombo = combo[i].outcome;
      g[i] = activeOutcomes.indexOf(outcomeInCombo);
      if (g[i] === -1) return -1;
    }

    const d = new Array(N).fill(0);
    let sumHigher = 0;
    for (let i = 0; i < N; i++) {
      if (sumHigher % 2 === 0) {
        d[i] = g[i];
      } else {
        d[i] = bases[i] - 1 - g[i];
      }
      sumHigher += d[i];
    }

    let index = 0;
    let multiplier = 1;
    for (let i = N - 1; i >= 0; i--) {
      index += d[i] * multiplier;
      multiplier *= bases[i];
    }
    return index;
  }, [matches]);

  const viewMatches = useMemo(() => {
    if (combosFilterMatch === 'todos' || combosFilterOutcome === 'todos') return matches;
    return matches.map(m => 
      m.id === combosFilterMatch 
        ? { ...m, outcomes: { gana: combosFilterOutcome === 'gana', empata: combosFilterOutcome === 'empata', pierde: combosFilterOutcome === 'pierde' } } 
        : m
    );
  }, [matches, combosFilterMatch, combosFilterOutcome]);

  const viewTotalCombinations = useMemo(() => {
    if (viewMatches.length === 0) return 0;
    return viewMatches.reduce((acc, m) => {
      let active = 0;
      if (m.outcomes.gana) active++;
      if (m.outcomes.empata) active++;
      if (m.outcomes.pierde) active++;
      return acc * active;
    }, 1);
  }, [viewMatches]);

  const getViewCombinationAtIndex = useCallback((index: number) => {
    if (index >= viewTotalCombinations || index < 0) return null;
    
    const N = viewMatches.length;
    const bases = viewMatches.map(m => {
      let active = 0;
      if (m.outcomes.gana) active++;
      if (m.outcomes.empata) active++;
      if (m.outcomes.pierde) active++;
      return active;
    });

    let temp = index;
    const d = new Array(N).fill(0);
    for (let i = N - 1; i >= 0; i--) {
      d[i] = temp % bases[i];
      temp = Math.floor(temp / bases[i]);
    }

    const g = new Array(N).fill(0);
    let sumHigher = 0;
    for (let i = 0; i < N; i++) {
      if (sumHigher % 2 === 0) {
        g[i] = d[i];
      } else {
        g[i] = bases[i] - 1 - d[i];
      }
      sumHigher += d[i];
    }

    const combo: { matchId: string, matchName: string, outcome: string, outcomeDisplayName: string, odd: string }[] = [];
    let totalPayout = 1;
    let allOddsPresent = true;
    
    for (let i = 0; i < N; i++) {
      const match = viewMatches[i];
      const activeOutcomes = [];
      if (match.outcomes.gana) activeOutcomes.push('gana');
      if (match.outcomes.empata) activeOutcomes.push('empata');
      if (match.outcomes.pierde) activeOutcomes.push('pierde');
      
      const outcome = activeOutcomes[g[i]];
      
      const outcomeDisplayName = match.team1 && match.team2 
        ? (outcome === 'gana' ? match.team1 : outcome === 'empata' ? 'Empate' : match.team2)
        : outcome;
        
      const odd = match.odds?.[outcome as 'gana' | 'empata' | 'pierde'] || '';
      if (odd) {
        totalPayout *= parseFloat(odd);
      } else {
        allOddsPresent = false;
      }
        
      combo.push({ matchId: match.id, matchName: match.name, outcome, outcomeDisplayName, odd });
    }

    const originalIndex = getOriginalIndexFromCombo(combo);

    return {
      index: originalIndex,
      combo,
      totalPayout: allOddsPresent ? totalPayout.toFixed(2) : null
    };
  }, [viewMatches, viewTotalCombinations, getOriginalIndexFromCombo]);

  const getStarredBetId = useCallback((comboItems: {matchName: string, outcome: string}[]) => {
    for (const bet of savedBets) {
      if (bet.items.length === 0) continue;
      
      const comboMap = new Map<string, string>();
      for (const item of comboItems) {
        comboMap.set(item.matchName.trim().toLowerCase(), item.outcome);
      }
      
      let match = true;
      for (const bItem of bet.items) {
        const key = bItem.name.trim().toLowerCase();
        if (comboMap.get(key) !== bItem.outcome) {
          match = false;
          break;
        }
      }
      
      if (match) return bet.id;
    }
    return null;
  }, [savedBets]);

  const validStarredIndices = useMemo(() => {
    const indicesSet = new Set<number>();
    if (matches.length === 0 || totalCombinations === 0 || savedBets.length === 0) return [];

    const N = matches.length;
    const bases = matches.map(m => {
      let active = 0;
      if (m.outcomes.gana) active++;
      if (m.outcomes.empata) active++;
      if (m.outcomes.pierde) active++;
      return active;
    });

    for (const bet of savedBets) {
      if (bet.items.length === 0) continue;

      const betOutcomesByName = new Map<string, string>();
      for (const item of bet.items) {
        betOutcomesByName.set(item.name.trim().toLowerCase(), item.outcome);
      }
      
      let invalidBet = false;
      const constraints: {fixed: boolean, val: number}[] = new Array(N);
      
      for (let i = 0; i < N; i++) {
        const match = matches[i];
        const requiredOutcome = betOutcomesByName.get(match.name.trim().toLowerCase());
        
        const activeOutcomes = [];
        if (match.outcomes.gana) activeOutcomes.push('gana');
        if (match.outcomes.empata) activeOutcomes.push('empata');
        if (match.outcomes.pierde) activeOutcomes.push('pierde');
        
        if (requiredOutcome) {
          const optionIndex = activeOutcomes.indexOf(requiredOutcome);
          if (optionIndex === -1) { invalidBet = true; break; }
          constraints[i] = { fixed: true, val: optionIndex };
        } else {
          constraints[i] = { fixed: false, val: 0 };
        }
      }
      
      if (invalidBet) continue;
      
      const generateIndices = (matchIdx: number, currentG: number[]) => {
        if (matchIdx === N) {
          const d = new Array(N).fill(0);
          let sumHigher = 0;
          for (let i = 0; i < N; i++) {
            if (sumHigher % 2 === 0) {
              d[i] = currentG[i];
            } else {
              d[i] = bases[i] - 1 - currentG[i];
            }
            sumHigher += d[i];
          }

          let index = 0;
          let multiplier = 1;
          for (let i = N - 1; i >= 0; i--) {
            index += d[i] * multiplier;
            multiplier *= bases[i];
          }
          indicesSet.add(index);
          return;
        }
        
        if (constraints[matchIdx].fixed) {
          currentG[matchIdx] = constraints[matchIdx].val;
          generateIndices(matchIdx + 1, currentG);
        } else {
          for (let v = 0; v < bases[matchIdx]; v++) {
            currentG[matchIdx] = v;
            generateIndices(matchIdx + 1, currentG);
          }
        }
      };
      
      generateIndices(0, new Array(N).fill(0));
    }
    
    return Array.from(indicesSet).sort((a, b) => a - b);
  }, [savedBets, matches, totalCombinations]);

  const validDuplicateIndices = useMemo(() => {
    const indicesSet = new Set<number>();
    if (matches.length === 0 || totalCombinations === 0 || externalComboSignatures.size === 0 || totalCombinations > 5000) return [];

    for (let i = 0; i < totalCombinations; i++) {
      const c = getCombinationAtIndex(i);
      if (c) {
        const comboSignature = c.combo.map(item => `${item.matchName.trim().toLowerCase()}:${item.outcome}`).sort().join('|');
        if (externalComboSignatures.has(comboSignature)) {
          indicesSet.add(i);
        }
      }
    }
    return Array.from(indicesSet).sort((a, b) => a - b);
  }, [matches, totalCombinations, externalComboSignatures, getCombinationAtIndex]);

  const hiddenIndices = useMemo(() => {
    const set = new Set<number>();
    if (hideStarred) {
      for (const i of validStarredIndices) set.add(i);
    }
    if (hideDuplicates) {
      for (const i of validDuplicateIndices) set.add(i);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [hideStarred, validStarredIndices, hideDuplicates, validDuplicateIndices]);

  const generatedStats = useMemo(() => {
    if (matches.length === 0 || totalCombinations === 0) return { totalCost: 0, minWin: null, maxWin: null, avgWin: null };

    const baseWager = parseFloat(activeTicket.baseWager || '100');
    const validBaseWager = isNaN(baseWager) ? 0 : baseWager;

    let allOddsPresent = true;
    const activeOddsList: number[][] = [];

    for (const match of matches) {
      const activeOdds: number[] = [];
      if (match.outcomes.gana) activeOdds.push(parseFloat(match.odds?.gana || ''));
      if (match.outcomes.empata) activeOdds.push(parseFloat(match.odds?.empata || ''));
      if (match.outcomes.pierde) activeOdds.push(parseFloat(match.odds?.pierde || ''));

      if (activeOdds.some(isNaN)) {
        allOddsPresent = false;
        break;
      }
      activeOddsList.push(activeOdds);
    }

    const hiddenSet = new Set(hiddenIndices);

    if (!allOddsPresent) {
      let totalCost = 0;
      for (let i = 0; i < totalCombinations; i++) {
        if (hiddenSet.has(i)) continue;
        const wStr = activeTicket.customWagers?.[i] ?? activeTicket.baseWager ?? '100';
        totalCost += parseFloat(wStr) || 0;
      }
      return { totalCost, minWin: null, maxWin: null, avgWin: null };
    }

    let minWin = Infinity;
    let maxWin = -Infinity;
    let sumWin = 0;
    let totalCost = 0;
    let validCount = 0;

    const N = matches.length;
    const bases = activeOddsList.map(list => list.length);
    
    // Pre-allocate arrays for max performance
    const d = new Int32Array(N);
    const g = new Int32Array(N);

    for (let i = 0; i < totalCombinations; i++) {
      if (hiddenSet.has(i)) continue;

      let temp = i;
      for (let j = N - 1; j >= 0; j--) {
        d[j] = temp % bases[j];
        temp = Math.floor(temp / bases[j]);
      }

      let sumHigher = 0;
      for (let j = 0; j < N; j++) {
        if (sumHigher % 2 === 0) {
          g[j] = d[j];
        } else {
          g[j] = bases[j] - 1 - d[j];
        }
        sumHigher += d[j];
      }

      let totalPayout = 1;
      for (let j = 0; j < N; j++) {
        totalPayout *= activeOddsList[j][g[j]];
      }

      const wStr = activeTicket.customWagers?.[i] ?? activeTicket.baseWager ?? '100';
      const wager = parseFloat(wStr) || 0;
      totalCost += wager;

      const win = totalPayout * wager;
      if (win < minWin) {
        minWin = win;
      }
      if (win > maxWin) {
        maxWin = win;
      }
      sumWin += win;
      validCount++;
    }

    return { 
      totalCost, 
      minWin: minWin === Infinity ? null : minWin, 
      maxWin: maxWin === -Infinity ? null : maxWin, 
      avgWin: validCount > 0 ? sumWin / validCount : null
    };
  }, [matches, totalCombinations, activeTicket.baseWager, activeTicket.customWagers, hiddenIndices]);


  const { currentCombinations, totalVisible, totalPages } = useMemo(() => {
    if (viewTotalCombinations === 0) return { currentCombinations: [], totalVisible: 0, totalPages: 1 };
    
    let visibleTotal = viewTotalCombinations;
    const isFiltered = combosFilterMatch !== 'todos' && combosFilterOutcome !== 'todos';
    
    // Count how many hidden indices are in the view (this is fast if hiddenIndices is small)
    const hiddenInView = hiddenIndices.filter(idx => {
       const combo = getCombinationAtIndex(idx);
       if (!combo) return false;
       if (!isFiltered) return true;
       const matchItem = combo.combo.find(x => x.matchId === combosFilterMatch);
       return matchItem && matchItem.outcome === combosFilterOutcome;
    });
    visibleTotal -= hiddenInView.length;

    const computedTotalPages = Math.max(1, Math.ceil(visibleTotal / ITEMS_PER_PAGE));
    const safePage = Math.min(page, computedTotalPages);
    const targetStart = (safePage - 1) * ITEMS_PER_PAGE;
    
    const combos = [];
    const hiddenSet = new Set(hiddenIndices);

    if (combosSortOrder === 'original') {
      let found = 0;
      let viewIndex = 0;
      
      // Skip targetStart valid items
      while (found < targetStart && viewIndex < viewTotalCombinations) {
        const combo = getViewCombinationAtIndex(viewIndex);
        if (combo && !hiddenSet.has(combo.index)) {
          found++;
        }
        viewIndex++;
      }
      
      // Collect ITEMS_PER_PAGE items
      let collected = 0;
      while (collected < ITEMS_PER_PAGE && viewIndex < viewTotalCombinations) {
        const combo = getViewCombinationAtIndex(viewIndex);
        if (combo && !hiddenSet.has(combo.index)) {
          combos.push(combo);
          collected++;
        }
        viewIndex++;
      }
    } else {
      // Sort all combinations
      const allCombos = [];
      for (let i = 0; i < viewTotalCombinations; i++) {
        const combo = getViewCombinationAtIndex(i);
        if (combo && !hiddenSet.has(combo.index)) {
          allCombos.push(combo);
        }
      }
      allCombos.sort((a, b) => {
        const pA = a.totalPayout ? parseFloat(a.totalPayout) : 0;
        const pB = b.totalPayout ? parseFloat(b.totalPayout) : 0;
        const wA = parseFloat(activeTicket.customWagers?.[a.index] ?? activeTicket.baseWager ?? '100') || 0;
        const wB = parseFloat(activeTicket.customWagers?.[b.index] ?? activeTicket.baseWager ?? '100') || 0;
        const winA = pA * wA;
        const winB = pB * wB;

        if (combosSortOrder === 'asc') return pA - pB;
        if (combosSortOrder === 'desc') return pB - pA;
        if (combosSortOrder === 'win-asc') return winA - winB;
        if (combosSortOrder === 'win-desc') return winB - winA;
        if (combosSortOrder === 'avg') {
          const avg = generatedStats?.avgWin || 0;
          return Math.abs(winA - avg) - Math.abs(winB - avg);
        }
        return 0;
      });
      
      for (let i = targetStart; i < Math.min(targetStart + ITEMS_PER_PAGE, allCombos.length); i++) {
        combos.push(allCombos[i]);
      }
    }
    
    return { currentCombinations: combos, totalVisible: visibleTotal, totalPages: computedTotalPages };
  }, [page, viewTotalCombinations, hiddenIndices, getCombinationAtIndex, getViewCombinationAtIndex, combosFilterMatch, combosFilterOutcome, combosSortOrder, activeTicket.customWagers, activeTicket.baseWager, generatedStats]);

  const getItemDisplayText = (matchName: string, outcome: string, outcomeDisplayName?: string) => {
    if (outcomeDisplayName && outcomeDisplayName !== outcome) {
      if (outcome === 'empata') return `Empate (${matchName})`;
      return outcomeDisplayName;
    }
    return `${matchName}(${outcome})`;
  };

  const formatCombinationText = (c: NonNullable<ReturnType<typeof getCombinationAtIndex>>) => {
    const formattedItems = c.combo.map(item => getItemDisplayText(item.matchName, item.outcome, item.outcomeDisplayName));
    
    let extra = '';
    if (c.totalPayout) {
      const wagerStr = activeTicket.customWagers?.[c.index] !== undefined ? activeTicket.customWagers[c.index] : (activeTicket.baseWager || '100');
      const wagerVal = parseFloat(wagerStr);
      const payoutVal = parseFloat(c.totalPayout);
      if (!isNaN(wagerVal) && !isNaN(payoutVal)) {
        const win = wagerVal * payoutVal;
        extra = ` => Apuesta: $${wagerVal.toFixed(2)} | Cuota: ${payoutVal.toFixed(2)} | Ganancia: $${win.toFixed(2)}`;
      }
    }

    return formattedItems.join(' | ') + extra;
  };

  const copyPage = () => {
    const text = currentCombinations.map(c => formatCombinationText(c)).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedPage(true);
      setTimeout(() => setCopiedPage(false), 2000);
    });
  };

  const MAX_COPY_LIMIT = 50000;
  const copyAll = () => {
    if (totalVisible > MAX_COPY_LIMIT) {
      alert(`Demasiadas combinaciones para copiar de una vez (Máximo ${MAX_COPY_LIMIT.toLocaleString()}). Copia por páginas.`);
      return;
    }
    const hiddenSet = new Set(hiddenIndices);
    const allCombos = [];
    
    let found = 0;
    let viewIndex = 0;
    while (found < totalVisible && viewIndex < viewTotalCombinations) {
      const c = getViewCombinationAtIndex(viewIndex);
      if (c && !hiddenSet.has(c.index)) {
        allCombos.push(c);
        found++;
      }
      viewIndex++;
    }

    if (combosSortOrder !== 'original') {
      allCombos.sort((a, b) => {
        const pA = a.totalPayout ? parseFloat(a.totalPayout) : 0;
        const pB = b.totalPayout ? parseFloat(b.totalPayout) : 0;
        const wA = parseFloat(activeTicket.customWagers?.[a.index] ?? activeTicket.baseWager ?? '100') || 0;
        const wB = parseFloat(activeTicket.customWagers?.[b.index] ?? activeTicket.baseWager ?? '100') || 0;
        const winA = pA * wA;
        const winB = pB * wB;

        if (combosSortOrder === 'asc') return pA - pB;
        if (combosSortOrder === 'desc') return pB - pA;
        if (combosSortOrder === 'win-asc') return winA - winB;
        if (combosSortOrder === 'win-desc') return winB - winA;
        if (combosSortOrder === 'avg') {
          const avg = generatedStats?.avgWin || 0;
          return Math.abs(winA - avg) - Math.abs(winB - avg);
        }
        return 0;
      });
    }

    const allText = allCombos.map(c => formatCombinationText(c));
    
    navigator.clipboard.writeText(allText.join('\n')).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  };

  const handleSmartDistribution = () => {
    setSmartError(null);
    const targetWin = parseFloat(smartTargetWin);
    const minWager = parseFloat(smartMinWager) || 0;
    
    if (isNaN(targetWin) || targetWin <= 0) {
        setSmartError("Debes ingresar una Ganancia Objetivo mayor a 0.");
        return;
    }

    const hiddenSet = new Set(hiddenIndices);
    const validCombos: { index: number, multiplier: number, wager: number }[] = [];
    
    for (let i = 0; i < totalCombinations; i++) {
      if (hiddenSet.has(i)) continue;
      const combo = getCombinationAtIndex(i);
      if (!combo || !combo.totalPayout) continue;
      validCombos.push({ index: i, multiplier: parseFloat(combo.totalPayout), wager: 0 });
    }

    if (validCombos.length === 0) {
      setSmartError("No hay combinaciones válidas para distribuir (están todas ocultas).");
      return;
    }

    // Ordenar de menor a mayor cuota (favoritos primero)
    validCombos.sort((a, b) => a.multiplier - b.multiplier);

    const getWagerForCombo = (multiplier: number, target: number, minW: number) => {
      let w = Math.max(minW, target / multiplier);
      // Opcional: redondear a 2 decimales para evitar números raros
      return Math.ceil(w * 100) / 100;
    };

    for (const c of validCombos) {
      c.wager = getWagerForCombo(c.multiplier, targetWin, minWager);
    }

    updateActiveTicket(ticket => {
      const newCustomWagers = { ...(ticket.customWagers || {}) };
      for (const c of validCombos) {
        newCustomWagers[c.index] = c.wager.toFixed(2);
      }
      return { 
        ...ticket, 
        customWagers: newCustomWagers,
        lockedWagers: [] 
      };
    });
    
    setSmartDistOpen(false);
  };

  const handleResetSmartDistribution = () => {
    updateActiveTicket(ticket => ({
      ...ticket,
      customWagers: {},
      lockedWagers: []
    }));
    setSmartError(null);
  };

  const handleGetAiAdvice = async () => {
    setIsAiLoading(true);
    setAiAdvice(null);
    try {
      const activeCombos = Array.from({ length: totalCombinations })
        .map((_, i) => getCombinationAtIndex(i))
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .filter(c => !hiddenIndices.includes(c.index));

      const comboData = activeCombos.map(c => {
        const mult = c.totalPayout ? parseFloat(c.totalPayout) : 0;
        const wager = parseFloat(activeTicket.customWagers?.[c.index] ?? activeTicket.baseWager ?? '100');
        return {
          index: c.index,
          multiplier: mult,
          wager: wager,
          profit: wager * mult
        };
      });

      const prompt = `Soy un apostador y estoy armando una combinada. 
Mi ganancia objetivo es ${smartTargetWin || 'N/A'}.
Tengo ${activeCombos.length} combinaciones posibles activas.
Aquí está la lista de mis combinaciones (índice, cuota y apuesta actual):
${JSON.stringify(comboData.map(c => ({ i: c.index, m: c.multiplier, w: c.wager })))}

${aiCustomPrompt.trim() ? `Instrucciones adicionales del usuario:\n"${aiCustomPrompt.trim()}"\n` : ''}
Por favor, analizá mi distribución. Si podés mejorarla (por ejemplo, para asegurar ganancias, o para enfocar más a los favoritos manteniendo una ganancia similar), calculá una nueva distribución de apuestas. Tené muy en cuenta las instrucciones adicionales si las hay.
Devolvé tu respuesta en formato JSON con la siguiente estructura:
- "advice": Un consejo breve y amigable (máximo 2 párrafos) sobre por qué elegiste esta nueva distribución. No me des consejos genéricos, enfocate en la matemática.
- "newWagers": Un arreglo de objetos con "index" y "wager", donde "wager" es tu nueva sugerencia de apuesta para ese índice. Es importante que devuelvas una sugerencia para TODOS los índices que te pasé.`;

      const response = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setAiAdvice(data.advice);
      
      if (data.newWagers && Array.isArray(data.newWagers)) {
        const newCustomWagers = { ...(activeTicket.customWagers || {}) };
        data.newWagers.forEach((w: any) => {
          if (w && typeof w.index === 'number' && typeof w.wager === 'number') {
            newCustomWagers[w.index] = w.wager.toString();
          }
        });
        updateActiveTicket(ticket => ({ ...ticket, customWagers: newCustomWagers }));
      }
    } catch (err: any) {
      setAiAdvice(err.message || "Uy, hubo un error al consultar a la IA. Intentá de nuevo en un rato.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const toggleStar = (comboData: NonNullable<ReturnType<typeof getCombinationAtIndex>>, e: React.MouseEvent) => {
    e.stopPropagation();
    
    updateActiveTicket(ticket => {
      const existingId = getStarredBetId(comboData.combo);
      if (existingId) {
        return {
          ...ticket,
          savedBets: ticket.savedBets.filter(b => b.id !== existingId)
        };
      } else {
        const newBetId = Date.now().toString();
        return {
          ...ticket,
          savedBets: [...ticket.savedBets, {
            id: newBetId,
            items: comboData.combo.map(c => ({
              name: c.matchName,
              outcome: c.outcome,
              outcomeDisplayName: c.outcomeDisplayName
            })),
            timestamp: Date.now(),
            originalIndex: comboData.index,
            payout: comboData.totalPayout || undefined,
            wager: ticket.baseWager || '100'
          }]
        };
      }
    });
  };

  const deleteSavedBet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateActiveTicket(ticket => ({
      ...ticket,
      savedBets: ticket.savedBets.filter(b => b.id !== id)
    }));
  };

  const updateSavedBetPayout = (id: string, payout: string) => {
    updateActiveTicket(ticket => ({
      ...ticket,
      savedBets: ticket.savedBets.map(b => b.id === id ? { ...b, payout } : b)
    }));
  };

  const updateSavedBetWager = (id: string, wager: string) => {
    updateActiveTicket(ticket => ({
      ...ticket,
      savedBets: ticket.savedBets.map(b => b.id === id ? { ...b, wager } : b)
    }));
  };

  const toggleSavedBetRealized = (id: string) => {
    updateActiveTicket(ticket => ({
      ...ticket,
      savedBets: ticket.savedBets.map(b => b.id === id ? { ...b, isRealized: !b.isRealized } : b)
    }));
  };

  const getOutcomeDisplayName = (match: Match, outcome: 'gana' | 'empata' | 'pierde') => {
    if (match.team1 && match.team2) {
      if (outcome === 'gana') return match.team1;
      if (outcome === 'empata') return 'Empate';
      if (outcome === 'pierde') return match.team2;
    }
    return outcome.charAt(0).toUpperCase() + outcome.slice(1);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex h-screen overflow-hidden">
      {isSidebarOpen && (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 h-full overflow-hidden transition-all duration-300">
          <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
            <h1 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span className="bg-emerald-500/10 text-emerald-400 p-1 rounded-lg border border-emerald-500/20">
                <Play size={16} className="fill-emerald-400" />
              </span>
              Listas
            </h1>
            <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-slate-200 sm:hidden">
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 scrollbar-thin">
            {tickets.map((ticket, index) => (
              <div
                key={ticket.id}
                onClick={() => {
                  setActiveTicketId(ticket.id);
                  setPage(1);
                  setBulkInput('');
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors border cursor-pointer ${activeTicketId === ticket.id ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'}`}
              >
                {editingTicketId === ticket.id ? (
                  <input
                    value={ticket.name}
                    autoFocus
                    onBlur={() => setEditingTicketId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        setEditingTicketId(null);
                      }
                    }}
                    onChange={(e) => {
                      setTickets(tickets.map(t => t.id === ticket.id ? { ...t, name: e.target.value } : t));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent border-none focus:outline-none placeholder-slate-600 outline-none"
                    placeholder="Nombre de lista"
                  />
                ) : (
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{ticket.name}</span>
                    {getTicketCombinations(ticket) > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono shrink-0 ${activeTicketId === ticket.id ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                        {getTicketCombinations(ticket)}
                      </span>
                    )}
                  </div>
                )}
                
                <div className="flex items-center gap-1 shrink-0">
                  {activeTicketId === ticket.id && !editingTicketId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTicketId(ticket.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-emerald-400 transition-opacity"
                      title="Editar nombre"
                    >
                      <Edit2 size={12} />
                    </button>
                  )}
                  {tickets.length > 1 && (
                    <X 
                      size={14} 
                      className="opacity-50 hover:opacity-100 hover:text-red-400 transition-colors cursor-pointer"
                      onClick={(e) => handleDeleteTicket(ticket.id, e)}
                    />
                  )}
                </div>
              </div>
            ))}
            
            <div className="mt-2 flex flex-col gap-2">
              <button 
                onClick={handleCreateTicket}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-slate-800 border-dashed text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
              >
                <Plus size={16} /> Nueva Lista
              </button>
              <button 
                onClick={handleDuplicateTicketMatches}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-slate-800 border-dashed text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
                title="Copia los partidos de la lista actual en una nueva lista"
              >
                <Copy size={16} /> Duplicar partidos
              </button>
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <header className="bg-slate-900 border-b border-slate-800 shadow-sm shrink-0 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-800 rounded-md"
            >
              <Sidebar size={20} />
            </button>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              {!isSidebarOpen && (
                <span className="bg-emerald-500/10 text-emerald-400 p-1.5 rounded-lg border border-emerald-500/20 mr-1 hidden sm:flex">
                  <Play size={16} className="fill-emerald-400" />
                </span>
              )}
              Generador de Apuestas
            </h1>
          </div>
          {hiddenColumns.length > 0 && (
            <div className="flex items-center gap-2 ml-10 overflow-x-auto scrollbar-thin pb-1">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider shrink-0">Columnas ocultas:</span>
              {hiddenColumns.includes('matches') && (
                <button onClick={() => setHiddenColumns(hiddenColumns.filter(c => c !== 'matches'))} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-700 transition-colors shrink-0">
                  <Eye size={14} className="text-emerald-400" /> Partidos
                </button>
              )}
              {hiddenColumns.includes('combinations') && (
                <button onClick={() => setHiddenColumns(hiddenColumns.filter(c => c !== 'combinations'))} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-700 transition-colors shrink-0">
                  <Eye size={14} className="text-emerald-400" /> Combinaciones
                </button>
              )}
              {hiddenColumns.includes('savedBets') && (
                <button onClick={() => setHiddenColumns(hiddenColumns.filter(c => c !== 'savedBets'))} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-700 transition-colors shrink-0">
                  <Eye size={14} className="text-emerald-400" /> Apuestas Guardadas
                </button>
              )}
              {hiddenColumns.includes('realizedBets') && (
                <button onClick={() => setHiddenColumns(hiddenColumns.filter(c => c !== 'realizedBets'))} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-700 transition-colors shrink-0">
                  <Eye size={14} className="text-emerald-400" /> Apuestas Realizadas
                </button>
              )}
            </div>
          )}
        </header>

        <main className="flex-1 w-full px-2 sm:px-4 py-3 min-h-0">
          <PanelGroup direction={isDesktop ? "horizontal" : "vertical"} className="gap-3 h-full min-h-0">
          
          {/* Left Column: Input and Matches */}
          {!hiddenColumns.includes('matches') && (
          <>
          <Panel defaultSize={isDesktop ? 30 : undefined} minSize={20} className="flex flex-col gap-4 h-full min-h-0">
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <button 
                  type="button" 
                  onClick={() => setIsInputExpanded(!isInputExpanded)}
                  className="flex-1 flex items-center justify-between text-left group pr-4"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200 mb-1 group-hover:text-emerald-400 transition-colors">1. Cargar Equipos</h2>
                    <p className="text-xs text-slate-400">Pega la lista de equipos separados por coma.</p>
                  </div>
                  <ChevronDown size={20} className={`text-slate-500 transition-transform duration-200 ${isInputExpanded ? 'rotate-180' : ''}`} />
                </button>
                <button
                  onClick={() => setHiddenColumns([...hiddenColumns, 'matches'])}
                  className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                  title="Ocultar columna"
                >
                  <EyeOff size={16} />
                </button>
              </div>
              
              {isInputExpanded && (
                <form onSubmit={handleBulkAdd} className="flex flex-col gap-3 pt-4 border-t border-slate-800">
                  <textarea
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder="Ej: Bosnia, Suiza, Marruecos, Brasil, México..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600 resize-none h-24 scrollbar-thin"
                  />
                  <button 
                    type="submit"
                    disabled={!bulkInput.trim()}
                    className="bg-emerald-500 text-slate-950 px-4 py-2.5 rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold flex justify-center items-center gap-2"
                  >
                    <Play size={16} fill="currentColor" /> Agregar Equipos
                  </button>
                </form>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4 min-h-0 scrollbar-thin">
              {matches.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-8 text-center flex flex-col items-center justify-center h-full">
                  <AlertTriangle className="text-slate-600 mb-3" size={32} />
                  <p className="text-slate-400 text-sm">No hay equipos cargados.</p>
                  <p className="text-slate-500 text-xs mt-1">Carga una lista arriba para empezar.</p>
                </div>
              ) : (
                matches.map((match, index) => (
                  <div key={match.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2 truncate">
                        <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-mono">{index + 1}</span>
                        {match.name}
                      </h3>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveMatch(index, 'up')}
                          disabled={index === 0}
                          className="text-slate-500 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-slate-500 p-1.5 rounded-lg transition-colors shrink-0"
                          title="Mover arriba"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={() => moveMatch(index, 'down')}
                          disabled={index === matches.length - 1}
                          className="text-slate-500 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-slate-500 p-1.5 rounded-lg transition-colors shrink-0"
                          title="Mover abajo"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button 
                          onClick={() => removeMatch(match.id)}
                          className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors shrink-0"
                          title="Eliminar partido"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {(['gana', 'empata', 'pierde'] as const).map(outcome => {
                        const isActive = match.outcomes[outcome];
                        return (
                          <div key={outcome} className="flex-1 flex flex-col gap-1.5">
                            <button
                              onClick={() => toggleOutcome(match.id, outcome)}
                              className={`w-full py-1.5 px-2 rounded text-xs font-mono font-medium transition-colors border truncate ${isActive ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}
                              title={getOutcomeDisplayName(match, outcome)}
                            >
                              {getOutcomeDisplayName(match, outcome)}
                            </button>
                            <div className="flex items-center gap-1 bg-slate-950 rounded border border-slate-800 px-1.5 py-1">
                              <span className="text-[10px] text-slate-500">Cuota:</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="1.00"
                                value={match.odds?.[outcome] || ''}
                                onChange={(e) => updateMatchOdds(match.id, outcome, e.target.value)}
                                className="w-full bg-transparent text-xs text-slate-300 focus:outline-none text-right font-mono"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {matches.length > 0 && (
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-xl shrink-0">
                {showConfirmClear ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">¿Borrar todo?</span>
                    <button 
                      onClick={clearAll}
                      className="text-sm bg-red-500/20 text-red-400 px-3 py-1 rounded hover:bg-red-500/30 transition-colors font-semibold"
                    >
                      Sí, borrar
                    </button>
                    <button 
                      onClick={() => setShowConfirmClear(false)}
                      className="text-sm text-slate-400 hover:text-slate-300 px-2 py-1"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowConfirmClear(true)}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors font-medium flex items-center gap-1.5"
                  >
                    <Trash2 size={16} /> Vaciar Lista
                  </button>
                )}
              </div>
            )}
          </Panel>
          </>
          )}

          {isDesktop && !hiddenColumns.includes('matches') && (!hiddenColumns.includes('combinations') || !hiddenColumns.includes('savedBets') || !hiddenColumns.includes('realizedBets')) && <PanelResizeHandle className="w-1.5 mx-0.5 rounded-full bg-slate-800/50 hover:bg-emerald-500/50 transition-colors shrink-0 cursor-col-resize hidden lg:block" />}

          {/* Middle Column: Generated Combinations */}
          {!hiddenColumns.includes('combinations') && (
          <>
          <Panel defaultSize={isDesktop ? 45 : undefined} minSize={25} className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-full min-h-0 overflow-hidden shadow-xl shadow-black/20">
            {matches.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-3 p-8 text-center relative">
                <button
                  onClick={() => setHiddenColumns([...hiddenColumns, 'combinations'])}
                  className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                  title="Ocultar columna"
                >
                  <EyeOff size={16} />
                </button>
                <Play size={48} className="text-slate-800" />
                <p>Agrega equipos y selecciona los resultados a cubrir para ver las combinaciones aquí.</p>
              </div>
            ) : (
              <>
                <div className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800 shrink-0 bg-slate-900/80 backdrop-blur">
                  <div>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800">
                        <button
                          onClick={() => setActiveMiddleTab('lista')}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeMiddleTab === 'lista' ? 'bg-slate-800 text-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          Lista
                        </button>
                        <button
                          onClick={() => setActiveMiddleTab('simulador')}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeMiddleTab === 'simulador' ? 'bg-slate-800 text-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          Simulador
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-[10px] font-mono border border-emerald-500/20">
                          <span>Apuesta base: $</span>
                          <input
                            type="number"
                            value={activeTicket.baseWager !== undefined ? activeTicket.baseWager : '100'}
                            onChange={(e) => updateActiveTicket(t => ({ ...t, baseWager: e.target.value }))}
                            className="bg-transparent w-12 focus:outline-none placeholder-emerald-400/50"
                            placeholder="100"
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('¿Poner todas las apuestas a $0 para calcular inversión manual?')) {
                               updateActiveTicket(t => ({ ...t, baseWager: '0', customWagers: {}, lockedWagers: [] }));
                            }
                          }}
                          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] border border-slate-700 transition-colors"
                          title="Modo Calculadora: empezar todo en 0 y sumar manualmente"
                        >
                          <Calculator className="w-3 h-3" />
                          A $0
                        </button>
                      </div>
                    </div>
                    {activeMiddleTab === 'lista' && (
                    <>
                      <p className="text-xs text-slate-400">
                        Mostrando <span className="text-emerald-400 font-mono text-sm">{totalVisible.toLocaleString()}</span> variaciones {hiddenIndices.length > 0 ? `(${hiddenIndices.length} ocultas)` : ''}.
                      </p>
                      {generatedStats && generatedStats.totalCost > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                          <span className="text-slate-400">Costo total: <span className="text-slate-200 font-mono">{formatARS(generatedStats.totalCost)}</span></span>
                          {generatedStats.minWin !== null && (
                            <>
                              <button onClick={() => { setCombosSortOrder('win-asc'); setPage(1); }} className="text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer group">Min: <span className="text-emerald-400 group-hover:text-emerald-300 font-mono">{formatARS(generatedStats.minWin)}</span></button>
                              <button onClick={() => { setCombosSortOrder('avg'); setPage(1); }} className="text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer group" title="Ganancia teórica promedio">Med: <span className="text-emerald-400 group-hover:text-emerald-300 font-mono">{formatARS(generatedStats.avgWin!)}</span></button>
                              <button onClick={() => { setCombosSortOrder('win-desc'); setPage(1); }} className="text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer group">Max: <span className="text-emerald-400 group-hover:text-emerald-300 font-mono">{formatARS(generatedStats.maxWin!)}</span></button>
                            </>
                          )}
                        </div>
                      )}
                      {generatedStats && generatedStats.totalCost > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-800">
                          <button 
                            onClick={() => setSmartDistOpen(!smartDistOpen)}
                            className="flex items-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors mb-2"
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            Distribución Inteligente de Inversión
                            {smartDistOpen ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                          </button>
                          
                          {smartDistOpen && (
                            <div className="p-3 bg-slate-900 rounded-md border border-slate-700/50 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-400 uppercase font-semibold">Ganancia Objetivo</label>
                                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1">
                                    <span className="text-slate-500 text-xs">$</span>
                                    <input 
                                      type="number" 
                                      value={smartTargetWin}
                                      onChange={(e) => setSmartTargetWin(e.target.value)}
                                      placeholder="Ej: 100000"
                                      className="bg-transparent text-slate-200 text-xs w-full focus:outline-none placeholder-emerald-700/50"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-400 uppercase font-semibold">Apuesta Mínima</label>
                                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1">
                                    <span className="text-slate-500 text-xs">$</span>
                                    <input 
                                      type="number" 
                                      value={smartMinWager}
                                      onChange={(e) => setSmartMinWager(e.target.value)}
                                      placeholder="100"
                                      className="bg-transparent text-slate-200 text-xs w-full focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-500 leading-tight">
                                Definí cuánto querés ganar como objetivo. El sistema elegirá automáticamente la apuesta necesaria para llegar a ese monto, respetando la apuesta mínima.
                              </p>
                              {smartError && (
                                <div className="text-[11px] text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                                  {smartError}
                                </div>
                              )}

                              <div className="flex gap-2">
                                <button 
                                  onClick={handleSmartDistribution}
                                  className="flex-1 bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-md text-xs font-semibold uppercase hover:bg-emerald-500/30 border border-emerald-500/50 transition-colors"
                                >
                                  Calcular y Repartir
                                </button>
                                <button 
                                  onClick={handleResetSmartDistribution}
                                  className="flex-1 bg-slate-800 text-slate-400 px-3 py-1.5 rounded-md text-xs font-semibold uppercase hover:bg-slate-700 hover:text-slate-300 border border-slate-700 transition-colors"
                                >
                                  Desactivar
                                </button>
                              </div>

                              <div className="pt-2 border-t border-slate-800 mt-2 flex flex-col gap-2">
                                <textarea
                                  value={aiCustomPrompt}
                                  onChange={(e) => setAiCustomPrompt(e.target.value)}
                                  placeholder="Ej: Maximizá la ganancia de la combinación 1 y 2, y el resto solo cubrí la apuesta..."
                                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 resize-none h-16 placeholder:text-slate-600"
                                />
                                <button
                                  onClick={handleGetAiAdvice}
                                  disabled={isAiLoading}
                                  className="w-full flex items-center justify-center gap-2 bg-indigo-500/20 text-indigo-400 px-3 py-2 rounded-md text-xs font-semibold uppercase hover:bg-indigo-500/30 border border-indigo-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                  {isAiLoading ? 'Consultando IA...' : 'Analizar con IA'}
                                </button>
                                
                                {aiAdvice && (
                                  <div className="mt-3 p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-md text-[11px] text-indigo-200 leading-relaxed flex gap-3">
                                    <Bot className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                                    <div className="whitespace-pre-wrap">{aiAdvice}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  </div>
                  
                  {totalCombinations > 0 && activeMiddleTab === 'lista' && (
                    <div className="flex flex-col gap-2">
                      {validDuplicateIndices.length > 0 && (
                        <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-2 rounded-lg text-xs flex justify-between items-center">
                          <span>Respecto a tus listas anteriores, <strong>{validDuplicateIndices.length}</strong> {validDuplicateIndices.length === 1 ? 'variación ya está' : 'variaciones ya están'} repetidas aquí.</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer bg-slate-950 px-2 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={hideStarred} 
                            onChange={e => setHideStarred(e.target.checked)}
                            className="accent-emerald-500 w-3 h-3 cursor-pointer"
                          />
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold select-none">
                            Ocultar <Star size={10} className="inline mb-0.5 ml-0.5 fill-slate-400" />
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer bg-slate-950 px-2 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={hideDuplicates} 
                            onChange={e => setHideDuplicates(e.target.checked)}
                            className="accent-indigo-500 w-3 h-3 cursor-pointer"
                          />
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold select-none">
                            Ocultar <Copy size={10} className="inline mb-0.5 ml-0.5 text-indigo-400" />
                          </span>
                        </label>
                        <button 
                          onClick={copyAll}
                          className="bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-1.5 border border-slate-700"
                          title={`Copiar todas las combinaciones generadas (máx ${MAX_COPY_LIMIT})`}
                        >
                          {copiedAll ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          Copiar Todo
                        </button>
                        <button
                          onClick={() => setHiddenColumns([...hiddenColumns, 'combinations'])}
                          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors ml-2 border border-transparent hover:border-slate-700"
                          title="Ocultar columna"
                        >
                          <EyeOff size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  {totalCombinations > 0 && activeMiddleTab === 'simulador' && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setHiddenColumns([...hiddenColumns, 'combinations'])}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors border border-transparent hover:border-slate-700"
                        title="Ocultar columna"
                      >
                        <EyeOff size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {activeMiddleTab === 'lista' ? (
                  <>
                    {matches.length > 0 && (
                      <div className="px-4 py-2 flex flex-wrap gap-2 items-center bg-slate-900 border-b border-slate-800">
                        <select 
                          value={combosFilterMatch}
                          onChange={(e) => {
                            setCombosFilterMatch(e.target.value);
                            if (e.target.value === 'todos') setCombosFilterOutcome('todos');
                          }}
                          className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-emerald-500 min-w-[140px]"
                        >
                          <option value="todos">Todos los partidos</option>
                          {matches.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                        <select
                          value={combosFilterOutcome}
                          onChange={(e) => setCombosFilterOutcome(e.target.value)}
                          disabled={combosFilterMatch === 'todos'}
                          className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-emerald-500 disabled:opacity-50 min-w-[120px]"
                        >
                          <option value="todos">Todos los resultados</option>
                          <option value="gana">Gana</option>
                          <option value="empata">Empata</option>
                          <option value="pierde">Pierde</option>
                        </select>
                        <select
                          value={combosSortOrder}
                          onChange={(e) => setCombosSortOrder(e.target.value as any)}
                          className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-emerald-500 min-w-[120px]"
                        >
                          <option value="original">Orden original</option>
                          <option value="asc">Menor a mayor cuota</option>
                          <option value="desc">Mayor a menor cuota</option>
                          <option value="win-asc">Menor a mayor ganancia</option>
                          <option value="win-desc">Mayor a menor ganancia</option>
                          <option value="avg">Premio cercano al promedio</option>
                        </select>
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 scrollbar-thin bg-slate-950/50">
                      {currentCombinations.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                          {hideStarred || hideDuplicates ? "Todas las combinaciones de esta página están ocultas." : "No hay combinaciones para mostrar."}
                        </div>
                      ) : (
                        currentCombinations.map((combo, idx) => {
                      const prevCombo = idx > 0 ? currentCombinations[idx - 1] : null;
                      const isSelected = selectedComboIndex === combo.index;
                      const starredBetId = getStarredBetId(combo.combo);
                      const isStarred = !!starredBetId;
                      const comboSignature = combo.combo.map(c => `${c.matchName.trim().toLowerCase()}:${c.outcome}`).sort().join('|');
                      const duplicateInTickets = externalComboSignatures.get(comboSignature);
                      const isDuplicate = duplicateInTickets && duplicateInTickets.length > 0;
                      const isAlreadyRealized = allRealizedSignatures.has(comboSignature);
                      return (
                        <div 
                          key={combo.index} 
                          onClick={() => setSelectedComboIndex(isSelected ? null : combo.index)}
                          className={`flex items-start gap-2 p-3 rounded-lg text-xs transition-all border cursor-pointer ${isSelected ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30' : isDuplicate ? 'bg-indigo-500/5 border-indigo-500/40 hover:border-indigo-500/60 hover:bg-indigo-500/10' : 'bg-slate-950 text-slate-300 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900'}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-[3.5rem] justify-end mt-0.5">
                            {isDuplicate && (
                              <div title={`Repetida en: ${duplicateInTickets.join(', ')}`} className="text-indigo-400 bg-indigo-500/10 p-0.5 rounded border border-indigo-500/20">
                                <Copy size={12} />
                              </div>
                            )}
                            <span className="text-slate-500 font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">#{combo.index + 1}</span>
                            <button 
                              onClick={(e) => toggleStar(combo, e)}
                              className={`p-1 rounded-md transition-colors ${isStarred ? 'text-amber-400 hover:text-amber-500' : 'text-slate-600 hover:text-amber-400 hover:bg-slate-800'}`}
                            >
                              <Star size={14} className={isStarred ? "fill-amber-400" : ""} />
                            </button>
                          </div>
                          <div className="flex flex-col gap-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-relaxed">
                            {combo.combo.map((item, oIdx) => {
                              const isGana = item.outcome === 'gana';
                              const isEmpata = item.outcome === 'empata';
                              const isChanged = prevCombo ? prevCombo.combo[oIdx]?.outcome !== item.outcome : false;
                              const colorClass = isGana ? 'text-emerald-400/90' : isEmpata ? 'text-amber-400/90' : 'text-rose-400/90';
                              const changedStyle = isChanged ? 'bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 shadow-sm transition-colors' : '';
                              
                              return (
                                <span key={oIdx} className={`flex items-center ${isChanged ? 'my-0.5' : ''}`}>
                                  {oIdx > 0 && <span className="text-slate-700 mx-1">|</span>}
                                  <span className={`${colorClass} ${changedStyle}`}>{getItemDisplayText(item.matchName, item.outcome, item.outcomeDisplayName)}</span>
                                </span>
                              );
                            })}
                            </div>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/50">
                              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded relative">
                                <span className="text-[10px] text-slate-500 uppercase">Apuesta:</span>
                                <span className="text-slate-500 text-xs">$</span>
                                <input
                                  type="number"
                                  onClick={(e) => e.stopPropagation()}
                                  value={activeTicket.customWagers?.[combo.index] !== undefined ? activeTicket.customWagers[combo.index] : (activeTicket.baseWager || '100')}
                                  onChange={(e) => updateCustomWager(combo.index, e.target.value)}
                                  className="bg-transparent w-16 text-xs text-slate-200 focus:outline-none pr-3"
                                />
                                {activeTicket.lockedWagers?.includes(combo.index) ? (
                                  <button onClick={(e) => { e.stopPropagation(); toggleLockedWager(combo.index); }} className="absolute right-2 text-blue-400 hover:text-blue-300 transition-colors" title="Desbloquear apuesta (fijada manualmente)">
                                    <Lock className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); toggleLockedWager(combo.index); }} className="absolute right-2 text-slate-600 hover:text-slate-400 transition-colors" title="Bloquear apuesta para que no se sobreescriba">
                                    <Unlock className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {combo.totalPayout && (() => {
                                  const wagerStr = activeTicket.customWagers?.[combo.index] !== undefined ? activeTicket.customWagers[combo.index] : (activeTicket.baseWager || '100');
                                  const wagerVal = parseFloat(wagerStr);
                                  const payoutVal = parseFloat(combo.totalPayout);
                                  const potentialWin = !isNaN(wagerVal) && !isNaN(payoutVal) ? wagerVal * payoutVal : null;
                                  
                                  return (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        Cuota: <span className="text-amber-400/90">{combo.totalPayout}</span>
                                      </span>
                                      {potentialWin !== null && (
                                        <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-[10px] font-mono border border-emerald-500/20 font-semibold">
                                          Paga: {formatARS(potentialWin)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                                {isAlreadyRealized ? (
                                  <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded font-semibold text-[10px] uppercase tracking-wider">
                                    <Check size={12} /> Realizada
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const wager = activeTicket.customWagers?.[combo.index] ?? activeTicket.baseWager ?? '100';
                                      if (starredBetId) {
                                        updateActiveTicket(ticket => ({
                                          ...ticket,
                                          savedBets: ticket.savedBets.map(b => b.id === starredBetId ? { ...b, isRealized: true, wager } : b)
                                        }));
                                      } else {
                                        updateActiveTicket(ticket => ({
                                          ...ticket,
                                          savedBets: [...ticket.savedBets, {
                                            id: Date.now().toString(),
                                            items: combo.combo.map(c => ({
                                              matchId: c.matchId,
                                              name: c.matchName,
                                              outcome: c.outcome,
                                              outcomeDisplayName: c.outcomeDisplayName
                                            })),
                                            timestamp: Date.now(),
                                            originalIndex: combo.index,
                                            payout: combo.totalPayout || undefined,
                                            wager: wager,
                                            isRealized: true
                                          }]
                                        }));
                                      }
                                    }}
                                    className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 px-2 py-1 rounded font-semibold text-[10px] transition-colors uppercase tracking-wider"
                                  >
                                    <Check size={12} /> Realizar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                {totalPages > 1 && (
                  <div className="p-3 border-t border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
                    <button 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <ChevronLeft size={20} className="text-slate-400" />
                    </button>
                    
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-slate-300 font-mono">
                        Pág {page} de {totalPages}
                      </span>
                      <button 
                        onClick={copyPage}
                        className="bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors flex items-center gap-1.5 border border-slate-700"
                      >
                        {copiedPage ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        Copiar Pág
                      </button>
                    </div>

                    <button 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <ChevronRight size={20} className="text-slate-400" />
                    </button>
                  </div>
                )}
              </>
            ) : (
                  <div className="flex-1 overflow-y-auto p-4 min-h-0 scrollbar-thin bg-slate-950/50 flex flex-col gap-4">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <h3 className="text-emerald-400 font-bold">Combinaciones Restantes</h3>
                        <p className="text-xs text-emerald-500/70 mt-1">Selecciona un resultado por partido para ver cómo se reducen.</p>
                      </div>
                      <div className="text-3xl font-mono font-black text-emerald-300">
                        {currentSimulatedRemaining.toLocaleString()}
                      </div>
                    </div>
                
                    <div className="flex flex-col gap-3">
                      {matches.map(match => {
                         const activeOutcomes = [];
                         if (match.outcomes.gana) activeOutcomes.push('gana');
                         if (match.outcomes.empata) activeOutcomes.push('empata');
                         if (match.outcomes.pierde) activeOutcomes.push('pierde');
                
                         if (activeOutcomes.length === 0) return null;
                
                         const currentFilter = simulationFilters[match.id];
                         const isFiltered = !!currentFilter;
                
                         const combinacionesSiElijo = currentSimulatedRemaining / (isFiltered ? 1 : activeOutcomes.length);
                
                         return (
                           <div key={match.id} className={`p-3 rounded-lg border flex flex-col gap-3 transition-colors ${isFiltered ? 'bg-slate-900 border-emerald-500/30' : 'bg-slate-950 border-slate-800'}`}>
                             <div className="flex items-center justify-between">
                               <span className="font-semibold text-slate-200">{match.name}</span>
                               {isFiltered && (
                                 <button 
                                   onClick={() => {
                                     const newFilters = { ...simulationFilters };
                                     delete newFilters[match.id];
                                     setSimulationFilters(newFilters);
                                   }}
                                   className="text-[10px] uppercase text-emerald-400 hover:text-emerald-300 font-semibold px-2 py-1 bg-emerald-500/10 rounded"
                                 >
                                   Desmarcar
                                 </button>
                               )}
                             </div>
                             
                             <div className="flex items-center gap-2">
                               {activeOutcomes.map(outcome => {
                                 const isSelected = currentFilter === outcome;
                                 const isOtherSelected = isFiltered && !isSelected;
                                 
                                 return (
                                   <button
                                     key={outcome}
                                     onClick={() => setSimulationFilters({ ...simulationFilters, [match.id]: outcome })}
                                     className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold flex flex-col items-center gap-1 transition-all
                                       ${isSelected 
                                         ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400' 
                                         : isOtherSelected 
                                           ? 'bg-slate-900/50 text-slate-600 border border-slate-800/50 opacity-50 hover:opacity-100 hover:bg-slate-800' 
                                           : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700 hover:border-slate-500'}`}
                                   >
                                     <span className="capitalize">{outcome}</span>
                                     {!isFiltered && (
                                       <span className="text-[10px] font-mono opacity-60">
                                         {combinacionesSiElijo.toLocaleString()} comb.
                                       </span>
                                     )}
                                   </button>
                                 );
                               })}
                             </div>
                           </div>
                         );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>
          </>
          )}
          
          {isDesktop && !hiddenColumns.includes('combinations') && (!hiddenColumns.includes('savedBets') || !hiddenColumns.includes('realizedBets')) && <PanelResizeHandle className="w-1.5 mx-0.5 rounded-full bg-slate-800/50 hover:bg-emerald-500/50 transition-colors shrink-0 cursor-col-resize hidden lg:block" />}

          {!hiddenColumns.includes('savedBets') && (
          <>
          <Panel defaultSize={isDesktop ? 20 : undefined} minSize={15} className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-full min-h-0 overflow-hidden shadow-xl shadow-black/20">
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Star size={16} className="fill-amber-400 text-amber-400" /> 
                Apuestas Guardadas
                <span className="bg-slate-800 text-slate-300 py-0.5 px-2 rounded-full text-[10px]">{pendingBets.length}</span>
              </h3>
              <button
                onClick={() => setHiddenColumns([...hiddenColumns, 'savedBets'])}
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                title="Ocultar columna"
              >
                <EyeOff size={16} />
              </button>
            </div>
            
            {pendingBets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-3 p-8 text-center h-full">
                <Star size={32} className="text-slate-800" />
                <p className="text-sm">No tienes apuestas guardadas.</p>
                <p className="text-xs mt-1">Haz clic en la estrella de cualquier combinación para guardarla aquí.</p>
              </div>
            ) : (
              <>
                <div className="overflow-y-auto p-3 space-y-2 scrollbar-thin flex-1 min-h-0">
                {pendingBets.map((bet, idx) => {
                  const prevBet = idx > 0 ? pendingBets[idx - 1] : null;
                  return (
                  <div 
                    key={bet.id} 
                    className="flex flex-col gap-2 p-3 rounded-lg text-xs border bg-slate-950 text-slate-300 border-slate-800/50"
                  >
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-b border-slate-800/50 pb-2">
                      <div className="flex items-center gap-1.5">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        <span>Combinación {bet.originalIndex + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => deleteSavedBet(bet.id, e)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                          title="Eliminar de guardados"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      {bet.items.map((item, oIdx) => {
                        const isChanged = prevBet ? prevBet.items[oIdx]?.outcome !== item.outcome : false;
                        const changedStyle = isChanged ? 'bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 shadow-sm transition-colors' : '';
                        return (
                          <div key={oIdx} className={`flex justify-between items-center ${isChanged ? 'my-0.5' : ''}`}>
                            <span className="text-slate-400 truncate pr-2 max-w-[65%]">{item.name}</span>
                            <span className={`text-amber-400/90 font-medium whitespace-nowrap ${changedStyle}`}>{item.outcomeDisplayName || item.outcome}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center mt-1 pt-2 border-t border-slate-800/50">
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-[10px] uppercase w-12">Apuesta:</span>
                            <input 
                              type="number" 
                              value={bet.wager || ''} 
                              onChange={(e) => updateSavedBetWager(bet.id, e.target.value)}
                              placeholder="1000"
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 w-16 focus:outline-none focus:border-emerald-500 transition-colors text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-[10px] uppercase">Cuota:</span>
                            <input 
                              type="number" 
                              step="0.01"
                              value={bet.payout || ''} 
                              onChange={(e) => updateSavedBetPayout(bet.id, e.target.value)}
                              placeholder="2.50"
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 w-16 focus:outline-none focus:border-amber-500 transition-colors text-xs"
                            />
                          </div>
                        </div>
                        {bet.wager && bet.payout && !isNaN(parseFloat(bet.wager)) && !isNaN(parseFloat(bet.payout)) && (
                          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1.5">
                            <span className="text-[10px] text-emerald-500/70 uppercase font-semibold">Ganancia Potencial</span>
                            <span className="text-emerald-400 font-bold text-xs">
                              {formatARS(parseFloat(bet.wager) * parseFloat(bet.payout))}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => toggleSavedBetRealized(bet.id)}
                          className="w-full mt-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded py-1.5 transition-colors font-medium text-xs"
                        >
                          <Check size={14} /> Realizar
                        </button>
                      </div>
                    </div>
                  </div>
                );})}
              </div>
              <div className="bg-slate-950 border-t border-slate-800 p-3 shrink-0">
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Costo Total:</span>
                    <span className="text-slate-200 font-mono">{formatARS(pendingStats.totalCost)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Ganancia Mínima:</span>
                    <span className="text-emerald-400 font-mono">{formatARS(pendingStats.minWin)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Ganancia Media:</span>
                    <span className="text-emerald-400 font-mono">{formatARS(pendingStats.avgWin)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Ganancia Máxima:</span>
                    <span className="text-emerald-400 font-mono">{formatARS(pendingStats.maxWin)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
          </Panel>
          </>
          )}

          {isDesktop && !hiddenColumns.includes('savedBets') && (!hiddenColumns.includes('realizedBets')) && <PanelResizeHandle className="w-1.5 mx-0.5 rounded-full bg-slate-800/50 hover:bg-emerald-500/50 transition-colors shrink-0 cursor-col-resize hidden lg:block" />}

          {/* Right Column 2: Realized Bets */}
          {!hiddenColumns.includes('realizedBets') && (
          <Panel defaultSize={isDesktop ? 20 : undefined} minSize={15} className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-full min-h-0 overflow-hidden shadow-xl shadow-black/20">
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Check size={16} className="text-emerald-400" /> 
                Apuestas Realizadas
                <span className="bg-slate-800 text-slate-300 py-0.5 px-2 rounded-full text-[10px]">{realizedBets.length}</span>
              </h3>
              <button
                onClick={() => setHiddenColumns([...hiddenColumns, 'realizedBets'])}
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                title="Ocultar columna"
              >
                <EyeOff size={16} />
              </button>
            </div>
            
            {realizedBets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-3 p-8 text-center h-full">
                <Check size={32} className="text-slate-800" />
                <p className="text-sm">Aún no has realizado apuestas.</p>
                <p className="text-xs mt-1">Marca una apuesta como realizada para verla aquí.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 border-b border-slate-800/50 bg-slate-950/50">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="text"
                      placeholder="Buscar por partido o resultado..."
                      value={realizedSearchQuery}
                      onChange={(e) => setRealizedSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-colors placeholder-slate-600"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto p-3 space-y-2 scrollbar-thin flex-1 min-h-0">
                {filteredRealizedBets.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No se encontraron combinaciones que coincidan con la búsqueda.
                  </div>
                ) : 
                  filteredRealizedBets.map((bet, idx) => {
                    const prevBet = idx > 0 ? filteredRealizedBets[idx - 1] : null;
                    return (
                    <div 
                      key={bet.id} 
                      className="flex flex-col gap-2 p-3 rounded-lg text-xs border bg-slate-950 text-slate-300 border-emerald-900/30 relative overflow-hidden"
                    >
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 -rotate-45 translate-x-8 -translate-y-8" />
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-b border-slate-800/50 pb-2 relative z-10">
                      <div className="flex items-center gap-1.5">
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-500/70">Combinación {bet.originalIndex + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => deleteSavedBet(bet.id, e)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                          title="Eliminar apuesta"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1 relative z-10">
                      {bet.items.map((item, oIdx) => {
                        const isChanged = prevBet ? prevBet.items[oIdx]?.outcome !== item.outcome : false;
                        const changedStyle = isChanged ? 'bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 shadow-sm transition-colors opacity-100' : 'opacity-75';
                        return (
                          <div key={oIdx} className={`flex justify-between items-center ${isChanged ? 'my-0.5' : ''}`}>
                            <span className="text-slate-400 truncate pr-2 max-w-[65%]">{item.name}</span>
                            <span className={`text-slate-300 whitespace-nowrap ${changedStyle}`}>{item.outcomeDisplayName || item.outcome}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center mt-1 pt-2 border-t border-slate-800/50 relative z-10">
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex items-center justify-between bg-slate-900 rounded px-2 py-1.5 border border-slate-800">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 uppercase">Apostado</span>
                            <span className="font-medium text-slate-300">{bet.wager && !isNaN(parseFloat(bet.wager)) ? formatARS(parseFloat(bet.wager)) : '-'}</span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-[10px] text-slate-500 uppercase">Cuota</span>
                            <span className="font-medium text-amber-400/90">{bet.payout || '-'}</span>
                          </div>
                        </div>
                        {bet.wager && bet.payout && !isNaN(parseFloat(bet.wager)) && !isNaN(parseFloat(bet.payout)) && (
                          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1.5">
                            <span className="text-[10px] text-emerald-500/70 uppercase font-semibold">Ganancia Posible</span>
                            <span className="text-emerald-400 font-bold text-xs">
                              {formatARS(parseFloat(bet.wager) * parseFloat(bet.payout))}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => toggleSavedBetRealized(bet.id)}
                          className="w-full mt-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded py-1.5 transition-colors font-medium text-[10px] uppercase tracking-wider"
                        >
                          <X size={12} /> Deshacer
                        </button>
                      </div>
                    </div>
                  </div>
                );})}
              </div>
              <div className="bg-slate-950 border-t border-slate-800 p-3 shrink-0">
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Inversión Total:</span>
                    <span className="text-slate-200 font-mono">{formatARS(realizedStats.totalInvested)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Ganancia Mínima:</span>
                    <span className="text-emerald-400 font-mono">{formatARS(realizedStats.minWin)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Ganancia Máxima:</span>
                    <span className="text-emerald-400 font-mono">{formatARS(realizedStats.maxWin)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </Panel>
        )}
      </PanelGroup>
        </main>
      </div>
    </div>
  );
}
