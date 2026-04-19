import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface SuggestionOption {
  id: string;
  label: string;
  sublabel?: string;
  metadata?: Record<string, unknown>;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string, metadata?: Record<string, unknown>) => void;
  suggestions: SuggestionOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowManualEntry?: boolean;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
}

/**
 * A searchable dropdown with autocomplete suggestions.
 * 
 * This component maintains COMPLETE control over its internal input state.
 * The value prop is ONLY used for the initial value on mount.
 * After mount, the component ignores value prop changes to prevent focus loss.
 * 
 * To reset the value externally, use a key prop change on this component.
 */
const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  suggestions,
  placeholder = 'Search...',
  disabled = false,
  className = '',
  allowManualEntry = true,
  onSearchChange,
  loading = false,
}) => {
  // Internal state - completely independent from value prop after mount
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Track if we've mounted - after this, ignore value prop changes
  const hasMountedRef = useRef(false);

  // ONLY on initial mount - set the initial value
  useEffect(() => {
    if (!hasMountedRef.current) {
      setSearchTerm(value || '');
      hasMountedRef.current = true;
    }
    // Intentionally only run once on mount
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of search term changes (for typeahead) - with debounce
  useEffect(() => {
    if (!onSearchChange) return;
    
    const timer = setTimeout(() => {
      onSearchChange(searchTerm);
    }, 400); // 400ms debounce
    
    return () => clearTimeout(timer);
  }, [searchTerm, onSearchChange]);

  // Filter suggestions based on search term - memoized
  const filteredSuggestions = useMemo(() => {
    if (!searchTerm.trim()) {
      return suggestions.slice(0, 20);
    }
    const term = searchTerm.toLowerCase().trim();
    return suggestions
      .filter(s => s.label.toLowerCase().includes(term) || s.sublabel?.toLowerCase().includes(term))
      .slice(0, 20);
  }, [searchTerm, suggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
          handleSelect(filteredSuggestions[highlightedIndex]);
        } else if (allowManualEntry && searchTerm.trim()) {
          handleManualSelect();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [isOpen, filteredSuggestions, highlightedIndex, searchTerm, allowManualEntry]);

  const handleSelect = useCallback((option: SuggestionOption) => {
    // Update internal state
    setSearchTerm(option.label);
    setIsOpen(false);
    setHighlightedIndex(-1);
    
    // Notify parent with metadata for auto-fill
    onChange(option.label, option.metadata);
  }, [onChange]);

  const handleManualSelect = useCallback(() => {
    const trimmed = searchTerm.trim();
    setSearchTerm(trimmed);
    setIsOpen(false);
    setHighlightedIndex(-1);
    
    // Notify parent - no metadata means manual entry
    onChange(trimmed, undefined);
  }, [onChange, searchTerm]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // Only notify parent if field is cleared
    if (!newValue.trim()) {
      onChange('', undefined);
    }
    // Don't notify parent while typing - prevents re-renders and focus loss
  }, [onChange]);

  const handleInputFocus = useCallback(() => {
    setIsOpen(true);
    setHighlightedIndex(-1);
  }, []);

  const handleInputBlur = useCallback(() => {
    // Delay closing to allow click on suggestion
    setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  }, []);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          disabled={disabled || loading}
          placeholder={loading ? 'Searching...' : placeholder}
          className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none pr-8"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="searchable-select-dropdown"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
          {loading ? (
            <span className="animate-spin">⟳</span>
          ) : (
            isOpen ? '▲' : '▼'
          )}
        </span>
      </div>

      {isOpen && (filteredSuggestions.length > 0 || (allowManualEntry && searchTerm.trim())) && (
        <div 
          id="searchable-select-dropdown"
          role="listbox"
          className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-y-auto"
        >
          {filteredSuggestions.length > 0 && (
            filteredSuggestions.map((option, index) => (
              <div
                key={option.id}
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-3 py-2 cursor-pointer text-sm flex flex-col gap-0.5 ${
                  index === highlightedIndex ? 'bg-primary/10' : 'hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-slate-900">{option.label}</div>
                {option.sublabel && (
                  <div className="text-xs text-slate-500">{option.sublabel}</div>
                )}
              </div>
            ))
          )}

          {allowManualEntry && searchTerm.trim() && filteredSuggestions.length === 0 && (
            <div
              role="option"
              onClick={handleManualSelect}
              onMouseEnter={() => setHighlightedIndex(-1)}
              className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 border-t border-slate-100 ${
                highlightedIndex === -1 ? 'bg-primary/10' : 'hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined text-sm text-slate-400">edit_note</span>
              <span className="text-slate-700">
                Use: <strong className="text-slate-900">"{searchTerm.trim()}"</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
