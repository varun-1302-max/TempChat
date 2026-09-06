import React from 'react';

interface EmblemProps {
  className?: string;
  size?: number;
}

export const Emblem: React.FC<EmblemProps> = ({ className = 'w-8 h-8', size }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      <defs>
        <linearGradient id="emblemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0084ff" />
          <stop offset="100%" stopColor="#0066fe" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#emblemGrad)" />
      {/* Friendly speech bubble */}
      <path
        d="M13 16C13 13.2386 15.2386 11 18 11H30C32.7614 11 35 13.2386 35 16V25C35 27.7614 32.7614 30 30 30H20.5L14.2 35.2C13.6 35.7 13 35.3 13 34.5V16Z"
        fill="#ffffff"
      />
      {/* 3 message dots */}
      <circle cx="19" cy="20.5" r="2" fill="#0084ff" />
      <circle cx="24" cy="20.5" r="2" fill="#0084ff" />
      <circle cx="29" cy="20.5" r="2" fill="#0084ff" />
    </svg>
  );
};
