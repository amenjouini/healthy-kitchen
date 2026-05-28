import { useEffect, useState } from 'react';

export default function CustomCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e) => {
      setPosition({
        x: e.clientX,
        y: e.clientY,
      });
    };

    window.addEventListener('mousemove', move);

    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <div
      className='fixed top-0 left-0 w-8 h-8 rounded-full bg-green-400/40 blur-md pointer-events-none z-[999]'
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    />
  );
}