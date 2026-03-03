import React, { useState, useLayoutEffect, useRef } from 'react';

interface AutoScalingTextProps {
  children: React.ReactNode;
  className?: string;
  maxFontSize?: number; // in px
  minFontSize?: number; // in px
}

export const AutoScalingText: React.FC<AutoScalingTextProps> = ({ 
  children, 
  className = "", 
  maxFontSize = 32, 
  minFontSize = 12 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    let currentFontSize = maxFontSize;
    text.style.fontSize = `${currentFontSize}px`;

    // Simple iterative scale down
    while (text.offsetWidth > container.offsetWidth && currentFontSize > minFontSize) {
      currentFontSize -= 1;
      text.style.fontSize = `${currentFontSize}px`;
    }
    
    setFontSize(currentFontSize);
  }, [children, maxFontSize, minFontSize]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden whitespace-nowrap ${className}`}>
      <span ref={textRef} style={{ fontSize: `${fontSize}px` }} className="inline-block">
        {children}
      </span>
    </div>
  );
};
