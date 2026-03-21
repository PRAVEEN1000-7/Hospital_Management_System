import React, { useState, useEffect, useRef, useMemo } from 'react';

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
  onManualEntry?: (value: string) => void;
  allowManualEntry?: boolean;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
}

/**
 * A searchable dropdown component with autocomplete suggestions.
 * Users can either select from suggestions or type manually.
 */
const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  suggestions,
  placeholder = 'Search...',
  disabled = false,
  className = '',
  onManualEntry,
  allowManualEntry = true,
  onSearchChange,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync searchTerm with value prop when it changes from outside
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Notify parent of search term changes (for typeahead)
  useEffect(() => {
    if (onSearchChange) {
      const timer = setTimeout(() => {
        onSearchChange(searchTerm);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchTerm, onSearchChange]);

  // Filter suggestions based on search term
  const filteredSuggestions = useMemo(() => {
    if (!searchTerm.trim()) {
      // Show first 20 suggestions when empty (for initial dropdown)
      return suggestions.slice(0, 20);
    }
    const term = searchTerm.toLowerCase();
    return suggestions
      .filter(s => s.label.toLowerCase().includes(term) || s.sublabel?.toLowerCase().includes(term))
      .slice(0, 20);
  }, [searchTerm, suggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        if (highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
          handleSelect(filteredSuggestions[highlightedIndex]);
        } else if (allowManualEntry && searchTerm.trim()) {
          handleManualSelect();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (option: SuggestionOption) => {
    // Pass the label (name) as the value, and full metadata for auto-fill
    onChange(option.label, option.metadata);
    setSearchTerm(option.label);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleManualSelect = () => {
    onChange(searchTerm.trim(), undefined);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // If field is cleared, reset the value
    if (!newValue.trim()) {
      onChange('', undefined);
    } else {
      // Update parent with current typed value (for manual entry)
      // Pass undefined metadata to indicate manual entry
      onChange(newValue, undefined);
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

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
          disabled={disabled || loading}
          placeholder={loading ? 'Searching...' : placeholder}
          className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none pr-8"
          autoComplete="off"
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
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {filteredSuggestions.length > 0 && (
            filteredSuggestions.map((option, index) => (
              <div
                key={option.id}
                onClick={() => handleSelect(option)}
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

          {allowManualEntry && searchTerm.trim() && !filteredSuggestions.some(s => s.label.toLowerCase() === searchTerm.toLowerCase()) && (
            <div
              onClick={handleManualSelect}
              className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 border-t border-slate-100 ${
                highlightedIndex === -1 ? 'bg-primary/10' : 'hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined text-sm text-slate-400">add_circle</span>
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
