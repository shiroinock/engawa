import { useEffect, useState } from 'react';
import './LongPressGauge.css';

interface LongPressGaugeProps {
  isActive: boolean;
  duration: number; // ミリ秒
}

export function LongPressGauge({ isActive, duration }: LongPressGaugeProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setProgress(0);
      return;
    }

    const startTime = Date.now();
    let animationFrameId: number;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(newProgress);

      if (newProgress < 100) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, duration]);

  if (!isActive) {
    return null;
  }

  return (
    <div className="long-press-gauge">
      <div className="gauge-container">
        <div className="gauge-label">長押しでプレビュー...</div>
        <div className="gauge-bar">
          <div
            className="gauge-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
