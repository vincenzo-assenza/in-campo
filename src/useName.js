import { useState } from 'react';

export function useName() {
  const [name, setNameState] = useState(() => localStorage.getItem('bv_name') || '');
  const setName = (n) => {
    const trimmed = n.trim();
    localStorage.setItem('bv_name', trimmed);
    setNameState(trimmed);
  };
  return [name, setName];
}
