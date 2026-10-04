import React, { useEffect, useRef } from 'react';
import { fileUrl } from '../api';

export interface Look {
  game?: string;
  image: string;          // your own picture / GIF / video ('' = the app's own video)
  noDefault: boolean;     // true = no picture at all, just the color
  color: string;          // background color behind everything
  dim: number;            // darkness 0..90 (%)
  fit: 'Fill' | 'Fit' | 'Tile' | 'Center';
  anim: boolean;
  music: { source: 'Off' | 'My music' | 'YouTube Music'; folder: string; volume: number; token: string; port: number };
}
export const defaultLook: Look = { image: '', noDefault: false, color: '#111214', dim: 50, fit: 'Fill', anim: true, music: { source: 'Off', folder: '', volume: 40, token: '', port: 26538 } };
export const DEFAULT_BG = './art/default-bg.mp4';
const isVideo = (p: string) => /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(p);

// The page background: the app's own Lola video (shown whole, with a soft blurred copy on the sides so
// nothing is cut off on wide screens), or your picture / GIF / video, darkened so text stays easy to read.
export const Background: React.FC<{ look: Look }> = ({ look }) => {
  const own = !look.image && !look.noDefault;
  const src = own ? DEFAULT_BG : look.image ? fileUrl(look.image) : '';
  const video = own || (look.image && isVideo(look.image));
  const fit = own ? 'Fit' : look.fit;
  const a = useRef<HTMLVideoElement>(null), b = useRef<HTMLVideoElement>(null);
  useEffect(() => { for (const v of [a.current, b.current]) if (v) { v.muted = true; v.play().catch(() => {}); } }, [src]);
  const objFit = fit === 'Fit' ? 'contain' : fit === 'Center' ? 'none' : 'cover';
  return (
    <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden" style={{ background: look.color || '#111214' }}>
      {src && video && (
        <>
          {fit === 'Fit' && <video ref={b} src={src} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" />}
          <video ref={a} src={src} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full" style={{ objectFit: objFit as any }} />
        </>
      )}
      {src && !video && (fit === 'Tile'
        ? <div className="absolute inset-0" style={{ backgroundImage: `url("${src}")`, backgroundRepeat: 'repeat' }} />
        : <img src={src} className="absolute inset-0 w-full h-full" style={{ objectFit: objFit as any }} />)}
      {src && <div className="absolute inset-0 bg-black" style={{ opacity: Math.min(0.9, (look.dim || 0) / 100) }} />}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(7,8,9,0.75) 100%)' }} />
    </div>
  );
};
