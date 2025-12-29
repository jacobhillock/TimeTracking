import { useState, useEffect, useRef } from 'react';
import { searchEntries, formatDateForDisplay } from './services/searchService';

function SearchModal({ isOpen, onClose, currentDate, currentView, onNavigateToDate }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmNavigation, setConfirmNavigation] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchTerm.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const searchResults = await searchEntries(searchTerm);
      setResults(searchResults);
      setIsSearching(false);
    }, 250);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleResultClick = (resultDate) => {
    const currentDateKey = currentDate.toISOString().split('T')[0]
    
    // Check if we're already viewing this date
    if (currentView === 'task' && resultDate === currentDateKey) {
      // Already on this date in task view - show tooltip
      return 'already-viewing'
    }
    
    if (currentView === 'calendar') {
      // Check if date is in the visible business week
      const d = new Date(currentDate)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -2 : 1)
      const monday = new Date(d.setDate(diff))
      
      for (let i = 0; i < 5; i++) {
        const weekDate = new Date(monday)
        weekDate.setDate(weekDate.getDate() + i)
        if (weekDate.toISOString().split('T')[0] === resultDate) {
          // Already visible in calendar view
          return 'already-viewing'
        }
      }
    }
    
    // Show confirmation dialog
    setConfirmNavigation(resultDate)
  }

  const confirmNavigationToDate = () => {
    if (confirmNavigation) {
      onNavigateToDate(confirmNavigation)
      setConfirmNavigation(null)
      onClose()
    }
  }

  const cancelNavigation = () => {
    setConfirmNavigation(null)
  }

  if (!isOpen) return null;

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Search entries by date, client, ticket, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                className="search-clear"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button className="search-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="search-results">
          {isSearching && (
            <div className="search-loading">Searching...</div>
          )}

          {!isSearching && searchTerm && results.length === 0 && (
            <div className="search-no-results">
              <div className="no-results-icon">🔍</div>
              <div>No results found</div>
              <div className="no-results-hint">Try searching for a client, ticket number, date, or description</div>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="search-results-list">
              <div className="search-results-count">
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </div>
              {results.map(({ date, entry }, index) => {
                const isAlreadyViewing = (() => {
                  const currentDateKey = currentDate.toISOString().split('T')[0]
                  if (currentView === 'task' && date === currentDateKey) return true
                  
                  if (currentView === 'calendar') {
                    const d = new Date(currentDate)
                    const day = d.getDay()
                    const diff = d.getDate() - day + (day === 0 ? -2 : 1)
                    const monday = new Date(d.setDate(diff))
                    
                    for (let i = 0; i < 5; i++) {
                      const weekDate = new Date(monday)
                      weekDate.setDate(weekDate.getDate() + i)
                      if (weekDate.toISOString().split('T')[0] === date) return true
                    }
                  }
                  return false
                })()
                
                return (
                  <div 
                    key={`${date}-${entry.id}-${index}`} 
                    className={`search-result-item ${isAlreadyViewing ? 'already-viewing' : 'clickable'}`}
                    onClick={() => !isAlreadyViewing && handleResultClick(date)}
                    title={isAlreadyViewing ? 'Can be seen' : 'Click to navigate to this date'}
                  >
                    <div className="search-result-header">
                      <span className="search-result-date">{formatDateForDisplay(date)}</span>
                      <span className="search-result-time">
                        {entry.startTime} - {entry.endTime}
                      </span>
                    </div>
                    {(entry.client || entry.ticket) && (
                      <div className="search-result-client">
                        {entry.client}{entry.ticket ? `-${entry.ticket}` : ''}
                      </div>
                    )}
                    {entry.description && (
                      <div className="search-result-description">
                        {entry.description}
                      </div>
                    )}
                    {entry.disabled && (
                      <div className="search-result-badge">Disabled</div>
                    )}
                    {isAlreadyViewing && (
                      <div className="search-result-tooltip">Can be seen</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!isSearching && !searchTerm && (
            <div className="search-empty-state">
              <div className="empty-state-icon">🔍</div>
              <div>Start typing to search</div>
              <div className="empty-state-hint">
                Search by date (MM/DD/YYYY), client, ticket #, or description
              </div>
            </div>
          )}
        </div>
        
        {confirmNavigation && (
          <div className="search-confirmation-overlay" onClick={cancelNavigation}>
            <div className="search-confirmation-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Navigate to Date</h3>
              <p>You are changing the day to {formatDateForDisplay(confirmNavigation)}, do you wish to continue?</p>
              <div className="confirmation-buttons">
                <button className="btn-confirm" onClick={confirmNavigationToDate}>Yes</button>
                <button className="btn-cancel-confirm" onClick={cancelNavigation}>No</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchModal;
