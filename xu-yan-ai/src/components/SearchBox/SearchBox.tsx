import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, Clock, TrendingUp } from 'lucide-react'
import styles from './SearchBox.module.css'

interface SearchBoxProps {
  placeholder?: string
  items: string[]
  onSearch: (query: string) => void
  onSelect?: (item: string) => void
  storageKey?: string
}

const SearchBox: React.FC<SearchBoxProps> = ({
  placeholder = '搜索...',
  items,
  onSearch,
  onSelect,
  storageKey = 'search-history',
}) => {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        setSearchHistory(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load search history:', e)
    }
  }, [storageKey])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const saveToHistory = (term: string) => {
    if (!term.trim()) return
    const newHistory = [term, ...searchHistory.filter(h => h !== term)].slice(0, 10)
    setSearchHistory(newHistory)
    try {
      localStorage.setItem(storageKey, JSON.stringify(newHistory))
    } catch (e) {
      console.error('Failed to save search history:', e)
    }
  }

  const removeFromHistory = (term: string) => {
    const newHistory = searchHistory.filter(h => h !== term)
    setSearchHistory(newHistory)
    try {
      localStorage.setItem(storageKey, JSON.stringify(newHistory))
    } catch (e) {
      console.error('Failed to update search history:', e)
    }
  }

  const clearHistory = () => {
    setSearchHistory([])
    try {
      localStorage.removeItem(storageKey)
    } catch (e) {
      console.error('Failed to clear search history:', e)
    }
  }

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const lowerQuery = query.toLowerCase()
    return items
      .filter(item => item.toLowerCase().includes(lowerQuery))
      .slice(0, 8)
  }, [query, items])

  const highlightMatch = (text: string, match: string) => {
    if (!match.trim()) return text
    const lowerText = text.toLowerCase()
    const lowerMatch = match.toLowerCase()
    const index = lowerText.indexOf(lowerMatch)
    if (index === -1) return text
    
    return (
      <>
        {text.slice(0, index)}
        <span className={styles.highlight}>{text.slice(index, index + match.length)}</span>
        {text.slice(index + match.length)}
      </>
    )
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setShowDropdown(true)
    onSearch(value)
  }

  const handleSelectSuggestion = (item: string) => {
    setQuery(item)
    saveToHistory(item)
    setShowDropdown(false)
    onSearch(item)
    onSelect?.(item)
  }

  const handleSelectHistory = (item: string) => {
    setQuery(item)
    setShowDropdown(false)
    onSearch(item)
    onSelect?.(item)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      saveToHistory(query.trim())
      setShowDropdown(false)
      onSelect?.(query.trim())
    }
  }

  const handleClear = () => {
    setQuery('')
    onSearch('')
    inputRef.current?.focus()
  }

  return (
    <div className={styles.container}>
      <div className={`${styles.searchWrapper} ${isFocused ? styles.focused : ''}`}>
        <Search size={16} className={styles.searchIcon} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            setIsFocused(true)
            setShowDropdown(true)
          }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={styles.input}
        />
        {query && (
          <button className={styles.clearBtn} onClick={handleClear}>
            <X size={14} />
          </button>
        )}
      </div>

      {showDropdown && (suggestions.length > 0 || (query === '' && searchHistory.length > 0)) && (
        <div ref={dropdownRef} className={styles.dropdown}>
          {query === '' && searchHistory.length > 0 ? (
            <>
              <div className={styles.dropdownHeader}>
                <Clock size={12} />
                <span>搜索历史</span>
                <button className={styles.clearHistoryBtn} onClick={clearHistory}>
                  清除
                </button>
              </div>
              <div className={styles.historyList}>
                {searchHistory.map((item, index) => (
                  <div
                    key={index}
                    className={styles.historyItem}
                    onClick={() => handleSelectHistory(item)}
                  >
                    <span className={styles.historyText}>{item}</span>
                    <button
                      className={styles.removeHistoryBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFromHistory(item)
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : suggestions.length > 0 ? (
            <>
              <div className={styles.dropdownHeader}>
                <TrendingUp size={12} />
                <span>搜索建议</span>
              </div>
              <div className={styles.suggestionList}>
                {suggestions.map((item, index) => (
                  <div
                    key={index}
                    className={styles.suggestionItem}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    {highlightMatch(item, query)}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default SearchBox
