import { AudioLines } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type DemoPhase = 'initial' | 'aiCursor' | 'cableRemoving' | 'cableRemoved' | 'vasePrompt' | 'processing' | 'completed';

type Point = {
  x: number;
  y: number;
};

type MoveTrailPoint = Point & {
  t: number;
  axis: 'x' | 'y';
  direction: number;
  distance: number;
};

type AIWaterCursor = {
  moveTo?: (x: number, y: number) => void;
  show?: (point?: Point) => void;
  hide?: () => void;
  destroy?: () => void;
};

type AIWaterCommandChip = {
  show?: (point?: Point, text?: string) => void;
  hide?: () => void;
  destroy?: () => void;
};

type AIWaterWaterRippleLayer = {
  play?: () => void;
  start?: () => void;
  stop?: () => void;
  setScale?: (scale: number) => AIWaterWaterRippleLayer;
  destroy?: () => void;
};

type AIWaterEdgeGlowLayer = {
  start?: () => void;
  stop?: () => void;
  setOptions?: (options?: Record<string, unknown>) => AIWaterEdgeGlowLayer;
  destroy?: () => void;
};

type AIWaterRuntime = {
  createCursor?: (options?: Record<string, unknown>) => AIWaterCursor;
  createCommandChip?: (options?: Record<string, unknown>) => AIWaterCommandChip;
  createWaterRippleLayer?: (options?: Record<string, unknown>) => AIWaterWaterRippleLayer;
  createEdgeGlowLayer?: (options?: Record<string, unknown>) => AIWaterEdgeGlowLayer;
};

declare global {
  interface Window {
    AIWater?: AIWaterRuntime;
    __aiWaterRemoteLoadPromise?: Promise<AIWaterRuntime | null>;
  }
}

const beforeSceneUrl = new URL('./assets/scene-before.png', import.meta.url).href;
const noCableSceneUrl = new URL('./assets/scene-no-cable.png', import.meta.url).href;
const afterSceneUrl = new URL('./assets/scene-after.png', import.meta.url).href;

const phaseOrder: DemoPhase[] = ['initial', 'aiCursor', 'cableRemoving', 'cableRemoved', 'vasePrompt', 'processing', 'completed'];

const remoteAIWaterBase =
  'https://raw.githubusercontent.com/Pingo-od/ai-water-interactions/main/ai-water-interactions';
const remoteAIWaterScriptUrl = `${remoteAIWaterBase}/dist/ai-water-interactions.js`;
const remoteAIWaterCssUrl = `${remoteAIWaterBase}/dist/ai-water-interactions.css`;
const remoteAIWaterEdgeGlowAssetUrl = `${remoteAIWaterBase}/assets/edge-glow-pad-edge-only.png`;

const cablePoint = { xPercent: 58.6, yPercent: 75.4 };
const vasePoint = { xPercent: 81.6, yPercent: 71.5 };
const mosaicTileCount = {
  cable: { columns: 23, rows: 9 },
  vase: { columns: 9, rows: 15 },
};

function safeCall(fn: (() => void) | undefined) {
  try {
    fn?.();
  } catch (error) {
    console.warn('[AIWater] Remote motion call failed', error);
  }
}

function loadRemoteAIWater() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.AIWater) return Promise.resolve(window.AIWater);
  if (window.__aiWaterRemoteLoadPromise) return window.__aiWaterRemoteLoadPromise;

  window.__aiWaterRemoteLoadPromise = (async () => {
    const cacheKey = Date.now();
    try {
      const [cssResponse, jsResponse] = await Promise.all([
        fetch(`${remoteAIWaterCssUrl}?t=${cacheKey}`, { cache: 'no-store' }),
        fetch(`${remoteAIWaterScriptUrl}?t=${cacheKey}`, { cache: 'no-store' }),
      ]);

      if (!cssResponse.ok || !jsResponse.ok) {
        throw new Error(`Remote AIWater load failed: css ${cssResponse.status}, js ${jsResponse.status}`);
      }

      const [cssText, jsText] = await Promise.all([cssResponse.text(), jsResponse.text()]);
      const style = document.createElement('style');
      style.dataset.aiWaterRemote = 'true';
      style.textContent = cssText;
      document.head.append(style);

      const script = document.createElement('script');
      const scriptUrl = URL.createObjectURL(new Blob([jsText], { type: 'text/javascript' }));
      script.src = scriptUrl;
      document.head.append(script);
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Remote AIWater script execution failed'));
      });
      URL.revokeObjectURL(scriptUrl);

      return window.AIWater ?? null;
    } catch (error) {
      console.warn('[AIWater] Falling back to local CSS motion', error);
      return null;
    }
  })();

  return window.__aiWaterRemoteLoadPromise;
}

