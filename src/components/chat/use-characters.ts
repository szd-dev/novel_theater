"use client";

import { useState, useEffect, useCallback } from "react";

interface CharacterEntry {
  name: string;
  l0: string;
}

interface UseCharactersResult {
  characters: CharacterEntry[];
  loading: boolean;
}

export function useCharacters(projectId: string): UseCharactersResult {
  const [characters, setCharacters] = useState<CharacterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCharacters = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/characters`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCharacters(data.characters);
        }
      }
    } catch {
      // Silently fail — don't block chat
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCharacters();
    const interval = setInterval(fetchCharacters, 5000);
    return () => clearInterval(interval);
  }, [fetchCharacters]);

  return { characters, loading };
}
