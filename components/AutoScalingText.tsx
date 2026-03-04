import React, { useState, useLayoutEffect, useRef, memo } from 'react';

interface AutoScalingTextProps {
  children: React.ReactNode;
  className?: string;
  maxFontSize?: number; // in px
  minFontSize?: number; // in px
}

const AutoScalingTextComponent: React.FC<AutoScalingTextProps> = ({ 
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

    // Reset to max font size to measure original width
    text.style.fontSize = `${maxFontSize}px`;
    const containerWidth = container.offsetWidth;
    const textWidth = text.offsetWidth;

    if (textWidth > containerWidth && containerWidth > 0) {
      // Calculate scale factor
      const scaleFactor = containerWidth / textWidth;
      const calculatedFontSize = Math.max(minFontSize, Math.floor(maxFontSize * scaleFactor));
      setFontSize(calculatedFontSize);
      text.style.fontSize = `${calculatedFontSize}px`;
    } else {
      setFontSize(maxFontSize);
    }
  }, [children, maxFontSize, minFontSize]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden whitespace-nowrap ${className}`}>
      <span ref={textRef} style={{ fontSize: `${fontSize}px` }} className="inline-block">
        {children}
      </span>
    </div>
  );
};

export const AutoScalingText = memo(AutoScalingTextComponent);