function getPathLength(points: Point[]) {
  return points.reduce((length, point, index) => {
    if (index === 0) return length;
    const previous = points[index - 1];
    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function useRemoteAIWater({
  phase,
}: {
  phase: DemoPhase;
}) {
  const [runtime, setRuntime] = useState<AIWaterRuntime | null>(null);
  const wakeRippleRef = useRef<AIWaterWaterRippleLayer | null>(null);
  const edgeGlowRef = useRef<AIWaterEdgeGlowLayer | null>(null);
  const previousPhaseRef = useRef(phase);
  const hasPlayedWakeRippleRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadRemoteAIWater().then((nextRuntime) => {
      if (!cancelled) setRuntime(nextRuntime);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!runtime) return undefined;

    if (!wakeRippleRef.current && typeof runtime.createWaterRippleLayer === 'function') {
      wakeRippleRef.current = runtime.createWaterRippleLayer({
        fullScreen: true,
        autoPlay: false,
        loop: false,
        duration: 3000,
        renderScale: 0.82,
        maxRenderPixels: 260000,
        maxDpr: 1.25,
        sourceX: 0.5,
        sourceY: 1.08,
        ringCount: 4,
        scale: 1,
      });
    }

    if (!edgeGlowRef.current && typeof runtime.createEdgeGlowLayer === 'function') {
      edgeGlowRef.current = runtime.createEdgeGlowLayer({
        fullScreen: true,
        autoPlay: false,
        assetUrl: remoteAIWaterEdgeGlowAssetUrl,
      });
    }

    return () => {
      safeCall(() => wakeRippleRef.current?.destroy?.());
      safeCall(() => edgeGlowRef.current?.destroy?.());
      wakeRippleRef.current = null;
      edgeGlowRef.current = null;
    };
  }, [runtime]);

  useEffect(() => {
    if (!runtime) return;
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = phase;

    if (phase === 'initial') {
      hasPlayedWakeRippleRef.current = false;
      safeCall(() => wakeRippleRef.current?.stop?.());
      safeCall(() => edgeGlowRef.current?.stop?.());
      return;
    }

    safeCall(() => edgeGlowRef.current?.start?.());

    if (phase === 'aiCursor' && previousPhase === 'initial' && !hasPlayedWakeRippleRef.current) {
      hasPlayedWakeRippleRef.current = true;
      safeCall(() => wakeRippleRef.current?.play?.());
    }
  }, [phase, runtime]);

  return {
    isAvailable: Boolean(runtime),
    hasEdgeGlow: typeof runtime?.createEdgeGlowLayer === 'function',
  };
}

function BreathingPoint({ kind }: { kind: 'cable' | 'vase' }) {
  const point = kind === 'cable' ? cablePoint : vasePoint;
  return (
    <div
      className={`breathing-point breathing-point-${kind}`}
      style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}
    >
      <span />
    </div>
  );
}

function CableRemovalCover() {
  return <div className="cable-removal-cover" aria-hidden="true" />;
}

function shouldRenderMosaicTile(kind: 'cable' | 'vase', x: number, y: number, columns: number, rows: number) {
  const px = columns <= 1 ? 0.5 : x / (columns - 1);
  const py = rows <= 1 ? 0.5 : y / (rows - 1);

  if (kind === 'cable') {
    const rowMasks = [
      [4, 5, 6, 7, 8, 9, 10, 11, 12],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22],
      [3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 20, 21, 22],
      [5, 6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21],
      [8, 9, 10, 11, 12, 17, 18, 19, 20],
    ];
    return rowMasks[y]?.includes(x) ?? false;
  }

  const rowMasks = [
    [5],
    [4, 5, 6],
    [4, 5, 6, 7],
    [2, 3, 4, 5, 6, 7, 8],
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    [2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6],
    [3, 4, 5, 6],
    [3, 4, 5],
    [3, 4, 5],
  ];
  return rowMasks[y]?.includes(x) ?? false;
}

