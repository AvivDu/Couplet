import { useEffect, useRef, useState } from 'react';
import { searchUsers } from '../services/api';
import type { GroupMember } from '../services/api';

// Debounced free-text user search (name/email/phone) - shared by every
// "find a person" UI (the group invite picker, the Groups-screen person
// search) so a fix only has to be made once. Guards against a slower, older
// request resolving after a newer one - or after the query was cleared -
// and overwriting the current results: clearTimeout only cancels a debounce
// that hasn't fired yet, not a request already in flight. Identifies "the
// current request" by a monotonic counter, not the query text itself - two
// requests for the identical string (type it, clear, retype it while the
// first is still in flight) would otherwise be indistinguishable and let the
// stale one win.
export function useUserSearch(query: string) {
  const [results, setResults] = useState<GroupMember[]>([]);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // Invalidates any request still in flight for a previous query, so its
      // late response can't repopulate results the user already cleared.
      requestIdRef.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const { data } = await searchUsers(trimmed);
        if (requestIdRef.current === requestId) setResults(data);
      } catch {
        if (requestIdRef.current === requestId) setResults([]);
      } finally {
        if (requestIdRef.current === requestId) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  return { results, searching, clear: () => setResults([]) };
}