function getMosaicTileColor(kind: 'cable' | 'vase', x: number, y: number, columns: number, rows: number) {
  const px = columns <= 1 ? 0.5 : x / (columns - 1);
  const py = rows <= 1 ? 0.5 : y / (rows - 1);
  const shade = ((x * 19 + y * 31) % 23) - 11;

  if (kind === 'cable') {
    const cablePalette = [
      [220, 205, 192],
      [190, 181, 169],
      [157, 143, 128],
      [126, 109, 94],
      [205, 188, 170],
      [168, 133, 108],
      [104, 82, 65],
      [213, 196, 180],
      [167, 171, 170],
      [191, 132, 108],
    ];
    const pick = (x * 3 + y * 5 + (px > 0.72 ? 4 : 0)) % cablePalette.length;
    const [r, g, b] = cablePalette[pick];
    return `rgba(${Math.max(0, r + shade)}, ${Math.max(0, g + shade)}, ${Math.max(0, b + shade)}, 0.88)`;
  }

  if (py < 0.22) {
    const flowerPalette = [
      [112, 64, 18],
      [133, 83, 22],
      [96, 58, 20],
      [130, 95, 42],
      [87, 20, 16],
    ];
    const [r, g, b] = flowerPalette[(x * 2 + y * 3) % flowerPalette.length];
    return `rgba(${Math.max(0, r + shade)}, ${Math.max(0, g + shade)}, ${Math.max(0, b + shade)}, 0.9)`;
  }

  if (py < 0.58) {
    const tablePalette = [
      [147, 105, 67],
      [126, 92, 52],
      [105, 75, 38],
      [93, 67, 31],
      [150, 119, 77],
      [112, 85, 48],
      [78, 66, 22],
      [83, 80, 25],
    ];
    const [r, g, b] = tablePalette[(x + y * 2) % tablePalette.length];
    return `rgba(${Math.max(0, r + shade)}, ${Math.max(0, g + shade)}, ${Math.max(0, b + shade)}, 0.9)`;
  }

  const vasePalette = [
    [216, 196, 180],
    [188, 153, 124],
    [164, 124, 92],
    [133, 96, 68],
    [94, 60, 38],
    [112, 126, 16],
    [169, 173, 99],
    [191, 93, 94],
    [221, 27, 18],
  ];
  const [r, g, b] = vasePalette[(x * 4 + y) % vasePalette.length];
  return `rgba(${Math.max(0, r + shade)}, ${Math.max(0, g + shade)}, ${Math.max(0, b + shade)}, 0.88)`;
}

function MosaicRegion({ kind }: { kind: 'cable' | 'vase' }) {
  const { columns, rows } = mosaicTileCount[kind];
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;

  return (
    <div className={`mosaic-region mosaic-region-${kind}`} aria-hidden="true">
      {Array.from({ length: columns * rows }, (_, index) => {
        const x = index % columns;
        const y = Math.floor(index / columns);
        if (!shouldRenderMosaicTile(kind, x, y, columns, rows)) return null;

        const distance = Math.hypot(x - centerX, y - centerY);
        const delay = Math.round(distance * 48 + (index % 4) * 22);
        return (
          <span
            key={index}
            style={
              {
                '--delay': `${delay}ms`,
                '--tile-tint': getMosaicTileColor(kind, x, y, columns, rows),
                '--tile-peak': `${0.78 + ((index + y) % 4) * 0.045}`,
                '--tile-rest': `${0.1 + ((index + x) % 3) * 0.025}`,
                gridColumn: x + 1,
                gridRow: y + 1,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function MosaicSpreadEffect() {
  return (
    <div className="mosaic-spread-effect" aria-hidden="true">
      <MosaicRegion kind="vase" />
    </div>
  );
}

function ConfettiBurst() {
  return (
    <div className="confetti-burst" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <span
          key={index}
          style={
            {
              '--angle': `${index * 21}deg`,
              '--distance': `${58 + (index % 5) * 12}px`,
              '--hue': `${index * 33}deg`,
              '--delay': `${index * 22}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function useTypewriterText(text: string, active: boolean) {
  const [visibleText, setVisibleText] = useState(active ? '' : text);

  useEffect(() => {
    if (!active) {
      setVisibleText(text);
      return undefined;
    }

    let index = 0;
    let timeoutId: number | null = null;
    setVisibleText('');

    const tick = () => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index < text.length) {
        timeoutId = window.setTimeout(tick, 58);
      }
    };

    timeoutId = window.setTimeout(tick, 140);
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [active, text]);

  return visibleText;
}

function VoiceInputBubble({
  phase,
  text,
}: {
  phase: 'removePrompt' | 'vasePrompt';
  text: string;
}) {
  const typedText = useTypewriterText(text, true);

  return (
    <div className={`voice-input-bubble voice-input-bubble-${phase}`}>
      <AudioLines size={24} strokeWidth={2.4} />
      <span className="voice-input-text">
        {typedText}
        <span className="voice-input-caret" aria-hidden="true" />
      </span>
    </div>
  );
}

export function App() {
  const [phase, setPhase] = useState<DemoPhase>('initial');
  const [cursorPosition, setCursorPosition] = useState<Point>({ x: 1048, y: 632 });
  const moveTrail = useRef<MoveTrailPoint[]>([]);
  const remoteAIWater = useRemoteAIWater({ phase });

  const setGuidedPhase = useCallback((nextPhase: DemoPhase) => {
    setPhase(nextPhase);
  }, []);

  const setNextPhase = useCallback(() => {
    const index = phaseOrder.indexOf(phase);
    const nextPhase = phaseOrder[Math.min(index + 1, phaseOrder.length - 1)];
    setGuidedPhase(nextPhase);
  }, [phase, setGuidedPhase]);

  useEffect(() => {
    if (phase !== 'processing') return undefined;
    const timer = window.setTimeout(() => setGuidedPhase('completed'), 5600);
    return () => window.clearTimeout(timer);
  }, [phase, setGuidedPhase]);

  useEffect(() => {
    if (phase !== 'cableRemoving') return undefined;
    const timer = window.setTimeout(() => setGuidedPhase('cableRemoved'), 2100);
    return () => window.clearTimeout(timer);
  }, [phase, setGuidedPhase]);

  useEffect(() => {
    if (phase !== 'vasePrompt') return undefined;
    const timer = window.setTimeout(() => setGuidedPhase('processing'), 1650);
    return () => window.clearTimeout(timer);
  }, [phase, setGuidedPhase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (index >= 0 && index < phaseOrder.length) {
        setGuidedPhase(phaseOrder[index]);
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setNextPhase();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setGuidedPhase, setNextPhase]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
      const nextPoint = { x: event.clientX, y: event.clientY };
      setCursorPosition(nextPoint);
      if (phase !== 'initial') return;

      const now = performance.now();
      const previous = moveTrail.current[moveTrail.current.length - 1];
      const deltaX = previous ? nextPoint.x - previous.x : 0;
      const deltaY = previous ? nextPoint.y - previous.y : 0;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const distance = Math.hypot(deltaX, deltaY);

      if (!previous) {
        moveTrail.current = [{ ...nextPoint, t: now, axis: 'x', direction: 1, distance: 0 }];
        return;
      }

      if (distance < 3) return;

      const axis = absX >= absY ? 'x' : 'y';
      const direction = Math.sign(axis === 'x' ? deltaX : deltaY) || 1;
      if (axis !== 'x' || absX < 6 || absX < absY * 1.05) return;

      moveTrail.current = [
        ...moveTrail.current.filter((point) => now - point.t < 1400),
        { ...nextPoint, t: now, axis, direction, distance },
      ];

      const turns = moveTrail.current.reduce((count, point, index, trail) => {
        if (index === 0) return count;
        const previousPoint = trail[index - 1];
        return point.axis === previousPoint.axis && point.direction !== previousPoint.direction ? count + 1 : count;
      }, 0);
      const horizontalDistance = moveTrail.current.reduce((sum, point, index, trail) => {
        if (index === 0) return sum;
        return sum + Math.abs(point.x - trail[index - 1].x);
      }, 0);
      const xValues = moveTrail.current.map((point) => point.x);
      const xSpan = Math.max(...xValues) - Math.min(...xValues);

      if (turns >= 2 && horizontalDistance >= 90 && xSpan >= 36) {
        setGuidedPhase('aiCursor');
        moveTrail.current = [];
      }
    },
    [phase, setGuidedPhase],
  );

  const handleCableClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (phase !== 'aiCursor') return;
    setCursorPosition({ x: event.clientX, y: event.clientY });
    setGuidedPhase('cableRemoving');
  }, [phase, setGuidedPhase]);

  const handleVaseClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (phase !== 'cableRemoved') return;
    setCursorPosition({ x: event.clientX, y: event.clientY });
    setGuidedPhase('vasePrompt');
  }, [phase, setGuidedPhase]);

  const showWaterState = phase !== 'initial';
  const showLocalCursor = showWaterState && phase !== 'completed';
  const showBeforeScene = phase !== 'completed';
  const showAfterScene = phase === 'processing' || phase === 'completed';
  const showCableCover =
    phase === 'cableRemoving';
  const baseSceneUrl =
    phase === 'cableRemoved' || phase === 'vasePrompt' || phase === 'processing' ? noCableSceneUrl : beforeSceneUrl;

  return (
    <main className={`stage phase-${phase}`} onMouseMove={handlePointerMove} onPointerMove={handlePointerMove}>
      <div className="backdrop-gradient" />
      {showWaterState && !remoteAIWater.hasEdgeGlow && (
        <div className="water-aura" aria-hidden="true">
          <span className="aura-edge aura-top" />
          <span className="aura-edge aura-right" />
          <span className="aura-edge aura-bottom" />
          <span className="aura-edge aura-left" />
        </div>
      )}
      <section className="photo-frame" aria-label="水相修图演示">
        <div className="photo-clip">
          {showBeforeScene && <img className="scene-img scene-before" src={baseSceneUrl} alt="" draggable={false} />}
          {showAfterScene && <img className="scene-img scene-after" src={afterSceneUrl} alt="" draggable={false} />}

          {showCableCover && <CableRemovalCover />}

          {phase === 'cableRemoving' && <BreathingPoint kind="cable" />}
          {phase === 'vasePrompt' && <BreathingPoint kind="vase" />}

          {phase === 'processing' && (
            <>
              <MosaicSpreadEffect />
              <ConfettiBurst />
            </>
          )}

          {phase === 'vasePrompt' && <VoiceInputBubble key="vasePrompt" phase="vasePrompt" text="这里加个花瓶" />}

          <button
            className="hotspot hotspot-cable"
            type="button"
            aria-label="选择数据线"
            onClick={handleCableClick}
          />
          <button
            className="hotspot hotspot-vase"
            type="button"
            aria-label="选择桌面空白区域"
            onClick={handleVaseClick}
          />
        </div>
      </section>

      {showLocalCursor && (
        <div className="cursor-layer" style={{ '--cursor-x': `${cursorPosition.x}px`, '--cursor-y': `${cursorPosition.y}px` } as React.CSSProperties}>
          <div className="water-pointer" />
        </div>
      )}
    </main>
  );
}
